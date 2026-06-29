import { describe, it, expect, vi } from 'vitest';
import {
  determineTaskMode,
  canDescribePatch,
  hasSufficientJSEvidence,
  isErrorDirectlyLocalized,
  detectActiveSymptom,
  TaskMode,
  AgentState,
} from '../state-machine';
import { selectHighestValueTool, rewriteResponseToSingleTool } from '../rewrite-engine';
import { validateControlLoopGuard } from '../control-loop-guard';
import { ChatMessage } from '../../types';
import { detectAndNormalizeWalkthrough } from '../orchestrator';

// Mock fs module using importOriginal to support diff-aware testing
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    existsSync: (p: string) => {
      const norm = p.replace(/\\/g, '/');
      if (norm.includes('file.ts')) return true;
      if (norm.includes('mock/workspace')) return true;
      return actual.existsSync(p);
    },
    statSync: (p: string) => {
      const norm = p.replace(/\\/g, '/');
      if (norm.includes('file.ts')) {
        return { isFile: () => true } as any;
      }
      return actual.statSync(p);
    },
    readFileSync: (p: string, encoding: any) => {
      const norm = p.replace(/\\/g, '/');
      if (norm.includes('file.ts')) {
        return (global as any).__mockFileContent || 'line 1\nline 2\nline 3';
      }
      return actual.readFileSync(p, encoding);
    }
  };
});

// Mock vscode module using importOriginal to preserve shim exports
vi.mock('vscode', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    workspace: {
      ...actual.workspace,
      workspaceFolders: [
        {
          uri: {
            fsPath: '/mock/workspace',
          },
        },
      ],
      getConfiguration: () => ({
        get: (key: string, defaultValue: any) => {
          if (key === 'maxProjectMapLines') return 250;
          return defaultValue;
        },
      }),
    },
  };
});

describe('Agent Orchestrator Modular Components', () => {
  describe('determineTaskMode', () => {
    it('should determine task mode based on user prompt and config mode', () => {
      // VERIFY Mode
      expect(determineTaskMode('please run tests', 'normal')).toBe(TaskMode.VERIFY);
      expect(determineTaskMode('npm run test', 'normal')).toBe(TaskMode.VERIFY);
      expect(determineTaskMode('execute the vitest suite', 'normal')).toBe(TaskMode.VERIFY);

      // IMPLEMENT Mode
      expect(determineTaskMode('create a file named utils.ts', 'normal')).toBe(TaskMode.IMPLEMENT);
      expect(determineTaskMode('write some code', 'normal')).toBe(TaskMode.IMPLEMENT);

      // REVIEW Mode
      expect(determineTaskMode('review the active changes', 'normal')).toBe(TaskMode.REVIEW);
      expect(determineTaskMode('analyze the complexity', 'normal')).toBe(TaskMode.REVIEW);

      // DEBUG Mode
      expect(determineTaskMode('fix the compilation error', 'normal')).toBe(TaskMode.DEBUG);
      expect(determineTaskMode('normal query', 'debug')).toBe(TaskMode.DEBUG);

      // CONVERSATIONAL Mode
      expect(determineTaskMode('how are you?', 'normal')).toBe(TaskMode.CONVERSATIONAL);
      expect(determineTaskMode('hi', 'normal')).toBe(TaskMode.CONVERSATIONAL);
    });
  });

  describe('canDescribePatch', () => {
    it('should return true if prompt has patch intent and mentions verified files', () => {
      const verified = new Set(['/mock/workspace/src/index.ts', '/mock/workspace/src/utils.ts']);
      expect(canDescribePatch('I will now modify index.ts to fix this.', verified)).toBe(true);
      expect(canDescribePatch('I will now write the patch for utils.ts', verified)).toBe(true);
    });

    it('should return false if target file is not in verified list or intent is missing', () => {
      const verified = new Set(['/mock/workspace/src/index.ts']);
      expect(canDescribePatch('I will now modify missing.ts to fix this.', verified)).toBe(false);
      expect(canDescribePatch('Just looking at index.ts', verified)).toBe(false);
    });
  });

  describe('hasSufficientJSEvidence', () => {
    it('should return false for generic crash reports without stack traces', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'The app crashes when I boot it with a JS Exception.' },
      ];
      expect(hasSufficientJSEvidence(messages)).toBe(false);
    });

    it('should return true if crash reports include stack traces or error locations', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'JavaScriptException: NullPointer in index.ts:45\nat run (index.js:12)' },
      ];
      expect(hasSufficientJSEvidence(messages)).toBe(true);
    });
  });

  describe('isErrorDirectlyLocalized', () => {
    it('should return true if error text matches verified files', () => {
      const verified = new Set(['/mock/workspace/src/helper.ts']);
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Compilation error: failed in helper.ts resolving export' },
      ];
      expect(isErrorDirectlyLocalized(messages, verified)).toBe(true);
    });
  });

  describe('detectActiveSymptom', () => {
    it('should detect active symptoms from messages', () => {
      expect(detectActiveSymptom([{ role: 'user', content: '[Build Status]: FAILED' }])).toBe('BUILD_FAILURE');
      expect(detectActiveSymptom([{ role: 'user', content: 'compilation error occurred' }])).toBe('BUILD_FAILURE');
      expect(detectActiveSymptom([{ role: 'user', content: 'failed to fetch network data timeout' }])).toBe('NETWORK_ERROR');
      expect(detectActiveSymptom([{ role: 'user', content: 'invalid credentials or session expired' }])).toBe('AUTH_FAILURE');
      expect(detectActiveSymptom([{ role: 'user', content: 'hello world' }])).toBe('NONE');
    });
  });

  describe('selectHighestValueTool', () => {
    it('should select highest value tool based on symptom and priority', () => {
      const toolCalls = [
        { name: 'read_file', path: 'src/helper.ts' },
        { name: 'grep_search', query: 'export helper' },
      ];
      const messages: ChatMessage[] = [{ role: 'user', content: 'Compilation error: helper.ts' }];
      const result = selectHighestValueTool(toolCalls, messages);
      expect(result.selectedTool.name).toBe('read_file');
    });
  });

  describe('rewriteResponseToSingleTool', () => {
    it('should filter out unselected tool tags', () => {
      const rawText = '<read_file path="src/index.ts" />\n<run_command command="npm test" />';
      const selectedTool = { name: 'run_command', command: 'npm test' };
      const rewritten = rewriteResponseToSingleTool(rawText, selectedTool);
      expect(rewritten).not.toContain('<read_file');
      expect(rewritten).toContain('<run_command');
    });
  });

  describe('validateControlLoopGuard', () => {
    it('should enforce disabled tools in specific modes', () => {
      const tool = { name: 'patch_file', path: 'src/index.ts' };
      const verified = new Set<string>();
      const messages: ChatMessage[] = [];
      const readRangesTracker = new Map();
      const lastSearches: string[] = [];

      const result = validateControlLoopGuard(
        tool,
        TaskMode.REVIEW,
        'normal',
        verified,
        messages,
        0,
        5,
        readRangesTracker,
        lastSearches,
        false,
        AgentState.DISCOVERY,
        [],
        [],
        ''
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not permitted in REVIEW mode');
    });

    it('should warn but allow list_dir if it targets a standard workspace directory', () => {
      const tool = { name: 'list_dir', path: 'src' };
      const verified = new Set<string>();
      const messages: ChatMessage[] = [];
      const readRangesTracker = new Map();
      const lastSearches: string[] = [];

      const result = validateControlLoopGuard(
        tool,
        TaskMode.IMPLEMENT,
        'normal',
        verified,
        messages,
        0,
        5,
        readRangesTracker,
        lastSearches,
        false,
        AgentState.DISCOVERY,
        [],
        [],
        ''
      );

      expect(result.allowed).toBe(true);
      expect(result.warningsToAdd).toBeDefined();
      expect(result.warningsToAdd?.[0]).toContain('already fully detailed in the [PROJECT STRUCTURE] map');
    });
  });

  describe('detectAndNormalizeWalkthrough', () => {
    it('should return untouched if walkthrough tag is already present', () => {
      const response = 'Done! <walkthrough>changes list</walkthrough>';
      expect(detectAndNormalizeWalkthrough(response, 0)).toBe(response);
    });

    it('should return untouched if tools are executed', () => {
      const response = 'Here is the walkthrough of changes: ...';
      expect(detectAndNormalizeWalkthrough(response, 2)).toBe(response);
    });

    it('should auto-wrap from walkthrough keyword if structural indicators exist', () => {
      const response = 'I have finished.\nHere is the walkthrough:\n- Updated index.ts\n- Added helper.ts';
      const normalized = detectAndNormalizeWalkthrough(response, 0);
      expect(normalized).toContain('<walkthrough>');
      expect(normalized).toContain('Here is the walkthrough:\n- Updated index.ts\n- Added helper.ts');
      expect(normalized.startsWith('I have finished.')).toBe(true);
    });

    it('should wrap entire response as fallback if no walkthrough keyword but completion and structure exist', () => {
      const response = 'Task is completed.\n1. Modified parser\n2. Fixed tests';
      const normalized = detectAndNormalizeWalkthrough(response, 0);
      expect(normalized).toBe('<walkthrough>\nTask is completed.\n1. Modified parser\n2. Fixed tests\n</walkthrough>');
    });

    it('should not wrap if it matches preparatory expressions', () => {
      const response = 'I will now write a walkthrough of changes next.';
      expect(detectAndNormalizeWalkthrough(response, 0)).toBe(response);
    });

    it('should return untouched if it is just a conversational query/clarification', () => {
      const response = 'Could you please verify what the target path is?';
      expect(detectAndNormalizeWalkthrough(response, 0)).toBe(response);
    });

    it('should not wrap if list structure is inside a code block', () => {
      const response = 'I completed the task. Check this code:\n```typescript\n// - step 1\n// - step 2\n```';
      expect(detectAndNormalizeWalkthrough(response, 0)).toBe(response);
    });

    it('should not wrap if list structure is inside a blockquote', () => {
      const response = 'I completed the task.\n> - structural list in quote\n> - another item';
      expect(detectAndNormalizeWalkthrough(response, 0)).toBe(response);
    });

    it('should not wrap for casual verb usage of walkthrough', () => {
      const response = 'I need to walkthrough the codebase to identify the layout.';
      expect(detectAndNormalizeWalkthrough(response, 0)).toBe(response);
    });

    it('should not wrap for code discussions mentioning walkthrough class/method/function', () => {
      const response = 'You should declare a walkthrough method like: \n- walkthrough() {\n  return true;\n}';
      expect(detectAndNormalizeWalkthrough(response, 0)).toBe(response);

      const response2 = 'const walkthrough = new WalkthroughService();\n- walkthrough.start();';
      expect(detectAndNormalizeWalkthrough(response2, 0)).toBe(response2);
    });
  });

  describe('Diff-Aware Context Resolution', () => {
    it('should send full content on first resolution, then unchanged, then diff on change', async () => {
      const getSecret = vi.fn().mockResolvedValue('mock-api-key');
      const getChatHistory = () => [];
      const saveChatHistory = vi.fn().mockResolvedValue(undefined);
      const postMessage = vi.fn();
      const getSafePath = (p: string) => `/mock/workspace/${p}`;

      const { AgentOrchestrator } = await import('../orchestrator');
      const orchestrator = new AgentOrchestrator(getSecret, getChatHistory, saveChatHistory, postMessage, getSafePath);

      // Initialize global state for readFileSync mock
      (global as any).__mockFileContent = 'line 1\nline 2\nline 3';

      const placeholder1 = await (orchestrator as any)._resolveFileRefs('Check [file.ts]', 1);
      expect(placeholder1).toBe('Check [File Cache: file.ts]');

      // Manually register it in ContextStore like the eviction system does
      const fileData1 = (orchestrator as any)._virtualPageCache.get('file.ts');
      expect(fileData1).toBeDefined();
      (orchestrator as any)._contextStore.addItem('file:file.ts', fileData1, 'tool', 10, 0, false);

      const res1 = (orchestrator as any)._resolveCachePlaceholders(placeholder1);
      expect(res1).toContain('line 1\nline 2\nline 3');
      expect(res1).toContain('```ts:file.ts');

      const placeholder2 = await (orchestrator as any)._resolveFileRefs('Check [file.ts] again', 2);
      // Ensure it's in ContextStore
      const fileData2 = (orchestrator as any)._virtualPageCache.get('file.ts');
      (orchestrator as any)._contextStore.addItem('file:file.ts', fileData2, 'tool', 10, 0, false);
      const res2 = (orchestrator as any)._resolveCachePlaceholders(placeholder2);
      expect(res2).toContain('[File: file.ts (unchanged since last sent)]');

      (global as any).__mockFileContent = 'line 1\nline 2 updated\nline 3';
      const placeholder3 = await (orchestrator as any)._resolveFileRefs('Check [file.ts] third time', 3);
      // Ensure updated file is in ContextStore
      const fileData3 = (orchestrator as any)._virtualPageCache.get('file.ts');
      (orchestrator as any)._contextStore.addItem('file:file.ts', fileData3, 'tool', 10, 0, false);
      const res3 = (orchestrator as any)._resolveCachePlaceholders(placeholder3);
      expect(res3).toContain('[File: file.ts (diff since last sent)]');
      expect(res3).toContain('+ line 2 updated');
      expect(res3).toContain('- line 2');
    });
  });
});

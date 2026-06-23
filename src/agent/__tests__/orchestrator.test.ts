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
  });
});

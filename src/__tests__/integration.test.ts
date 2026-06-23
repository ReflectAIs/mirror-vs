import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AgentOrchestrator } from '../agent/orchestrator';
import { MockLLMProvider } from '../services/providers/__mocks__/mock-llm';
import { ChatMessage } from '../types';

// Declare temp workspace path for use in test hooks
const testWorkspacePath = path.join(__dirname, '__temp_integration_workspace__');

function createTempDir() {
  if (!fs.existsSync(testWorkspacePath)) {
    fs.mkdirSync(testWorkspacePath, { recursive: true });
  }
}

function cleanupTempDir() {
  if (fs.existsSync(testWorkspacePath)) {
    fs.rmSync(testWorkspacePath, { recursive: true, force: true });
  }
}

// Mock vscode and define fsPath inside the hoisted block to avoid referencing outer scope variables
vi.mock('vscode', async (importOriginal) => {
  const actual = await importOriginal<any>();
  const pathModule = await import('path');
  const workspacePath = pathModule.join(__dirname, '__temp_integration_workspace__');
  
  return {
    ...actual,
    workspace: {
      ...actual.workspace,
      workspaceFolders: [
        {
          uri: {
            fsPath: workspacePath,
          },
        },
      ],
      getConfiguration: () => ({
        get: (key: string, defaultValue: any) => {
          if (key === 'defaultProvider') return 'gemini';
          if (key === 'geminiModel') return 'gemini-2.0-flash';
          return defaultValue;
        },
        inspect: () => ({ globalValue: undefined, workspaceValue: undefined }),
      }),
    },
  };
});

// Mock GeminiProvider specifically, since the orchestrator defaults to Gemini
vi.mock('../services/providers/gemini-provider.js', () => {
  return {
    GeminiProvider: class extends MockLLMProvider {}
  };
});
vi.mock('../services/providers/gemini-provider', () => {
  return {
    GeminiProvider: class extends MockLLMProvider {}
  };
});
vi.mock('../../services/providers/gemini-provider.js', () => {
  return {
    GeminiProvider: class extends MockLLMProvider {}
  };
});
vi.mock('../../services/providers/gemini-provider', () => {
  return {
    GeminiProvider: class extends MockLLMProvider {}
  };
});

// Mock the provider index to return our MockLLMProvider
vi.mock('../../services/providers/index.js', () => {
  return {
    createProvider: () => new MockLLMProvider(),
    GeminiProvider: class extends MockLLMProvider {},
  };
});

vi.mock('../../services/providers/index', () => {
  return {
    createProvider: () => new MockLLMProvider(),
    GeminiProvider: class extends MockLLMProvider {},
  };
});

vi.mock('../services/providers/index.js', () => {
  return {
    createProvider: () => new MockLLMProvider(),
    GeminiProvider: class extends MockLLMProvider {},
  };
});

vi.mock('../services/providers/index', () => {
  return {
    createProvider: () => new MockLLMProvider(),
    GeminiProvider: class extends MockLLMProvider {},
  };
});

describe('Orchestrator Integration Test with Mock LLM', () => {
  beforeEach(() => {
    createTempDir();
    MockLLMProvider.reset();
    
    // Spy on _gitExec to return dummy values instead of spawning git
    vi.spyOn(AgentOrchestrator.prototype as any, '_gitExec').mockImplementation((args: string[]) => {
      if (args.includes('rev-parse')) {
        return 'true';
      }
      if (args.includes('log')) {
        return 'commit_hash';
      }
      return '';
    });
  });

  afterEach(() => {
    cleanupTempDir();
    vi.restoreAllMocks();
  });

  it('should run a simple agent loop executing a wait tool and completing', async () => {
    // 1. Setup mock LLM answers
    // First turn: model requests wait tool
    const turn1 = 'I will wait for a short duration. <wait ms="100" />';
    // Second turn: model concludes task
    const turn2 = 'I have successfully waited and completed the task. <walkthrough>Completed wait task</walkthrough>';
    
    MockLLMProvider.setMockResponses([turn1, turn2]);

    // 2. Setup Orchestrator constructor arguments
    const getSecret = vi.fn().mockResolvedValue('mock-api-key');
    const getChatHistory = () => [];
    const saveChatHistory = vi.fn().mockResolvedValue(undefined);
    
    const postMessages: any[] = [];
    const postMessage = (msg: any) => {
      postMessages.push(msg);
    };
    
    const getSafePath = (p: string) => path.join(testWorkspacePath, p);

    const orchestrator = new AgentOrchestrator(
      getSecret,
      getChatHistory,
      saveChatHistory,
      postMessage,
      getSafePath
    );

    // 3. Trigger orchestrator message handling stream
    await orchestrator.handleMessageStream('Please wait 100ms', []);

    // 4. Verify messages exchanged
    const tokenUsageEvents = postMessages.filter(m => m.type === 'tokenUsage');
    expect(tokenUsageEvents.length).toBeGreaterThan(0);

    const toolEvents = postMessages.filter(m => m.type === 'toolStatus');
    expect(toolEvents.some(te => te.toolName === 'wait' && te.status === 'running')).toBe(true);

    const loopCompleted = postMessages.some(m => m.type === 'loopComplete');
    expect(loopCompleted).toBe(true);
  });

  it('should auto-wrap walkthrough tags if model forgets them but outputs the word walkthrough', async () => {
    const turn1 = 'Here is my walkthrough of changes: everything is completed and verified.';
    MockLLMProvider.setMockResponses([turn1]);

    const getSecret = vi.fn().mockResolvedValue('mock-api-key');
    const getChatHistory = () => [];
    const saveChatHistory = vi.fn().mockResolvedValue(undefined);
    
    const postMessages: any[] = [];
    const postMessage = (msg: any) => {
      postMessages.push(msg);
    };
    
    const getSafePath = (p: string) => path.join(testWorkspacePath, p);

    const orchestrator = new AgentOrchestrator(
      getSecret,
      getChatHistory,
      saveChatHistory,
      postMessage,
      getSafePath
    );

    await orchestrator.handleMessageStream('Review changes', []);

    // Verify walkthrough file was created in mock workspace
    const walkthroughPath = path.join(testWorkspacePath, '.mirror-vs', 'walkthrough.md');
    expect(fs.existsSync(walkthroughPath)).toBe(true);

    const loopCompleted = postMessages.find(m => m.type === 'loopComplete');
    expect(loopCompleted?.completed).toBe(true);
  });
});

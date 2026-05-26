
import * as vscode from 'vscode';
import { LLMProvider, ChatMessage } from '../types';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import { buildSystemPrompt } from './orchestrator';

/**
 * Manages agent session state, history, git baseline, avatar state,
 * and settings retrieval.
 */
export class AgentSession {
  private _currentSessionId: string = '';

  constructor(
    private readonly _getSecret: (key: string) => Promise<string | undefined>,
    private readonly _getChatHistory: () => ChatMessage[],
    private readonly _saveChatHistory: (history: ChatMessage[]) => Promise<void>,
    private readonly _postMessage: (msg: Record<string, unknown>) => void,
    private readonly _getSafePath: (targetPath: string) => string,
  ) {}

  public get sessionId(): string {
    return this._currentSessionId;
  }

  public set sessionId(id: string) {
    this._currentSessionId = id;
  }

  public get history(): ChatMessage[] {
    return this._getChatHistory();
  }

  public async saveHistory(history: ChatMessage[]): Promise<void> {
    await this._saveChatHistory(history);
  }

  public getSafePath(p: string): string {
    return this._getSafePath(p);
  }

  public postMessage(msg: any): void {
    this._postMessage(msg);
  }

  public async getSecret(key: string): Promise<string | undefined> {
    return this._getSecret(key);
  }

  /**
   * Ensures the workspace has a git repo with a clean baseline commit so that
   * every agent file write shows up as a coloured diff gutter (yellow/green/red) in VS Code.
   */
  private _gitExec(args: string[], workspaceFolder: string): string {
    try { return execFileSync('git', args, { cwd: workspaceFolder, encoding: 'utf8', stdio: 'pipe' }); }
    catch { return ''; }
  }

  public async ensureGitBaseline(): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) {
      return;
    }

    // 1. Init git if not already a repo
    const isRepo = this._gitExec(['rev-parse', '--is-inside-work-tree'], workspaceFolder).trim() === 'true';
    if (!isRepo) {
      this._gitExec(['init'], workspaceFolder);
    }

    // 2. Ensure .gitignore has noise exclusions
    const gitignorePath = `${workspaceFolder}/.gitignore`;
    let gitignoreContent = '';
    try {
      gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
    } catch {
      /* file may not exist */
    }
    const patterns = ['node_modules/', '.mirror-vs/', 'turns.log'];
    const missingPatterns = patterns.filter((p) => !gitignoreContent.includes(p));
    if (missingPatterns.length > 0) {
      const newContent = gitignoreContent.trimEnd() + '\n' + missingPatterns.join('\n') + '\n';
      fs.writeFileSync(gitignorePath, newContent, 'utf8');
      this._gitExec(['add', '.gitignore'], workspaceFolder);
    }

    // 3. Check if there are any tracked modified files already — commit them as baseline
    const dirty = this._gitExec(['status', '--porcelain'], workspaceFolder).trim();
    if (dirty) {
      this._gitExec(['add', '-A'], workspaceFolder);
      // Only commit tracked files — untracked files (new) will remain unstaged so they show green in VS Code
      this._gitExec(['commit', '-m', 'Mirror VS: baseline snapshot before agent task'], workspaceFolder);
    } else {
      // Ensure at least one commit exists (needed for diff gutters to work)
      const hasCommit = this._gitExec(['log', '--oneline', '-1'], workspaceFolder).trim();
      if (!hasCommit) {
        this._gitExec(['add', '-A'], workspaceFolder);
        this._gitExec(['commit', '-m', 'Mirror VS: initial baseline'], workspaceFolder);
      }
    }
  }

  /** Send avatar state change to the webview for interactive buddy animation */
  public sendAvatarState(state: 'idle' | 'thinking' | 'coding' | 'tool_calling' | 'error') {
    this._postMessage({ type: 'avatarState', state });
  }

  /** Retrieve VS Code extension configuration */
  public getConfig() {
    return vscode.workspace.getConfiguration('mirror-vs');
  }

  /** Retrieve provider settings */
  public getProviderSettings() {
    const config = this.getConfig();
    const provider = config.get<LLMProvider>('defaultProvider', 'ollama');
    const ollamaHost = config.get<string>('ollamaHost', 'http://localhost:11434');
    const defaultOllamaModel = config.get<string>('defaultOllamaModel', 'llama3');
    const defaultDeepSeekModel = config.get<string>('defaultDeepSeekModel', 'deepseek-chat');
    const maxTurns = config.get<number>('maxTurnsBeforeSummarize', 16);
    const turnsToRetain = config.get<number>('turnsToRetain', 6);

    return { provider, ollamaHost, defaultOllamaModel, defaultDeepSeekModel, maxTurns, turnsToRetain };
  }

  /** Try to get API key for a provider */
  public async getApiKey(provider: LLMProvider): Promise<string> {
    if (provider === 'deepseek') {
      const key = (await this._getSecret('deepseek_api_key')) || '';
      return key;
    }
    return '';
  }

  /** Write tool execution turn to turns.log */
  public logTurn(assistantResponse: string, combinedToolResult: string, isMalformed?: boolean, errorMsg?: string): void {
    try {
      const logFilePath = this._getSafePath('turns.log');
      const timestamp = new Date().toISOString();
      const systemContent = buildSystemPrompt();
      let logEntry: string;

      if (isMalformed && errorMsg) {
        logEntry = `
========================================
[TURN TIMESTAMP: ${timestamp}]
========================================
MODEL GENERATED (MALFORMED TOOL TAG):
${assistantResponse}

SYSTEM RECOVERY:
${errorMsg}

========================================
\n`;
      } else if (combinedToolResult) {
        logEntry = `
========================================
[TURN TIMESTAMP: ${timestamp}]
========================================
SYSTEM RULES:
${systemContent}

MODEL GENERATED:
${assistantResponse}

USER/ENVIRONMENT TOOL RESPONSE:
${combinedToolResult}

========================================
\n`;
      } else {
        logEntry = `
========================================
[TURN TIMESTAMP: ${timestamp}]
========================================
SYSTEM RULES:
${systemContent}

MODEL GENERATED:
${assistantResponse}

USER/ENVIRONMENT TOOL RESPONSE:
(No tool calls made in this turn - loop complete)

========================================
\n`;
      }

      fs.appendFileSync(logFilePath, logEntry, 'utf8');
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn('Failed to write to turns.log:', message);
    }
  }
}

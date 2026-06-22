import * as vscode from 'vscode';
import { ChatMessage, LLMProvider } from '../types';
import { executeTool } from './tools/tool-registry';
import { getDependentsOfFile } from './tools/code-analysis-tools';
import { RateLimiter } from '../services/rate-limiter';
import { ProviderFallback } from '../services/provider-fallback';
import { AgentSession } from './agent-session';
import { AgentParser } from './agent-parser';
import { AgentCompleter } from './agent-completer';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { getModelContextWindow, estimateTokenCount, estimatePayloadTokens } from './orchestrator-config';
import {
  buildSystemPrompt,
  hasDeclaredPlan,
  hasActionPlanningIntent,
  getDiagnosticsForFile,
} from './orchestrator-prompt';
import { AgentMemoryService } from '../services/agent-memory-service';
import { ArtifactService } from '../services/artifact-service';
import { getToolSchemas, supportsNativeToolCalling } from './tool-schemas';
import { NativeToolCallParser } from './native-tool-call-parser';

// P0 imports
import { getContextLength, estimateTokens } from '../services/model-context';
import { computeInputTokenBudget } from '../services/context-budget';
import { maybeCompact, trimForContext } from '../services/context-compactor';
import { evaluateTurnResult } from './failure-detector';

// P1 imports
import { untrustedContextMessage, sanitizeUserPrompt } from './prompt-security';
import { getDisabledToolsForMode } from './tool-policy';
import { injectRelevantSkills } from '../services/skill-service';
import { maybeEscalate } from './teacher-escalation';
import { EventBus } from '../services/event-bus';

export enum AgentState {
  DISCOVERY = 'DISCOVERY',
  IMPLEMENTATION = 'IMPLEMENTATION',
  VERIFICATION = 'VERIFICATION',
  BLOCKED = 'BLOCKED',
  NEEDS_EVIDENCE = 'NEEDS_EVIDENCE',
}

export enum TaskMode {
  REVIEW = 'REVIEW',
  DEBUG = 'DEBUG',
  IMPLEMENT = 'IMPLEMENT',
  VERIFY = 'VERIFY',
}

export function determineTaskMode(userMessage: string, configMode: string): TaskMode {
  const lower = userMessage.toLowerCase();
  
  // If the user request contains file creation, modification, building, or setup/creation verbs,
  // we must allow IMPLEMENT/VERIFY mode rather than locking it to read-only REVIEW/DEBUG.
  const isWriteOrSetupAction = [
    'create', 'build', 'write', 'generate', 'setup', 'init', 'install', 'add', 'make',
    'implement', 'change', 'modify', 'update', 'patch', 'delete', 'remove', 'run', 'start', 'dev'
  ].some((verb) => new RegExp(`\\b${verb}\\b`, 'i').test(lower));

  if (
    lower.includes('run test') ||
    lower.includes('run lint') ||
    lower.includes('run build') ||
    lower.includes('npm test') ||
    lower.includes('npm run test') ||
    lower.includes('vitest') ||
    lower.includes('eslint') ||
    lower.includes('typecheck') ||
    /^(run|execute|perform|verify) (the )?(tests?|build|lint|typecheck)/i.test(lower)
  ) {
    return TaskMode.VERIFY;
  }

  if (isWriteOrSetupAction) {
    return TaskMode.IMPLEMENT;
  }

  if (
    ['review', 'audit', 'analyze', 'improvements', 'feedback', 'architecture review', 'frontend review'].some(
      (keyword) => lower.includes(keyword),
    )
  ) {
    return TaskMode.REVIEW;
  }
  if (
    configMode === 'debug' ||
    lower.includes('bug') ||
    lower.includes('fix') ||
    lower.includes('error') ||
    lower.includes('crash') ||
    lower.includes('fail')
  ) {
    return TaskMode.DEBUG;
  }
  return TaskMode.IMPLEMENT;
}

export class AgentOrchestrator {
  private _activeAbortController: AbortController | undefined;
  private readonly _rateLimiter = RateLimiter.getInstance();
  private readonly _fallback = ProviderFallback.getInstance();
  private readonly _parser = new AgentParser();
  private readonly _session: AgentSession;
  private readonly _completer: AgentCompleter;

  private _activeMessages: ChatMessage[] | undefined;

  constructor(
    private readonly _getSecret: (key: string) => Promise<string | undefined>,
    _getChatHistory: () => ChatMessage[],
    private readonly _saveChatHistory: (history: ChatMessage[]) => Promise<void>,
    private readonly _postMessage: (msg: any) => void,
    private readonly _getSafePath: (targetPath: string) => string,
  ) {
    this._session = new AgentSession(_getSecret, _getChatHistory, _saveChatHistory, _postMessage, _getSafePath);
    this._completer = new AgentCompleter(_postMessage);
  }

  private _getOrCreateActiveMessages(incomingHistory: ChatMessage[]): ChatMessage[] {
    if (!this._activeMessages) {
      this._activeMessages = [...incomingHistory];
      return this._activeMessages;
    }

    // Filter out system messages and summarized messages to compare the actual conversation sequence
    const cachedConvo = this._activeMessages.filter((m) => m.role !== 'system' && !m.summarized);
    const incomingConvo = incomingHistory.filter((m) => m.role !== 'system' && !m.summarized);

    // Check if the cached conversation is a prefix of the incoming conversation
    let isMatch = cachedConvo.length <= incomingConvo.length;
    if (isMatch) {
      for (let i = 0; i < cachedConvo.length; i++) {
        if (
          cachedConvo[i].role !== incomingConvo[i].role ||
          cachedConvo[i].content !== incomingConvo[i].content
        ) {
          isMatch = false;
          break;
        }
      }
    }

    if (isMatch) {
      // Find the new messages in incomingHistory that are not in this._activeMessages
      let newMessagesStartIdx = 0;
      const lastAlignedMsg = cachedConvo[cachedConvo.length - 1];
      if (lastAlignedMsg) {
        for (let i = incomingHistory.length - 1; i >= 0; i--) {
          const m = incomingHistory[i];
          if (m.role === lastAlignedMsg.role && m.content === lastAlignedMsg.content) {
            newMessagesStartIdx = i + 1;
            break;
          }
        }
      }
      
      const newMessages = incomingHistory.slice(newMessagesStartIdx);
      this._activeMessages = [...this._activeMessages, ...newMessages];
    } else {
      this._activeMessages = [...incomingHistory];
    }

    return this._activeMessages;
  }

  public cancelActiveStream() {
    if (this._activeAbortController) {
      this._activeAbortController.abort();
      this._activeAbortController = undefined;
    }
  }

  private _gitExec(args: string[], workspaceFolder: string): string {
    try {
      return execFileSync('git', args, { cwd: workspaceFolder, encoding: 'utf8', stdio: 'pipe' });
    } catch {
      console.error('_gitExec failed: no variable captured in catch');
      return '';
    }
  }

  private async _ensureGitBaseline(): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) return;
    const isRepo = this._gitExec(['rev-parse', '--is-inside-work-tree'], workspaceFolder).trim() === 'true';
    if (!isRepo) this._gitExec(['init'], workspaceFolder);
    const gitignorePath = workspaceFolder + '/.gitignore';
    let gitignoreContent = '';
    try {
      gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
    } catch {
      // 'e' not captured in no-param catch block
      console.error('Failed to read .gitignore');
      /* ignore */
    }
    const patterns = ['node_modules/', '.mirror-vs/', 'turns.log'];
    const missing = patterns.filter((p) => !gitignoreContent.includes(p));
    if (missing.length > 0) {
      fs.writeFileSync(gitignorePath, gitignoreContent.trimEnd() + '\n' + missing.join('\n') + '\n', 'utf8');
      this._gitExec(['add', '.gitignore'], workspaceFolder);
    }

    // Ensure at least one commit exists in the repo so that standard git commands function properly,
    // but NEVER automatically stage or commit the developer's dirty workspace changes.
    const hasCommit = this._gitExec(['log', '--oneline', '-1'], workspaceFolder).trim();
    if (!hasCommit) {
      this._gitExec(['commit', '--allow-empty', '-m', 'Mirror VS: initial empty baseline'], workspaceFolder);
    }
  }

  private _sendAvatarState(state: 'idle' | 'thinking' | 'coding' | 'tool_calling' | 'error') {
    this._postMessage({ type: 'avatarState', state });
  }

  private _sendToolStatusToWebview(
    toolName: string,
    status: 'running' | 'success' | 'error',
    target: string,
    result?: string,
    checkpointId?: string,
    code?: string,
    terminalName?: string,
  ) {
    this._postMessage({
      type: 'toolStatus',
      toolName,
      status,
      target,
      result,
      checkpointId,
      code,
      terminalName,
    });
  }

  public async handleMessageStream(text: string, history: ChatMessage[], images?: string[]) {
    try {
      this.cancelActiveStream();
      this._activeAbortController = new AbortController();
      const signal = this._activeAbortController.signal;
      this._sendAvatarState('thinking');

      const config = vscode.workspace.getConfiguration('mirror-vs');
      let provider = config.get<string>('defaultProvider', 'ollama') as string;
      const ollamaHost = config.get<string>('ollamaHost', 'http://localhost:11434') as string;
      const defaultOllamaModel = config.get<string>('defaultOllamaModel', 'llama3') as string;
      const defaultDeepSeekModel = config.get<string>('defaultDeepSeekModel', 'deepseek-v4-pro') as string;
      this._session.sessionId = 'session_' + Date.now();
      EventBus.getInstance().fire('session_started', { sessionId: this._session.sessionId });

      // Rate limiter: image budget
      if (images && images.length > 0) {
        const imageCheck = this._rateLimiter.checkImageBudget(images.length);
        if (!imageCheck.allowed) {
          this._postMessage({ type: 'chatResponseError', error: imageCheck.reason });
          return;
        }
      }

      // Circuit breaker
      const circuitCheck = this._rateLimiter.checkCircuitBreaker();
      if (!circuitCheck.allowed) {
        this._postMessage({ type: 'chatResponseError', error: circuitCheck.reason });
        return;
      }

      this._fallback.reset(provider as LLMProvider);

      let apiKey = '';
      const tryGetApiKey = async (p: string): Promise<string> => {
        console.log(`[Orchestrator] tryGetApiKey called for provider: ${p}`);
        if (p === 'deepseek') {
          const key = (await this._getSecret('deepseek_api_key')) || '';
          console.log(`[Orchestrator] deepseek key length: ${key ? key.length : 0}`);
          return key;
        }
        if (p === 'gemini') {
          const key = (await this._getSecret('gemini_api_key')) || '';
          console.log(`[Orchestrator] gemini key length: ${key ? key.length : 0}`);
          return key;
        }
        if (p === 'openrouter') {
          const key = (await this._getSecret('openrouter_api_key')) || '';
          console.log(`[Orchestrator] openrouter key length: ${key ? key.length : 0}`);
          return key;
        }
        if (p === 'litellm') {
          const key = (await this._getSecret('litellm_api_key')) || '';
          console.log(`[Orchestrator] litellm key length: ${key ? key.length : 0}`);
          return key;
        }
        if (p === 'custom') {
          const key = (await this._getSecret('custom_endpoint_api_key')) || '';
          console.log(`[Orchestrator] custom key length: ${key ? key.length : 0}`);
          return key;
        }
        if (typeof p === 'string' && p.startsWith('custom_')) {
          const key = (await this._getSecret(`custom_api_key_${p}`)) || '';
          console.log(`[Orchestrator] custom dynamic key length: ${key ? key.length : 0}`);
          return key;
        }
        return '';
      };
      apiKey = await tryGetApiKey(provider);

      if (provider === 'deepseek' && !apiKey) {
        this._postMessage({ type: 'chatResponseError', error: 'DeepSeek API Key is missing.' });
        return;
      }

      const estimatedInputTokens =
        RateLimiter.estimateTokens(text || '') +
        (images || []).reduce((sum, img) => sum + Math.ceil(img.length / 1000), 0);
      const sessionCheck = this._rateLimiter.checkSessionBudget(this._session.sessionId, estimatedInputTokens);
      if (!sessionCheck.allowed) {
        this._postMessage({ type: 'chatResponseError', error: sessionCheck.reason });
        return;
      }

      let currentMessages = [...history];

      if (text || (images && images.length > 0)) {
        const safeContent = sanitizeUserPrompt(text || '[Image provided]');
        const userMsg: ChatMessage = { role: 'user', content: safeContent };
        if (images && images.length > 0) userMsg.images = images;
        currentMessages.push(userMsg);
        await this._saveChatHistory(currentMessages);
      }

      // Inject task-relevant learned skills into conversation context (P1.3)
      currentMessages = injectRelevantSkills(currentMessages, text || '');
      let activeMessages = this._getOrCreateActiveMessages(currentMessages);
      activeMessages = injectRelevantSkills(activeMessages, text || '');

      const pushToHistory = (msg: ChatMessage) => {
        currentMessages.push(msg);
        activeMessages.push(msg);
      };

      await this._ensureGitBaseline();

      // Auto-inject lightweight project map if this is the first turn and history doesn't already have it
      const hasProjectMap = currentMessages.some(
        (msg) => msg.role === 'system' && msg.content.includes('[PROJECT STRUCTURE]'),
      );
      const folders = vscode.workspace.workspaceFolders;
      if (!hasProjectMap && folders && folders.length > 0) {
        try {
          const workspaceRoot = folders[0].uri.fsPath;
          const projectMap = await this._generateLightweightProjectMap(workspaceRoot);
          const mapMsg: ChatMessage = {
            role: 'system',
            content: [
              '[PROJECT STRUCTURE]',
              'Here is the full workspace structure to help you orient yourself.',
              '',
              '**How to use this map:**',
              '- The tree shows every source file (4 levels deep) with a one-line description extracted from its top comment.',
              '- The "Source File Index" at the bottom lists every source file with its exact relative path.',
              '- Always use paths from the Source File Index when calling `read_file`, `patch_file`, `grep_search`, or `create_file`. Do NOT guess paths.',
              '- Run `<graphify />` if you need per-module exports, import chains, or the most-imported core modules.',
              '- Run `<analyze_dependencies />` for circular dependency detection.',
              '',
              '```',
              projectMap,
              '```',
            ].join('\n'),
          };
          currentMessages.unshift(mapMsg);
          activeMessages.unshift(mapMsg);
          await this._saveChatHistory(currentMessages);
        } catch (e) {
          console.warn('Failed to generate project map:', e);
        }
      }

      let loopCount = 0;
      const maxLoops = 50;
      let continueLoop = true;
      // let lastEvictionLoopCount = -1; // Track which loop iteration last performed eviction
      let consecutiveMalformedCount = 0;
      const maxMalformedRetries = 3;
      let sequentialExploratorySteps = 0;
      // Track consecutive patch failures to inject corrective guidance
      let consecutivePatchFailures = 0;
      let lastPatchFailedPath = '';

      // Generic failure detection tracking
      let consecutiveToolFailures = 0;
      let lastFailedToolKey = '';
      let consecutiveVerbalGiveUps = 0;

      // Agent Control Loop Guard State Tracking (Eradicates Execution Paralysis)
      const activeMode = config.get<string>('agentMode', 'normal');
      const taskMode = determineTaskMode(text || '', activeMode);
      let searchCount = 0;
      const maxSearchBudget = (() => {
        switch (taskMode) {
          case TaskMode.REVIEW:
            return 2;
          case TaskMode.IMPLEMENT:
            return 4;
          case TaskMode.DEBUG:
            return activeMode === 'debug' ? 15 : 6;
          case TaskMode.VERIFY:
            return 6;
          default:
            return 6;
        }
      })();
      const readRangesTracker = new Map<string, { hash: string; ranges: Set<string> }>();
      const verifiedFiles = new Set<string>();
      const lastSearches: string[] = [];
      let hasCommittedToPatch = false;
      let agentState = AgentState.DISCOVERY;
      let pendingActions: any[] = [];
      let lastSymptom = 'NONE';
      let lastRewriteTelemetry: any = null;
      console.log(`[Orchestrator] TaskMode resolved: ${taskMode}, searchBudget: ${maxSearchBudget}`);

      // Architecture Constraint & Scope Lock State
      let featureOwner = '';
      let allowedScopes: string[] = [];
      let blockedScopes: string[] = [];

      // Initialize routing from history if it exists
      for (const msg of currentMessages) {
        if (msg.role === 'assistant') {
          const routingMatch = msg.content.match(/<architecture_routing>([\s\S]*?)<\/architecture_routing>/i);
          if (routingMatch) {
            const blockContent = routingMatch[1];
            const lines = blockContent.split('\n');
            for (const line of lines) {
              const parts = line.split(':');
              if (parts.length >= 2) {
                const key = parts[0].trim().toUpperCase();
                const value = parts.slice(1).join(':').trim();
                if (key === 'FEATURE_OWNER') {
                  featureOwner = value;
                } else if (key === 'SEARCH_SCOPE_ALLOWED') {
                  allowedScopes = value
                    .split(',')
                    .map((s) => s.trim().toLowerCase())
                    .filter(Boolean);
                } else if (key === 'SEARCH_SCOPE_BLOCKED') {
                  blockedScopes = value
                    .split(',')
                    .map((s) => s.trim().toLowerCase())
                    .filter(Boolean);
                }
              }
            }
          }
        }
      }

      // Accumulated warnings for the current turn (fed back as system messages)
      let activeWarnings: string[] = [];

      const validateControlLoopGuard = (tool: any): { allowed: boolean; warning?: string; reason?: string } => {
        // Mode-specific tool gating (P2.1)
        const allRegisteredTools = new Set([
          'read_file',
          'create_file',
          'write_file',
          'patch_file',
          'multi_patch_file',
          'list_dir',
          'grep_search',
          'semantic_search',
          'web_search',
          'get_diagnostics',
          'browser_navigate',
          'browser_click',
          'browser_type',
          'browser_evaluate_script',
          'analyze_project',
          'analyze_dependencies',
          'analyze_complexity',
          'analyze_coverage',
          'analyze_dead_code',
          'analyze_impact',
          'graphify',
          'wait',
          'browser_screenshot',
          'run_command',
          'send_terminal_input',
          'close_terminal',
          'read_terminal',
          'list_terminals',
          'figma_inspect',
          'update_agent_memory',
        ]);
        const disabledTools = getDisabledToolsForMode(taskMode, allRegisteredTools);
        if (disabledTools.has(tool.name)) {
          return {
            allowed: false,
            reason: `Tool execution is blocked: the tool "${tool.name}" is not permitted in ${taskMode} mode.`,
          };
        }

        if (agentState === AgentState.NEEDS_EVIDENCE) {
          return {
            allowed: true,
            warning: `[Needs Evidence Reminder]: You lack the JS stack trace or crash logs. Consider asking the user for diagnostic info (Logcat, RedBox, etc.) before patching.`,
          };
        }

        const target = tool.path || tool.query || tool.url || tool.selector || tool.command || '';
        const isSearchOrRead = [
          'read_file',
          'grep_search',
          'symbol_search',
          'list_dir',
          'web_search',
          'git_status',
          'git_diff',
        ].includes(tool.name);

        if (isSearchOrRead) {
          // 0a. Review Sufficiency (warn, don't block)
          if (hasEnoughInformationForReview(taskMode, verifiedFiles, currentMessages)) {
            activeWarnings.push(
              `[Review]: You have read ${verifiedFiles.size} file(s) — consider outputting your findings soon.`,
            );
          }

          // 0b. Error Localized (warn, don't block)
          if (isErrorDirectlyLocalized(currentMessages, verifiedFiles)) {
            activeWarnings.push(`[Error Localized]: The failing file has been inspected. You may be ready to patch.`);
          }

          // 1. Commitment Lock (warn, don't block)
          if (hasCommittedToPatch && activeMode !== 'debug') {
            activeWarnings.push(
              `[Commitment]: You declared you are ready to patch. Prefer implementation over further exploration.`,
            );
          }

          // 2. Search Budget (warn, don't block)
          if (searchCount >= maxSearchBudget) {
            activeWarnings.push(
              `[Search Budget]: ${maxSearchBudget} searches used. Consider patching or explaining what's missing.`,
            );
          }

          // 3. "No Re-Read" (warn, don't block — still track)
          if (tool.name === 'read_file' && activeMode !== 'debug') {
            const startLine = tool.start_line || 1;
            const endLine = tool.end_line || 1000;
            const rangeKey = `${startLine}-${endLine}`;
            const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
            const fullPath = tool.path
              ? path.isAbsolute(tool.path)
                ? tool.path
                : path.join(workspacePath, tool.path)
              : '';

            let currentHash = '';
            try {
              if (fullPath && fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
                const content = fs.readFileSync(fullPath);
                currentHash = crypto.createHash('sha256').update(content).digest('hex');
              }
            } catch {
              console.error('Failed to hash file for diff check');
              // ignore
            }

            let tracker = readRangesTracker.get(fullPath);
            if (!tracker || tracker.hash !== currentHash) {
              tracker = { hash: currentHash, ranges: new Set<string>() };
              readRangesTracker.set(fullPath, tracker);
            }

            if (tracker.ranges.has(rangeKey)) {
              activeWarnings.push(
                `[Re-Read]: Already read "${tool.path}" (lines ${startLine}-${endLine}). Skipping may save time.`,
              );
            }
            tracker.ranges.add(rangeKey);
          }

          // 4. Convergence Detector (warn, don't block)
          searchCount++;
          const searchKey = `${tool.name}:${target}`;
          lastSearches.push(searchKey);
          if (lastSearches.length > 5) lastSearches.shift();

          if (lastSearches.length >= 3 && lastSearches.every((s) => s === searchKey)) {
            activeWarnings.push(`[Convergence]: Repeated "${searchKey}" 3x. Consider a different approach.`);
          }
        }

        // 5. Workspace Grounding (warn, don't block)
        if (tool.name === 'patch_file') {
          const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
          const fullPath = tool.path
            ? path.isAbsolute(tool.path)
              ? tool.path
              : path.join(workspacePath, tool.path)
            : '';
          if (fullPath && !verifiedFiles.has(fullPath)) {
            activeWarnings.push(
              `[Grounding]: You haven't read "${tool.path}" yet this session. Patching without reading may cause SEARCH-block mismatches.`,
            );
          }
        }

        // 7. JS Exception / Evidence (warn, don't block)
        if ((tool.name === 'patch_file' || tool.name === 'write_file') && !hasSufficientJSEvidence(currentMessages)) {
          activeWarnings.push(`[Evidence]: Patching a crash without full stack trace. The fix may be speculative.`);
        }

        // 6. Architecture Constraint Lock (warn, don't block)
        if (isSearchOrRead && blockedScopes.length > 0) {
          const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
          const fullPath = tool.path
            ? path.isAbsolute(tool.path)
              ? tool.path
              : path.join(workspacePath, tool.path)
            : '';
          const normalizedPath = fullPath.toLowerCase().replace(/\\/g, '/');

          for (const blocked of blockedScopes) {
            if (normalizedPath.includes(blocked) || target.toLowerCase().includes(blocked)) {
              activeWarnings.push(
                `[Architecture]: Accessing '${target}' may violate SEARCH_SCOPE_BLOCKED '${blocked}'. Add JUSTIFICATION to <architecture_routing> if needed.`,
              );
            }
          }
        }

        // Clear read history if modifying a file or running a terminal command
        if (tool.name === 'patch_file' || tool.name === 'write_file' || tool.name === 'create_file') {
          if (tool.path) {
            const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
            const fullPath = tool.path
              ? path.isAbsolute(tool.path)
                ? tool.path
                : path.join(workspacePath, tool.path)
              : '';
            if (fullPath) {
              readRangesTracker.delete(fullPath);
            }
          }
        } else if (tool.name === 'run_command') {
          readRangesTracker.clear();
        }

        return { allowed: true };
      };

      try {
        while (continueLoop && loopCount < maxLoops) {
          if (signal.aborted) {
            continueLoop = false;
            break;
          }
          loopCount++;

          // Deterministic Agent State Machine transitions
          if (!hasSufficientJSEvidence(currentMessages)) {
            agentState = AgentState.NEEDS_EVIDENCE;
          } else if (hasEnoughInformationForReview(taskMode, verifiedFiles, currentMessages)) {
            // In REVIEW mode, once we have read enough files, skip straight to output
            agentState = AgentState.IMPLEMENTATION; // Reuse IMPLEMENTATION to stop searches
          } else if (isErrorDirectlyLocalized(currentMessages, verifiedFiles)) {
            hasCommittedToPatch = true;
            agentState = AgentState.IMPLEMENTATION;
          } else if (searchCount >= maxSearchBudget) {
            agentState = AgentState.BLOCKED;
          } else if (hasCommittedToPatch) {
            agentState = AgentState.IMPLEMENTATION;
          }

          // Backlog Expiration: clear pending actions if symptom changes or we enter patch/implementation mode
          const currentSymptom = detectActiveSymptom(currentMessages);
          if (currentSymptom !== lastSymptom || agentState === AgentState.IMPLEMENTATION) {
            pendingActions = [];
          }
          lastSymptom = currentSymptom;

          // Context optimization guardrail: token-budget-based summarization
          const customEndpointUrl = config.get<string>('customEndpointUrl', 'https://api.openai.com/v1');
          const customEndpointModel = config.get<string>('customEndpointModel', 'gpt-4o');
          const customApis = config.get<any[]>('customApis', []);
          const activeCustomApi =
            typeof provider === 'string' && provider.startsWith('custom_')
              ? customApis.find((api) => api.id === provider)
              : null;

          const geminiModel = config.get<string>('geminiModel', 'gemini-2.0-flash');
          const openrouterModel = config.get<string>('openrouterModel', 'anthropic/claude-3.5-sonnet');
          const litellmModel = config.get<string>('litellmModel', 'gpt-4o');

          const currentModel =
            provider === 'ollama'
              ? defaultOllamaModel
              : provider === 'deepseek'
                ? defaultDeepSeekModel
                : provider === 'gemini'
                  ? geminiModel
                  : provider === 'openrouter'
                    ? openrouterModel
                    : provider === 'litellm'
                      ? litellmModel
                      : customEndpointModel;
          const currentHost =
            provider === 'ollama'
              ? ollamaHost
              : provider === 'deepseek'
                ? 'https://api.deepseek.com/chat/completions'
                : provider === 'gemini'
                  ? 'https://generativelanguage.googleapis.com'
                  : provider === 'openrouter'
                    ? 'https://openrouter.ai/api/v1'
                    : provider === 'litellm'
                      ? config.get<string>('litellmBaseUrl', 'http://localhost:4000/v1')
                      : activeCustomApi
                        ? activeCustomApi.url
                        : customEndpointUrl;

          // Discover the actual context window using our new service
          const contextWindow = await getContextLength(currentHost, currentModel, apiKey);
          const configuredBudget = config.get('agentInputTokenBudget', 6000) as number;
          const explicitBudget =
            config.inspect('agentInputTokenBudget')?.globalValue !== undefined ||
            config.inspect('agentInputTokenBudget')?.workspaceValue !== undefined;

          const contextBudgetPercent = config.get<number>('contextBudgetPercent', 75);
          const headroom = contextBudgetPercent / 100;
          const hardMax = config.get('agentInputTokenHardMax', 200000) as number;
          const effectiveBudget = computeInputTokenBudget(configuredBudget, contextWindow, explicitBudget, { hardMax, headroom });

          // Auto-compaction check using our new context compactor service
          const compactionResult = await maybeCompact(activeMessages, effectiveBudget, async (summaryPrompt) => {
            this._postMessage({ type: 'chatResponseStart' });
            this._postMessage({
              type: 'chatResponseChunk',
              text: `Compressing context (~${Math.round(estimateTokens(activeMessages) / 1000)}K tokens, budget: ${Math.round(effectiveBudget / 1000)}K)...`,
            });
            const summary = await this._completer.summarizeHistory(
              provider as LLMProvider,
              currentHost,
              currentModel,
              apiKey,
              summaryPrompt,
            );
            this._postMessage({ type: 'chatResponseComplete', fullText: 'Context optimized.' });
            return summary;
          });

          if (compactionResult.wasCompacted) {
            activeMessages = compactionResult.compactedMessages;
            this._activeMessages = activeMessages; // Keep cache updated
          }

          this._postMessage({
            type: 'contextUsage',
            usedTokens: estimateTokens(activeMessages),
            maxTokens: effectiveBudget,
          });

          continueLoop = false;

          // Determine if this provider supports native tool calling (computed before payload assembly)
          const useNativeTools = supportsNativeToolCalling(provider, currentModel);
          const toolSchemas = useNativeTools ? getToolSchemas() : undefined;

          const resolvedPayloadPromises = activeMessages
            .filter((msg) => !msg.summarized)
            .map(async (msg) => {
              let content = msg.content;
              if (msg.role === 'user' && content) {
                content = await this._resolveFileRefs(content);
              }
              const mapped: any = {
                role: (msg.role === 'system' ? 'user' : msg.role) as 'user' | 'assistant' | 'system' | 'tool',
                content: content,
                images: msg.images,
              };
              // Preserve native tool calling fields — DeepSeek requires these to be present
              if ((msg as any).tool_call_id) mapped.tool_call_id = (msg as any).tool_call_id;
              if ((msg as any).tool_calls) mapped.tool_calls = (msg as any).tool_calls;
              return mapped;
            });
          const resolvedPayload = await Promise.all(resolvedPayloadPromises);

          const payload: ChatMessage[] = [
            {
              role: 'system',
              content: buildSystemPrompt(
                loopCount,
                hasDeclaredPlan(activeMessages, ''),
                featureOwner,
                agentState,
                taskMode,
                text || '',
                useNativeTools,
              ),
            },
            ...resolvedPayload,
          ];

          // Soft trim payload messages to the effective input token budget
          const reserveTokens = 1024;
          const trimmedPayload = trimForContext(payload, effectiveBudget, reserveTokens);

          // Strip internal metadata keys before sending to the LLM API
          // Preserve tool_call_id and tool_calls — required for native function calling message sequences
          const finalPayload = trimmedPayload.map((m: any) => {
            const out: any = { role: m.role, content: m.content };
            if (m.images) out.images = m.images;
            if (m.tool_call_id) out.tool_call_id = m.tool_call_id;
            if (m.tool_calls) out.tool_calls = m.tool_calls;
            return out;
          });

          // Payload diagnostics
          const payloadTokens = estimateTokens(finalPayload);
          const utilization = Math.round((payloadTokens / contextWindow) * 100);
          console.log(
            `[Context] Payload: ${finalPayload.length} msgs, ~${Math.round(payloadTokens / 1000)}K tokens (model: ${currentModel}, window: ${Math.round(contextWindow / 1000)}K, budget: ${Math.round(effectiveBudget / 1000)}K, utilization: ${utilization}%, nativeTools: ${useNativeTools})`,
          );

          this._postMessage({ type: 'chatResponseStart' });

          const completionController = new AbortController();
          const mainAbortListener = () => completionController.abort();
          signal.addEventListener('abort', mainAbortListener);

          // Capture native tool call from streaming callback (declared here so accessible after retry loop)
          let nativeToolCall: { id: string; name: string; argsJson: string } | null = null;
          const onNativeToolCall = useNativeTools
            ? (id: string, name: string, argsJson: string) => {
                nativeToolCall = { id, name, argsJson };
              }
            : undefined;

          let assistantResponse = '';
          let completionRetries = 0;
          const maxCompletionRetries = 2;

          while (completionRetries <= maxCompletionRetries) {
            try {
              assistantResponse = await this._completer.getLLMCompletion(
                provider as LLMProvider,
                currentHost,
                currentModel,
                apiKey,
                finalPayload,
                completionController.signal,
                this._session.sessionId,
                completionController,
                vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || undefined,
                toolSchemas,
                onNativeToolCall,
              );

              // If response is not empty (or we got a native tool call), we are good
              if ((assistantResponse && assistantResponse.trim() !== '') || nativeToolCall) {
                break;
              }

              completionRetries++;
              if (completionRetries <= maxCompletionRetries) {
                console.warn(
                  `[Orchestrator] Empty completion received. Retrying (attempt ${completionRetries}/${maxCompletionRetries})...`,
                );
                this._postMessage({
                  type: 'chatResponseChunk',
                  text: `\n*(Empty response received; retrying attempt ${completionRetries}/${maxCompletionRetries}...)*\n`,
                });
              } else {
                // If we exhausted retries and it's still empty, return a friendly fallback
                assistantResponse =
                  "I'm sorry, I encountered a temporary issue generating a response. Please try sending your message again or check your model connection.";
              }
            } catch (apiErr: unknown) {
              signal.removeEventListener('abort', mainAbortListener);
              const apiErrMsg = apiErr instanceof Error ? apiErr.message : String(apiErr);
              console.error('API error during streaming:', apiErrMsg);
              const fb = this._fallback.failover();
              if (fb.success && fb.newProvider) {
                const nextKey = await tryGetApiKey(fb.newProvider);
                this._postMessage({
                  type: 'providerFallback',
                  message: apiErrMsg + ' ' + fb.message,
                  newProvider: fb.newProvider,
                });
                provider = fb.newProvider;
                apiKey = nextKey;
                loopCount--;
                continueLoop = true;
                break;
              } else {
                throw apiErr;
              }
            }
          }

          // If we switched provider during error catch, continue loop
          if (continueLoop && loopCount < maxLoops && assistantResponse === '') {
            continue;
          }

          signal.removeEventListener('abort', mainAbortListener);

          // Push assistant message — on native path, include tool_calls array so DeepSeek
          // can correctly associate the subsequent role:'tool' message
          if (nativeToolCall) {
            const ntc = nativeToolCall as { id: string; name: string; argsJson: string };
            pushToHistory({
              role: 'assistant',
              content: assistantResponse || '',
              tool_calls: [
                {
                  id: ntc.id,
                  type: 'function',
                  function: { name: ntc.name, arguments: ntc.argsJson },
                },
              ],
            } as any);
          } else {
            pushToHistory({ role: 'assistant', content: assistantResponse });
          }

          this._syncPlanningFiles(assistantResponse);

          // Parse architecture routing block
          const routingMatch = assistantResponse.match(/<architecture_routing>([\s\S]*?)<\/architecture_routing>/i);
          if (routingMatch) {
            const blockContent = routingMatch[1];
            const lines = blockContent.split('\n');
            let hasJustification = false;
            for (const line of lines) {
              const parts = line.split(':');
              if (parts.length >= 2) {
                const key = parts[0].trim().toUpperCase();
                const value = parts.slice(1).join(':').trim();
                if (key === 'FEATURE_OWNER') {
                  featureOwner = value;
                } else if (key === 'SEARCH_SCOPE_ALLOWED') {
                  allowedScopes = value
                    .split(',')
                    .map((s) => s.trim().toLowerCase())
                    .filter(Boolean);
                } else if (key === 'SEARCH_SCOPE_BLOCKED') {
                  blockedScopes = value
                    .split(',')
                    .map((s) => s.trim().toLowerCase())
                    .filter(Boolean);
                } else if (key === 'JUSTIFICATION') {
                  if (value.length > 5) {
                    hasJustification = true;
                  }
                }
              }
            }
            if (hasJustification) {
              blockedScopes = [];
            }
          }

          await this._saveChatHistory(currentMessages);

          // Commitment Detection: check if the model says it has enough context or is ready to patch
          if (canDescribePatch(assistantResponse, verifiedFiles)) {
            hasCommittedToPatch = true;
            agentState = AgentState.IMPLEMENTATION;
          }

          // Resolve tool calls: native JSON path or XML text fallback
          let toolCalls = [] as ReturnType<typeof this._parser.parseToolCalls>;
          if (nativeToolCall) {
            // Native function calling path: parse structured JSON args
            const parsed = NativeToolCallParser.parseToolCall(
              (nativeToolCall as { id: string; name: string; argsJson: string }).name,
              (nativeToolCall as { id: string; name: string; argsJson: string }).argsJson,
              (nativeToolCall as { id: string; name: string; argsJson: string }).id,
            );
            if (parsed) {
              toolCalls = [parsed];
              console.log(`[Orchestrator] Native tool call: ${parsed.name}`, JSON.stringify(parsed));
            } else {
              console.warn(`[Orchestrator] Native tool call parse failed for: ${(nativeToolCall as any).name}`);
            }
          } else {
            // XML text fallback path (Ollama or non-native providers)
            toolCalls = this._parser.parseToolCalls(assistantResponse, true);
          }

          if (toolCalls.length > 0) {
            // Tool ranking info logged but NOT enforced — model runs all tools it emits
            if (toolCalls.length > 1) {
              const { selectedTool, alternatives } = selectHighestValueTool(toolCalls, currentMessages);
              console.log(
                `[Orchestrator] Multi-tool turn: ${toolCalls.length} tools. Top pick: ${selectedTool.name} (score shown in telemetry; all tools allowed).`,
              );
              // Active warnings from validateControlLoopGuard will be fed back after tool results
            }

            const hasModifyingTool = toolCalls.some(
              (tool) =>
                tool.name === 'create_file' ||
                tool.name === 'write_file' ||
                tool.name === 'patch_file' ||
                tool.name === 'delete_file' ||
                tool.name === 'rename_file' ||
                tool.name === 'run_command' ||
                tool.name === 'send_terminal_input' ||
                tool.name === 'browser_click' ||
                tool.name === 'browser_type' ||
                tool.name === 'browser_evaluate_script' ||
                tool.name === 'git_add' ||
                tool.name === 'git_commit' ||
                tool.name === 'rename_symbol',
            );

            if (hasModifyingTool) {
              sequentialExploratorySteps = 0;
            } else {
              sequentialExploratorySteps++;
            }

            this._sendAvatarState('tool_calling');
            const toolResults: string[] = [];

            const readOnlyTools = [
              'read_file',
              'list_dir',
              'grep_search',
              'symbol_search',
              'web_search',
              'get_diagnostics',
              'git_status',
              'git_diff',
            ];
            const readOnlyCalls = toolCalls.filter((t) => readOnlyTools.includes(t.name));
            const modifyingCalls = toolCalls.filter((t) => !readOnlyTools.includes(t.name));

            if (readOnlyCalls.length > 0) {
              // Parallel execution for read-only tools
              const promises = readOnlyCalls.map(async (tool) => {
                if (signal.aborted) return;
                const target = tool.path || tool.query || tool.url || tool.selector || tool.command || '';

                const guard = validateControlLoopGuard(tool);
                if (!guard.allowed) {
                  this._sendToolStatusToWebview(tool.name, 'error', target, guard.reason);
                  return '[Tool Result for ' + tool.name + ' on "' + target + '"]: Error - ' + guard.reason;
                }

                this._sendToolStatusToWebview(tool.name, 'running', target);
                try {
                  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                  const figmaKey = (await this._getSecret('figma_api_key')) || '';
                  const result = await executeTool(tool, this._getSafePath, figmaKey, workspacePath);

                  if (
                    tool.name === 'patch_file' ||
                    tool.name === 'write_file' ||
                    tool.name === 'create_file' ||
                    tool.name === 'multi_patch_file' ||
                    tool.name === 'delete_file' ||
                    tool.name === 'rename_file'
                  ) {
                    try {
                      EventBus.getInstance().fire('file_modified', {
                        tool: tool.name,
                        path: tool.path,
                        content: tool.content,
                      });
                    } catch (e) {
                      console.error('Failed to fire file_modified event:', e);
                    }
                  }

                  let displayResult = result;
                  // Scale truncation threshold with model config
                  const maxToolOutputLength = config.get<number>('maxToolOutputLength', 20000);
                  const truncateThreshold = maxToolOutputLength;

                  if (result.length > truncateThreshold) {
                    const keep = Math.floor(truncateThreshold / 2);
                    const truncated = result.length - truncateThreshold;
                    displayResult =
                      result.substring(0, keep) +
                      ' [TRUNCATED ' +
                      truncated +
                      ' CHARS] ' +
                      result.substring(result.length - keep);
                  }

                  if (tool.name === 'read_file') {
                    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
                    const fullPath = tool.path
                      ? path.isAbsolute(tool.path)
                        ? tool.path
                        : path.join(workspacePath, tool.path)
                      : '';
                    if (fullPath) {
                      verifiedFiles.add(fullPath);
                    }
                  }

                  // Telemetry Outcome tracking for rewritten tool calls (Parallel Branch)
                  if (lastRewriteTelemetry && lastRewriteTelemetry.selectedTool === tool.name) {
                    let outcome = 'SUCCESS';
                    let outcomeReason = 'NO_NEW_INFORMATION';
                    const lowerResult = result.toLowerCase();
                    if (lowerResult.includes('error') || lowerResult.includes('failed')) {
                      outcome = 'ERROR';
                    } else {
                      // Observable evidence classification for ROOT_CAUSE_FOUND
                      const isBuildErrorFound =
                        lastSymptom === 'BUILD_FAILURE' &&
                        tool.path &&
                        lowerResult.includes(path.basename(tool.path).toLowerCase()) &&
                        (lowerResult.includes('unresolved reference') || lowerResult.includes('error:'));

                      const isNetworkConfigFound =
                        lastSymptom === 'NETWORK_ERROR' &&
                        (lowerResult.includes('axios') ||
                          lowerResult.includes('api_host') ||
                          lowerResult.includes('url'));

                      const isAuthConfigFound =
                        lastSymptom === 'AUTH_FAILURE' &&
                        (lowerResult.includes('token') ||
                          lowerResult.includes('session') ||
                          lowerResult.includes('auth'));

                      if (isBuildErrorFound || isNetworkConfigFound || isAuthConfigFound) {
                        outcomeReason = 'ROOT_CAUSE_FOUND';
                      }
                    }

                    lastRewriteTelemetry.outcome = outcome;
                    lastRewriteTelemetry.outcomeReason = outcomeReason;
                    lastRewriteTelemetry.resultSnippet = result.substring(0, 200);
                    logRewriteTelemetryToFile(lastRewriteTelemetry);
                    lastRewriteTelemetry = null;
                  }

                  this._sendToolStatusToWebview(
                    tool.name,
                    'success',
                    target,
                    displayResult,
                    undefined,
                    tool.content,
                    undefined,
                  );
                  return '[Tool Result for ' + tool.name + ' on "' + target + '"]: Success - ' + result;
                } catch (err: unknown) {
                  console.error('Tool execution failed:', err instanceof Error ? err.message : String(err));
                  console.error('Error in rewrite tool execution:', err instanceof Error ? err.message : String(err));
                  const errMsg = err instanceof Error ? err.message : String(err);
                  console.error(`Tool execution failed (${tool.name}):`, errMsg);

                  if (lastRewriteTelemetry && lastRewriteTelemetry.selectedTool === tool.name) {
                    lastRewriteTelemetry.outcome = 'ERROR';
                    lastRewriteTelemetry.outcomeReason = 'TOOL_EXECUTION_FAILED';
                    lastRewriteTelemetry.resultSnippet = errMsg.substring(0, 200);
                    logRewriteTelemetryToFile(lastRewriteTelemetry);
                    lastRewriteTelemetry = null;
                  }

                  this._sendToolStatusToWebview(tool.name, 'error', target, errMsg);
                  // Do NOT set avatar to 'error' — loop will continue with error fed back to model
                  return (
                    '[Tool Result for ' +
                    tool.name +
                    ' on "' +
                    target +
                    '"]: Error - ' +
                    errMsg +
                    '. Please correct your approach and try again.'
                  );
                }
              });

              const resolvedResults = await Promise.all(promises);
              for (const r of resolvedResults) {
                if (r) toolResults.push(r);
              }
            }

            if (modifyingCalls.length > 0) {
              // Sequential execution for mixed or modifying tools
              for (const tool of modifyingCalls) {
                if (signal.aborted) {
                  continueLoop = false;
                  break;
                }
                const target = tool.path || tool.query || tool.url || tool.selector || tool.command || '';

                const guard = validateControlLoopGuard(tool);
                if (!guard.allowed) {
                  this._sendToolStatusToWebview(tool.name, 'error', target, guard.reason);
                  toolResults.push(`[Tool Result for ${tool.name} on "${target}"]: Error - ${guard.reason}`);
                  continue;
                }

                this._sendToolStatusToWebview(tool.name, 'running', target);
                try {
                  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                  const figmaKey = (await this._getSecret('figma_api_key')) || '';
                  let result = await executeTool(tool, this._getSafePath, figmaKey, workspacePath);

                  if (
                    tool.name === 'patch_file' ||
                    tool.name === 'write_file' ||
                    tool.name === 'create_file' ||
                    tool.name === 'multi_patch_file' ||
                    tool.name === 'delete_file' ||
                    tool.name === 'rename_file'
                  ) {
                    try {
                      EventBus.getInstance().fire('file_modified', {
                        tool: tool.name,
                        path: tool.path,
                        content: tool.content,
                      });
                    } catch (e) {
                      console.error('Failed to fire file_modified event:', e);
                    }
                  }

                  // Grounding Verification Hook
                  if (tool.name === 'create_file' || tool.name === 'write_file' || tool.name === 'patch_file') {
                    agentState = AgentState.VERIFICATION;
                    await new Promise((resolve) => setTimeout(resolve, 300));
                    if (tool.path) {
                      const diagnosticsFeed = getDiagnosticsForFile(tool.path);
                      result += diagnosticsFeed;
                    }
                    const folders = vscode.workspace.workspaceFolders;
                    if (folders && folders.length > 0) {
                      const workspaceFolder = folders[0].uri.fsPath;
                      try {
                        const verifyResult = this._runWorkspaceVerification(workspaceFolder);
                        result += verifyResult;
                      } catch (e) {
                        console.error('Failed to run workspace verification:', e);
                      }
                      if (tool.path) {
                        try {
                          const dependents = getDependentsOfFile(tool.path);
                          if (dependents.length > 0) {
                            const depList = dependents
                              .map(
                                (d) =>
                                  `- \`${path.relative(workspaceFolder, d.file).replace(/\\/g, '/')}\` (imports this file on line ${d.line})`,
                              )
                              .join('\n');
                            result += `\n\n[System Notice: Note that the following file(s) import/depend on the file you modified. Decide if you need to check them or if they are affected:\n${depList}]`;
                          }
                        } catch (e) {
                          console.error('Failed to analyze dependents:', e);
                        }
                      }
                    }
                  }

                  if (
                    tool.name === 'read_file' ||
                    tool.name === 'create_file' ||
                    tool.name === 'write_file' ||
                    tool.name === 'patch_file'
                  ) {
                    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
                    const fullPath = tool.path
                      ? path.isAbsolute(tool.path)
                        ? tool.path
                        : path.join(workspacePath, tool.path)
                      : '';
                    if (fullPath) {
                      verifiedFiles.add(fullPath);
                    }
                  }

                  let checkpointId: string | undefined;
                  const cpMatch = result.match(/Revert ID: (\w+)/);
                  if (cpMatch) checkpointId = cpMatch[1];
                  let terminalName: string | undefined;
                  if (tool.name === 'run_command') {
                    const tnMatch = result.match(/VS Code terminal "([^"]+)"/);
                    if (tnMatch) terminalName = tnMatch[1];
                  }
                  let displayResult = result;
                  if (tool.name === 'browser_screenshot') {
                    const match = result.match(/\(Image successfully captured and sent to vision model\)/);
                    if (match) displayResult = result.replace(match[0], '(Image captured)');
                  } else {
                    // Scale truncation threshold with model config
                    const maxToolOutputLength = config.get<number>('maxToolOutputLength', 20000);
                    const truncateThreshold = maxToolOutputLength;

                    if (result.length > truncateThreshold) {
                      const keep = Math.floor(truncateThreshold / 2);
                      const truncated = result.length - truncateThreshold;
                      displayResult =
                        result.substring(0, keep) +
                        ' [TRUNCATED ' +
                        truncated +
                        ' CHARS] ' +
                        result.substring(result.length - keep);
                    }
                  }
                  // Telemetry Outcome tracking for rewritten tool calls (Sequential Branch)
                  if (lastRewriteTelemetry && lastRewriteTelemetry.selectedTool === tool.name) {
                    let outcome = 'SUCCESS';
                    let outcomeReason = 'NO_NEW_INFORMATION';
                    const lowerResult = result.toLowerCase();
                    if (lowerResult.includes('error') || lowerResult.includes('failed')) {
                      outcome = 'ERROR';
                    } else {
                      // Observable evidence classification for ROOT_CAUSE_FOUND
                      const isBuildErrorFound =
                        lastSymptom === 'BUILD_FAILURE' &&
                        tool.path &&
                        lowerResult.includes(path.basename(tool.path).toLowerCase()) &&
                        (lowerResult.includes('unresolved reference') || lowerResult.includes('error:'));

                      const isNetworkConfigFound =
                        lastSymptom === 'NETWORK_ERROR' &&
                        (lowerResult.includes('axios') ||
                          lowerResult.includes('api_host') ||
                          lowerResult.includes('url'));

                      const isAuthConfigFound =
                        lastSymptom === 'AUTH_FAILURE' &&
                        (lowerResult.includes('token') ||
                          lowerResult.includes('session') ||
                          lowerResult.includes('auth'));

                      if (isBuildErrorFound || isNetworkConfigFound || isAuthConfigFound) {
                        outcomeReason = 'ROOT_CAUSE_FOUND';
                      }
                    }

                    lastRewriteTelemetry.outcome = outcome;
                    lastRewriteTelemetry.outcomeReason = outcomeReason;
                    lastRewriteTelemetry.resultSnippet = result.substring(0, 200);
                    logRewriteTelemetryToFile(lastRewriteTelemetry);
                    lastRewriteTelemetry = null;
                  }

                  this._sendToolStatusToWebview(
                    tool.name,
                    'success',
                    target,
                    displayResult,
                    checkpointId,
                    tool.content,
                    terminalName,
                  );
                  toolResults.push('[Tool Result for ' + tool.name + ' on "' + target + '"]: Success - ' + result);
                } catch (err: unknown) {
                  console.error('Rewrite tool execution failed:', err instanceof Error ? err.message : String(err));
                  const errMsg = err instanceof Error ? err.message : String(err);

                  if (lastRewriteTelemetry && lastRewriteTelemetry.selectedTool === tool.name) {
                    lastRewriteTelemetry.outcome = 'ERROR';
                    lastRewriteTelemetry.outcomeReason = 'TOOL_EXECUTION_FAILED';
                    lastRewriteTelemetry.resultSnippet = errMsg.substring(0, 200);
                    logRewriteTelemetryToFile(lastRewriteTelemetry);
                    lastRewriteTelemetry = null;
                  }

                  // Track consecutive patch/write failures for corrective injection
                  const isPatchTool =
                    tool.name === 'patch_file' || tool.name === 'multi_patch_file' || tool.name === 'write_file';
                  if (isPatchTool) {
                    const failedPath = tool.path || 'unknown';
                    if (failedPath === lastPatchFailedPath) {
                      consecutivePatchFailures++;
                    } else {
                      consecutivePatchFailures = 1;
                      lastPatchFailedPath = failedPath;
                    }
                  } else {
                    consecutivePatchFailures = 0;
                    lastPatchFailedPath = '';
                  }

                  this._sendToolStatusToWebview(tool.name, 'error', target, errMsg);
                  this._sendAvatarState('tool_calling'); // Keep tool_calling state — do NOT set error, loop will continue
                  toolResults.push(
                    '[Tool Result for ' +
                      tool.name +
                      ' on "' +
                      target +
                      '"]: Error - ' +
                      errMsg +
                      '. Please correct your approach and try again.',
                  );
                }
                if (signal.aborted) {
                  continueLoop = false;
                  break;
                }
              }
            }

            // Staleness eviction: compress old read_file results for files that were just modified.
            // IMPORTANT: Only evict messages that existed BEFORE this loop iteration.
            // This prevents the bug where a fresh re-read after a patch gets immediately evicted
            // by the next patch, creating an infinite loop where the model can never see file contents.
            const modifiedPaths = toolCalls
              .filter((t) => t.name === 'patch_file' || t.name === 'write_file' || t.name === 'create_file')
              .map((t) => t.path)
              .filter(Boolean);
            if (modifiedPaths.length > 0) {
              // Count messages that existed before this tool result was added
              const messageCountBeforeThisTurn = currentMessages.length;
              for (let mi = 0; mi < messageCountBeforeThisTurn; mi++) {
                const msg = currentMessages[mi];
                if (msg.role !== 'system' || msg.summarized) continue;
                // Skip messages already evicted
                if (msg.content.includes('Content evicted from context.')) continue;
                for (const modPath of modifiedPaths) {
                  if (
                    modPath &&
                    msg.content.includes(`[Tool Result for read_file on "${modPath}"]`) &&
                    msg.content.includes('Success -')
                  ) {
                    const originalLen = msg.content.length;
                    msg.content = `[Tool Result for read_file on "${modPath}"]: File was read (${originalLen} chars) and subsequently modified — re-read the file to see current contents.`;
                  }
                }
              }
              // lastEvictionLoopCount = loopCount;
            }

            const images: string[] = [];
            const cleanedToolResults = toolResults.map((res) => {
              const match = res.match(/\(Base64 data hidden from output but sent to vision model: (.*)\)/);
              if (match) {
                images.push(match[1]);
                this._postMessage({ type: 'screenshotCapture', base64: match[1] });
                return res.replace(match[0], '(Image successfully captured and sent to vision model)');
              }
              // Scale truncation threshold with model config
              const maxToolOutputLength = config.get<number>('maxToolOutputLength', 20000);
              const truncateThreshold = maxToolOutputLength;
              if (res.length > truncateThreshold) {
                const prefixMatch = res.match(/^\[Tool Result for \w+ on "[^"]*"\]: (Success|Error) - /);
                const prefix = prefixMatch ? prefixMatch[0] : '';
                const content = prefix ? res.substring(prefix.length) : res;
                const keep = Math.floor(truncateThreshold / 2);
                const truncated = content.length - truncateThreshold;
                return (
                  prefix +
                  content.substring(0, keep) +
                  ' [TRUNCATED ' +
                  truncated +
                  ' CHARS] ' +
                  content.substring(content.length - keep)
                );
              }
              return res;
            });

            const combined = cleanedToolResults.join('\n\n');
            let finalSystemContent = combined;

            const hasTruncatedReadFile = cleanedToolResults.some(
              (res) => res.includes('[TRUNCATED') && res.includes('read_file'),
            );
            if (hasTruncatedReadFile) {
              finalSystemContent += `\n\n[System Notice: The file content returned above was truncated to save context window tokens. The actual file on disk is intact and complete. If you need to inspect the truncated lines, run read_file again with specific 'start_line' and 'end_line' parameters to view that region.]`;
            }

            // SYSTEM NOTICE removed — added once to the system prompt instead of per-turn.

            // Run failure detection evaluation on the tool results and assistant reply
            const turnEval = evaluateTurnResult(toolResults, assistantResponse);

            if (turnEval.status === 'failure') {
              try {
                EventBus.getInstance().fire('error_detected', {
                  reason: turnEval.reason,
                  toolResults,
                });
              } catch (e) {
                console.error('Failed to fire error_detected event:', e);
              }
            }

            const firstTool = toolCalls[0];
            const currentFailedToolKey = firstTool
              ? `${firstTool.name}:${firstTool.path || firstTool.command || ''}`
              : '';

            if (turnEval.status === 'failure') {
              if (currentFailedToolKey && currentFailedToolKey === lastFailedToolKey) {
                consecutiveToolFailures++;
              } else if (currentFailedToolKey) {
                consecutiveToolFailures = 1;
                lastFailedToolKey = currentFailedToolKey;
              }
            } else {
              consecutiveToolFailures = 0;
              lastFailedToolKey = '';
            }

            // Patch failure recovery: after 2+ consecutive failures on the same file,
            // force the model to re-read the file before retrying the patch.
            if (consecutivePatchFailures >= 2 && lastPatchFailedPath) {
              if (useNativeTools) {
                finalSystemContent +=
                  `\n\n[System: You have failed to patch "${lastPatchFailedPath}" ${consecutivePatchFailures} times in a row. ` +
                  `STOP. Do NOT call patch_file or multi_patch_file yet. ` +
                  `First, call read_file with path="${lastPatchFailedPath}" to see the current file content. ` +
                  `Then verify the exact lines you need to change. As a last resort, call write_file with path="${lastPatchFailedPath}" and content to overwrite the file entirely.]`;
              } else {
                finalSystemContent +=
                  `\n\n[System: You have failed to patch "${lastPatchFailedPath}" ${consecutivePatchFailures} times in a row. ` +
                  `STOP. Do NOT emit another patch_file or multi_patch_file yet. ` +
                  `First, emit exactly: <read_file path="${lastPatchFailedPath}" /> to see the current file content. ` +
                  `Then copy the exact lines you need to change into your SEARCH block verbatim, including all whitespace and indentation. ` +
                  `As a last resort, use <write_file path="${lastPatchFailedPath}">...full file content...</write_file> to overwrite the file entirely.]`;
              }
            } else if (turnEval.status === 'failure' && consecutiveToolFailures < 3) {
              finalSystemContent += `\n\n[System Notice: The previous tool call failed: ${turnEval.reason}. Retry with a different approach or state what is blocking you. Do not give up.]`;
            } else if (turnEval.status === 'failure' && consecutiveToolFailures >= 3) {
              finalSystemContent += `\n\n[System Notice: The tool "${currentFailedToolKey.split(':')[0]}" has failed 3 consecutive times. You may report this blocker to the user and request manual intervention if you are genuinely blocked.]`;
            } else if (sequentialExploratorySteps >= 4) {
              finalSystemContent +=
                '\n\n[System: You have performed several exploratory steps. Please evaluate if you have enough context. If you do, stop searching and execute the file patches immediately. Do not spend multiple turns re-reading the same file or scrolling in tiny increments. If you know the logic, write the patch block now.]';
            }
            // Wrap tool results and inject back into conversation
            // Native path: use role:'tool' with tool_call_id for proper OpenAI message format
            // XML fallback: use role:'system' wrapped as untrusted context
            if (nativeToolCall && (nativeToolCall as any).id) {
              // Native tool calling: push role:'tool' message for each result
              // We combine all results into one message (only one tool runs at a time on native path)
              const toolResultContent = finalSystemContent;
              pushToHistory({
                role: 'tool' as any,
                content: toolResultContent,
                tool_call_id: (nativeToolCall as any).id,
              } as ChatMessage);
            } else {
              // XML fallback: wrap as untrusted system message
              const systemMessage = untrustedContextMessage('tool_execution_results', finalSystemContent);
              if (images.length > 0) systemMessage.images = images;
              pushToHistory(systemMessage);
            }
            await this._saveChatHistory(currentMessages);

            // Fire teacher escalation check (P1.4)
            maybeEscalate(text || '', toolResults, assistantResponse, this._getSecret, this._postMessage);

            continueLoop = true;
            consecutiveMalformedCount = 0;
            consecutiveVerbalGiveUps = 0;
          } else {
            // Malformed tool tag recovery
            const allTools = [
              'read_file',
              'create_file',
              'write_file',
              'patch_file',
              'list_dir',
              'grep_search',
              'web_search',
              'browser_navigate',
              'browser_click',
              'browser_type',
              'browser_evaluate_script',
              'browser_screenshot',
              'run_command',
              'send_terminal_input',
              'close_terminal',
              'read_terminal',
              'list_terminals',
              'figma_inspect',
              'delete_file',
              'git_status',
              'git_diff',
              'git_add',
              'git_commit',
              'symbol_search',
              'rename_symbol',
              'rename_file',
              'wait',
              'analyze_project',
              'analyze_dependencies',
              'analyze_complexity',
              'analyze_coverage',
              'analyze_impact',
              'graphify',
            ];
            const hasToolAttempt = allTools.some((t) => assistantResponse.includes('<' + t));
            const turnEval = evaluateTurnResult([], assistantResponse);
            if (turnEval.status === 'failure') {
              try {
                EventBus.getInstance().fire('error_detected', {
                  reason: turnEval.reason,
                  assistantResponse,
                });
              } catch (e) {
                console.error('Failed to fire error_detected event:', e);
              }
            }
            if (turnEval.status === 'failure' && consecutiveVerbalGiveUps < 3) {
              consecutiveVerbalGiveUps++;
              const errorMsg = `[System Notice]: You indicated uncertainty: ${turnEval.reason}. Please use the available tools to investigate rather than guessing or giving up. You have tools like grep_search, read_file, etc. to find the necessary files and verify details.`;
              pushToHistory({ role: 'system', content: errorMsg });
              await this._saveChatHistory(currentMessages);
 
              // Fire teacher escalation on verbal give-up (P1.4)
              maybeEscalate(text || '', [], assistantResponse, this._getSecret, this._postMessage);
 
              continueLoop = true;
            } else if (hasToolAttempt && consecutiveMalformedCount < maxMalformedRetries) {
              consecutiveMalformedCount++;
              const errorMsg = useNativeTools
                ? `[Tool Parsing Error]: Your tool call parameters were malformed or incomplete (attempt ${consecutiveMalformedCount}/${maxMalformedRetries}). Please retry by outputting a valid tool call with properly formatted JSON arguments.`
                : `[Tool Parsing Error]: Your tool call was malformed or incomplete (attempt ${consecutiveMalformedCount}/${maxMalformedRetries}). Please retry with correct XML syntax.`;
              pushToHistory({ role: 'system', content: errorMsg });
              await this._saveChatHistory(currentMessages);
              continueLoop = true;
            } else if (routingMatch && toolCalls.length === 0) {
              // Architecture Routing Guard: architecture_routing block is NOT a valid response boundary.
              // If the model emitted architecture_routing but no tool call, it MUST be nudged to continue.
              const nudgeMsg = useNativeTools
                ? '[System Notice]: You emitted an <architecture_routing> block but did not invoke any functions. The architecture_routing block is guidance metadata and does not count as a response. You MUST immediately invoke exactly one function from the tools schema to proceed with your task.'
                : '[System Notice]: You emitted an <architecture_routing> block but did not invoke any tool tags. The architecture_routing block is guidance metadata and does not count as a response. You MUST immediately output exactly one valid tool tag (e.g., <read_file ...>) to proceed with your task.';
              pushToHistory({ role: 'system', content: nudgeMsg });
              await this._saveChatHistory(currentMessages);
              continueLoop = true;
            } else if (loopCount === 1 && hasActionPlanningIntent(assistantResponse)) {
              // Conversational nudge: if the model gave a conversational greeting in its very first turn without calling any tools,
              // but explicitly indicated that it plans to perform actions, we nudge it to execute a tool to keep the autonomous flow alive.
              const nudgeMsg = useNativeTools
                ? "[System Notice]: You did not invoke any tool functions in your response. If you need to search, read/write files, run commands, or analyze the workspace to fulfill the user's request, please invoke a valid tool function now to continue autonomously."
                : "[System Notice]: You did not invoke any tool tags in your response. If you need to search, read/write files, run commands, or analyze the workspace to fulfill the user's request, please output a valid tool tag now to continue autonomously.";
              pushToHistory({ role: 'system', content: nudgeMsg });
              await this._saveChatHistory(currentMessages);
              continueLoop = true;
            } else if (
              (taskMode === TaskMode.IMPLEMENT || taskMode === TaskMode.DEBUG || taskMode === TaskMode.VERIFY) &&
              !assistantResponse.includes('<walkthrough>') &&
              toolCalls.length === 0
            ) {
              // Non-completion conversational nudge: if the model is in implementation/debugging/verification mode
              // and did not produce a tool call or output a walkthrough, keep the loop alive by nudging it.
              const nudgeMsg = useNativeTools
                ? "[System Notice]: You did not invoke any tool functions or output a final <walkthrough> block. If you are still working on the task, you MUST invoke a tool (such as read_file, patch_file, run_command, etc.) to continue implementation. If you have completed the task, you MUST output a <walkthrough>...</walkthrough> block to document your changes and conclude the session."
                : "[System Notice]: You did not invoke any tool tags or output a final <walkthrough> block. If you are still working on the task, you MUST output a valid tool tag (such as <read_file ...>, <patch_file ...>, <run_command ...>, etc.) to continue implementation. If you have completed the task, you MUST output a <walkthrough>...</walkthrough> block to document your changes and conclude the session.";
              pushToHistory({ role: 'system', content: nudgeMsg });
              await this._saveChatHistory(currentMessages);
              continueLoop = true;
            }
          }
        }
        this._sendAvatarState('idle');
        this._postMessage({ type: 'updateChatHistory', history: currentMessages });
        const lastMsg = currentMessages[currentMessages.length - 1];
        const isCompleted = lastMsg && lastMsg.role === 'assistant' && lastMsg.content && lastMsg.content.includes('<walkthrough>');
        this._postMessage({ type: 'loopComplete', completed: !!isCompleted });
        try {
          EventBus.getInstance().fire('task_completed', {
            sessionId: this._session.sessionId,
            historyCount: currentMessages.length,
          });
        } catch (e) {
          console.error('Failed to fire task_completed event:', e);
        }
      } catch (err: unknown) {
        if (signal.aborted) {
          console.log('Agent stream aborted.');
          pushToHistory({
            role: 'system',
            content: '[System Notice]: The user manually aborted/stopped execution during this turn. All pending tool executions, file edits, or commands have been canceled. Stop your execution immediately and wait for the user\'s next input.'
          });
          await this._saveChatHistory(currentMessages);
          this._sendAvatarState('idle');
          this._postMessage({ type: 'updateChatHistory', history: currentMessages });
          this._postMessage({ type: 'loopComplete', completed: false });
        } else {
          this._sendAvatarState('error');
          this._postMessage({ type: 'chatResponseError', error: err instanceof Error ? err.message : String(err) });
        }
      } finally {
        this._activeAbortController = undefined;
      }
    } catch (outerErr: unknown) {
      this._sendAvatarState('error');
      console.error('Unhandled error in handleMessageStream:', outerErr);
      try {
        this._postMessage({
          type: 'chatResponseError',
          error: outerErr instanceof Error ? outerErr.message : 'Unknown error',
        });
      } catch (_) {
        /* best effort */
      }
    } finally {
      this._activeAbortController = undefined;
    }
  }

  /**
   * Resolves inline [filepath] markers in user text by reading file contents.
   * Replaces [path/to/file.ts] with a formatted code block.
   */
  private async _resolveFileRefs(text: string): Promise<string> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    return text.replace(/\[([^[\]]+?)\]/g, (match: string, filePath: string) => {
      try {
        const trimmed = filePath.trim();
        const fullPath = path.join(workspaceRoot, trimmed);
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const ext = path.extname(trimmed).slice(1) || 'txt';
          return `\n\`\`\`${ext}:${trimmed}\n${content}\n\`\`\``;
        }
      } catch {
        console.error('Failed to read embedding file:', filePath);
        // ignore
      }
      return match;
    });
  }

  private _syncPlanningFiles(assistantResponse: string) {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return;
    const workspaceRoot = folders[0].uri.fsPath;
    const mirrorVsDir = path.join(workspaceRoot, '.mirror-vs');

    try {
      if (!fs.existsSync(mirrorVsDir)) {
        fs.mkdirSync(mirrorVsDir, { recursive: true });
      }

      // 1. Extract and write implementation plan
      const planMatch = assistantResponse.match(/<implementation_plan>([\s\S]*?)<\/implementation_plan>/i);
      if (planMatch) {
        const planContent = planMatch[1].trim();
        const planPath = path.join(mirrorVsDir, 'implementation_plan.md');
        fs.writeFileSync(planPath, planContent, 'utf8');

        // Register/update the implementation plan artifact
        ArtifactService.getInstance()
          .createOrUpdateArtifact(
            'implementation_plan',
            'markdown',
            'Implementation Plan',
            planContent,
            undefined,
            false,
          )
          .catch((err) => console.warn('Failed to sync implementation plan artifact:', err));

        // Also automatically initialize/extract task list from the plan
        const taskPath = path.join(mirrorVsDir, 'task.md');
        const lines = planContent.split('\n');
        const tasks: string[] = [];
        for (const line of lines) {
          const trimmed = line.trim();
          if (/^(\d+\.|-|\*)\s+/.test(trimmed)) {
            const taskText = trimmed.replace(/^(\d+\.|-|\*)\s+/, '');
            tasks.push(`- [ ] ${taskText}`);
          }
        }
        let taskContent = '';
        if (tasks.length > 0) {
          taskContent = tasks.join('\n') + '\n';
        } else {
          // Fallback: write a default task list if no list found in plan
          taskContent = `- [ ] Analyze requirements\n- [ ] Implement changes\n- [ ] Verify execution\n`;
        }
        fs.writeFileSync(taskPath, taskContent, 'utf8');

        // Register/update the task list artifact
        ArtifactService.getInstance()
          .createOrUpdateArtifact('task', 'markdown', 'Task List', taskContent, undefined, false)
          .catch((err) => console.warn('Failed to sync task list artifact:', err));
      }

      // 2. Extract and write walkthrough
      const walkthroughMatch = assistantResponse.match(/<walkthrough>([\s\S]*?)<\/walkthrough>/i);
      if (walkthroughMatch) {
        const walkthroughContent = walkthroughMatch[1].trim();
        const walkthroughPath = path.join(mirrorVsDir, 'walkthrough.md');
        fs.writeFileSync(walkthroughPath, walkthroughContent, 'utf8');

        // Register/update the walkthrough artifact
        ArtifactService.getInstance()
          .createOrUpdateArtifact('walkthrough', 'markdown', 'Walkthrough', walkthroughContent, undefined, false)
          .catch((err) => console.warn('Failed to sync walkthrough artifact:', err));

        // When walkthrough is written, all tasks are done!
        // We can mark all tasks as completed in task.md
        const taskPath = path.join(mirrorVsDir, 'task.md');
        if (fs.existsSync(taskPath)) {
          let taskContent = fs.readFileSync(taskPath, 'utf8');
          taskContent = taskContent.replace(/\[\s*\]/g, '[x]').replace(/\[\s*\/\]/g, '[x]');
          fs.writeFileSync(taskPath, taskContent, 'utf8');

          // Sync the updated task list artifact
          ArtifactService.getInstance()
            .createOrUpdateArtifact('task', 'markdown', 'Task List', taskContent, undefined, false)
            .catch((err) => console.warn('Failed to sync updated task list artifact:', err));
        }
      }
    } catch (e) {
      console.warn('Failed to sync planning files:', e);
    }
  }

  private async _generateLightweightProjectMap(workspaceRoot: string): Promise<string> {
    const shouldSkipDir = (name: string): boolean =>
      [
        'node_modules',
        'dist',
        'out',
        '.git',
        '.mirror-vs',
        'build',
        '.next',
        '.nuxt',
        'coverage',
        '.nyc_output',
        '__pycache__',
        '.venv',
        'venv',
        'env',
        'target',
        'bin',
        'obj',
        '.vscode',
      ].includes(name);

    // SOURCE_EXTS removed — no longer needed after removing file hints and source index.

    // Hints disabled — reading every file for a comment line adds I/O cost and
    // ~2K tokens per first turn without adding unique value the tree doesn't provide.

    interface FileEntry {
      rel: string;
      hint: string;
    }
    type DirGroup = { isDir: true; name: string; rel: string; children: (FileEntry | DirGroup)[]; fileCount: number };

    const walkDir = (dir: string, depth: number): (FileEntry | DirGroup)[] => {
      if (depth > 4) return [];
      const result: (FileEntry | DirGroup)[] = [];
      let entries: string[] = [];
      try {
        entries = fs.readdirSync(dir).sort();
      } catch {
        console.error('readdirSync failed for:', dir);
        return result;
      }
      const dirs: string[] = [];
      const files: string[] = [];
      for (const e of entries) {
        if (shouldSkipDir(e)) continue;
        const fp = path.join(dir, e);
        try {
          const s = fs.statSync(fp);
          if (s.isDirectory()) dirs.push(e);
          else if (s.isFile()) files.push(e);
        } catch {
          console.error('statSync failed for:', fp);
          /* skip */
        }
      }

      // Count all files recursively for directory label
      const countAll = (d: string): number => {
        let c = 0;
        try {
          for (const e of fs.readdirSync(d)) {
            if (shouldSkipDir(e)) continue;
            const fp = path.join(d, e);
            try {
              const s = fs.statSync(fp);
              if (s.isDirectory()) c += countAll(fp);
              else c++;
            } catch {
              console.error('statSync failed in countAll for:', fp);
              /* skip */
            }
          }
        } catch {
          console.error('readdirSync failed in countAll for:', d);
          /* skip */
        }
        return c;
      };

      for (const d of dirs) {
        const fullPath = path.join(dir, d);
        const rel = path.relative(workspaceRoot, fullPath).replace(/\\/g, '/');
        const children = walkDir(fullPath, depth + 1);
        result.push({ isDir: true, name: d, rel, children, fileCount: countAll(fullPath) });
      }
      for (const f of files) {
        const fp = path.join(dir, f);
        const rel = path.relative(workspaceRoot, fp).replace(/\\/g, '/');
        result.push({ rel, hint: '' });
      }
      return result;
    };

    const renderEntries = (
      entries: (FileEntry | DirGroup)[],
      prefix: string,
      lines: string[],
      maxLines: number,
    ): void => {
      for (let i = 0; i < entries.length; i++) {
        if (lines.length >= maxLines) break;
        const entry = entries[i];
        const isLast = i === entries.length - 1;
        const marker = isLast ? '└── ' : '├── ';
        const childPrefix = prefix + (isLast ? '    ' : '│   ');
        if ('isDir' in entry && entry.isDir) {
          lines.push(`${prefix}${marker}${entry.name}/ (${entry.fileCount} files)`);
          renderEntries(entry.children, childPrefix, lines, maxLines);
        } else {
          const fe = entry as FileEntry;
          const hint = fe.hint ? `  — ${fe.hint}` : '';
          const fileName = path.basename(fe.rel);
          lines.push(`${prefix}${marker}${fileName}${hint}`);
        }
      }
    };

    try {
      const topEntries = walkDir(workspaceRoot, 0);
      const lines: string[] = [`Root: ${path.basename(workspaceRoot)}`];
      const maxProjectMapLines = vscode.workspace.getConfiguration('mirror-vs').get<number>('maxProjectMapLines', 250);
      renderEntries(topEntries, '', lines, maxProjectMapLines);

      // Source file index omitted — the tree already shows full relative paths at leaf nodes.
      // Agents can find exact paths by scanning the tree; a separate index is redundant.

      return lines.join('\n');
    } catch (e) {
      console.error('Error generating project map:', e instanceof Error ? e.message : String(e));
      return `Error generating map: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  private _runWorkspaceVerification(workspaceFolder: string): string {
    let output = '\n\n### AUTOMATED POST-PATCH VERIFICATION:\n';
    output += '✅ Patch Applied Successfully.\n';
    output += '⚠️ NOT YET VERIFIED. Requires compilation/build validation and runtime tests to verify correctness.\n';

    let compilePassed = true;
    let lintPassed = true;
    let testsPassed = true;

    // 1. Run Compile / Build check
    try {
      output += '\n\nRunning build/compile check...';
      const compileOutput = execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'compile'], {
        cwd: workspaceFolder,
        encoding: 'utf8',
        timeout: 15000,
        stdio: 'pipe',
      });
      output += '\n[Build Status]: Success\n' + compileOutput.substring(0, 1000);
    } catch (err: any) {
      console.error('Compile/build check failed:', err.message || String(err));
      compilePassed = false;
      output +=
        '\n[Build Status]: FAILED\n' + (err.stdout || '') + '\n' + (err.stderr || '') + '\n' + (err.message || '');
    }

    // 2. Run Lint check
    try {
      output += '\n\nRunning lint check...';
      const lintOutput = execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'lint'], {
        cwd: workspaceFolder,
        encoding: 'utf8',
        timeout: 15000,
        stdio: 'pipe',
      });
      output += '\n[Lint Status]: Success\n' + lintOutput.substring(0, 1000);
    } catch (err: any) {
      console.error('Lint check failed:', err.message || String(err));
      lintPassed = false;
      output +=
        '\n[Lint Status]: FAILED or Warnings detected\n' + (err.stdout || '') + '\n' + (err.stderr || '') + '\n';
    }

    // 3. Run Tests
    try {
      output += '\n\nRunning test suite...';
      const testOutput = execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'test'], {
        cwd: workspaceFolder,
        encoding: 'utf8',
        timeout: 30000,
        stdio: 'pipe',
      });
      output += '\n[Test Status]: Success\n' + testOutput.substring(0, 1000);
    } catch (err: any) {
      console.error('Test run failed:', err.message || String(err));
      testsPassed = false;
      output += '\n[Test Status]: FAILED\n' + (err.stdout || '') + '\n' + (err.stderr || '') + '\n';
    }

    output += '\n\n### VERIFICATION REPORT:\n';
    if (compilePassed && lintPassed && testsPassed) {
      output += '✅ VERIFIED: Build, lint, and tests passed successfully.\n';
    } else {
      output +=
        '❌ NOT YET VERIFIED: Build or tests failed. Please review the compilation and test diagnostics output above.\n';
    }

    return output;
  }
}

function canDescribePatch(text: string, verifiedFiles: Set<string>): boolean {
  const lower = text.toLowerCase();

  // 1. Check for patch/plan intent or code blocks (rootCauseIdentified & exactChangeKnown)
  const hasPlanOrCode = /<implementation_plan>|<patch_file>|```diff/i.test(text);
  const declaresCommitment = [
    'i will now apply the patch',
    'i will now modify',
    "i'll write the patch",
    'i will write the patch',
    'applying the patch',
    'applying patch',
    "i'm ready to patch",
    'i am ready to patch',
    'here is the code change',
    'here is the fix',
    'we need to change',
    'the fix is to',
    'should be changed to',
    'propose the following patch',
    'modified code',
  ].some((p) => lower.includes(p));

  if (!hasPlanOrCode && !declaresCommitment) {
    return false;
  }

  // 2. Check that the target file mentioned in the response has been verified (read) in this session (targetFileVerified)
  let mentionsVerifiedFile = false;
  for (const file of verifiedFiles) {
    const baseName = path.basename(file).toLowerCase();
    if (baseName && lower.includes(baseName)) {
      mentionsVerifiedFile = true;
      break;
    }
  }

  return mentionsVerifiedFile;
}

function hasSufficientJSEvidence(messages: ChatMessage[]): boolean {
  let hasGenericCrash = false;
  let hasStackTrace = false;
  for (const msg of messages) {
    const content = msg.content.toLowerCase();
    if (content.includes('javascriptexception') || content.includes('js exception') || content.includes('crash')) {
      hasGenericCrash = true;
    }
    if (
      content.includes('stack trace') ||
      content.includes('at ') ||
      content.includes('.js:') ||
      content.includes('.ts:') ||
      content.includes('error:') ||
      content.includes('exception:')
    ) {
      hasStackTrace = true;
    }
  }
  if (hasGenericCrash && !hasStackTrace) {
    return false;
  }
  return true;
}

function isErrorDirectlyLocalized(messages: ChatMessage[], verifiedFiles: Set<string>): boolean {
  if (verifiedFiles.size === 0) return false;
  let hasErrorText = false;
  let errorFileFound = false;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const content = msg.content;
    const lowerContent = content.toLowerCase();

    const isError =
      lowerContent.includes('[build status]: failed') ||
      lowerContent.includes('compilation error') ||
      lowerContent.includes('unresolved reference') ||
      lowerContent.includes('error:') ||
      lowerContent.includes('failed:') ||
      lowerContent.includes('javascriptexception') ||
      lowerContent.includes('exception in thread') ||
      lowerContent.includes('crash');

    if (isError) {
      hasErrorText = true;
      for (const filePath of verifiedFiles) {
        const baseName = path.basename(filePath).toLowerCase();
        if (baseName && lowerContent.includes(baseName)) {
          errorFileFound = true;
          break;
        }
      }
    }
    if (hasErrorText && errorFileFound) {
      return true;
    }
  }
  return false;
}

function hasEnoughInformationForReview(
  taskMode: TaskMode,
  verifiedFiles: Set<string>,
  messages: ChatMessage[],
): boolean {
  if (taskMode !== TaskMode.REVIEW) return false;
  if (verifiedFiles.size === 0) return false;

  // Confirm we have at least one successful read_file tool result in the conversation
  let hasReadResult = false;
  for (const msg of messages) {
    if (
      msg.role === 'system' &&
      msg.content.includes('[Tool Result for read_file on "') &&
      msg.content.includes('Success -')
    ) {
      hasReadResult = true;
      break;
    }
  }

  return hasReadResult;
}

function detectActiveSymptom(messages: ChatMessage[]): 'BUILD_FAILURE' | 'NETWORK_ERROR' | 'AUTH_FAILURE' | 'NONE' {
  for (let i = messages.length - 1; i >= 0; i--) {
    const content = messages[i].content.toLowerCase();
    if (
      content.includes('[build status]: failed') ||
      content.includes('compilation error') ||
      content.includes('unresolved reference')
    ) {
      return 'BUILD_FAILURE';
    }
    if (
      content.includes('network') ||
      content.includes('axios') ||
      content.includes('http') ||
      content.includes('internet') ||
      content.includes('timeout') ||
      content.includes('fetch')
    ) {
      return 'NETWORK_ERROR';
    }
    if (
      content.includes('auth') ||
      content.includes('login') ||
      content.includes('token') ||
      content.includes('session') ||
      content.includes('credentials')
    ) {
      return 'AUTH_FAILURE';
    }
  }
  return 'NONE';
}

function logRewriteTelemetryToFile(entry: any): void {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return;
  const workspaceRoot = folders[0].uri.fsPath;
  const logDir = path.join(workspaceRoot, '.mirror-vs');
  const logFile = path.join(logDir, 'rewrites.log');

  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf8');
    console.log('[Telemetry] Logged rewrite outcome:', entry);
  } catch (e) {
    console.warn('Failed to log rewrite telemetry:', e);
  }
}

function selectHighestValueTool(toolCalls: any[], messages: ChatMessage[]): { selectedTool: any; alternatives: any[] } {
  const symptom = detectActiveSymptom(messages);

  // Resolve workspace path for target feasibility validation
  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

  let errorFileBasename = '';
  if (symptom === 'BUILD_FAILURE') {
    for (let i = messages.length - 1; i >= 0; i--) {
      const content = messages[i].content;
      if (
        content.toLowerCase().includes('[build status]: failed') ||
        content.toLowerCase().includes('compilation error')
      ) {
        for (const t of toolCalls) {
          if (t.path) {
            const base = path.basename(t.path).toLowerCase();
            if (base && content.toLowerCase().includes(base)) {
              errorFileBasename = base;
              break;
            }
          }
        }
      }
    }
  }

  const getToolScoreDetails = (
    tool: any,
  ): { score: number; breakdown: { basePriority: number; symptomMatch: number; feasibilityScore: number } } => {
    const name = tool.name;
    let basePriority = 10;
    let symptomMatch = 0;
    let feasibilityScore = 0;

    // --- Feasibility validation: penalize tools that are structurally invalid ---
    if (name === 'read_file' && tool.path) {
      const fullPath = path.isAbsolute(tool.path) ? tool.path : path.join(workspacePath, tool.path);
      try {
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
          feasibilityScore = -45; // read_file on a directory is always invalid — use list_dir instead
        }
      } catch {
        console.error('statSync failed for feasibility check:', fullPath);
        // Path doesn't exist yet; no penalty (could be a new file to create)
      }
    }
    // -------------------------------------------------------------------------

    if (
      [
        'patch_file',
        'write_file',
        'create_file',
        'delete_file',
        'rename_file',
        'run_command',
        'send_terminal_input',
        'git_commit',
      ].includes(name)
    ) {
      basePriority = 100;
    } else if (name === 'read_file') {
      basePriority = 50;
      const pathLower = (tool.path || '').toLowerCase();

      if (symptom === 'BUILD_FAILURE' && errorFileBasename && pathLower.includes(errorFileBasename)) {
        symptomMatch = 45;
      } else if (symptom === 'NETWORK_ERROR') {
        if (pathLower.includes('axiosinstance') || pathLower.includes('axios')) symptomMatch = 40;
        else if (pathLower.includes('apiconfig') || pathLower.includes('config')) symptomMatch = 38;
        else if (pathLower.includes('network') || pathLower.includes('http') || pathLower.includes('api'))
          symptomMatch = 35;
      } else if (symptom === 'AUTH_FAILURE') {
        if (pathLower.includes('auth') || pathLower.includes('login') || pathLower.includes('credential'))
          symptomMatch = 40;
        else if (pathLower.includes('session') || pathLower.includes('token')) symptomMatch = 38;
        else if (pathLower.includes('store') || pathLower.includes('context')) symptomMatch = 35;
      }
    } else if (['grep_search', 'symbol_search', 'git_diff', 'git_status'].includes(name)) {
      basePriority = 30;
    }

    return {
      score: basePriority + symptomMatch + feasibilityScore,
      breakdown: { basePriority, symptomMatch, feasibilityScore },
    };
  };

  const alternatives = toolCalls
    .map((t) => {
      const details = getToolScoreDetails(t);
      return {
        tool: t.name,
        target: t.path || t.query || t.command || t.url || '',
        score: details.score,
        scoreBreakdown: details.breakdown,
      };
    })
    .sort((a, b) => b.score - a.score);

  // Parse ALL tool calls before selecting — never default to the first
  let best = toolCalls[0];
  let bestScore = getToolScoreDetails(best).score;

  for (let i = 1; i < toolCalls.length; i++) {
    const t = toolCalls[i];
    const s = getToolScoreDetails(t).score;
    if (s > bestScore) {
      best = t;
      bestScore = s;
    }
  }

  return { selectedTool: best, alternatives };
}

function rewriteResponseToSingleTool(rawText: string, selectedTool: any): string {
  let rewritten = rawText;

  const allTools = [
    'read_file',
    'list_dir',
    'ls_dir',
    'grep_search',
    'web_search',
    'browser_navigate',
    'browser_click',
    'browser_type',
    'browser_evaluate_script',
    'browser_screenshot',
    'figma_inspect',
    'run_command',
    'close_terminal',
    'read_terminal',
    'list_terminals',
    'delete_file',
    'git_status',
    'git_diff',
    'git_add',
    'symbol_search',
    'rename_symbol',
    'wait',
    'analyze_project',
    'analyze_dependencies',
    'analyze_complexity',
    'analyze_coverage',
    'analyze_dead_code',
    'analyze_impact',
    'graphify',
    'get_diagnostics',
    'create_file',
    'write_file',
    'patch_file',
    'send_terminal_input',
    'rename_file',
    'git_commit',
    'multi_patch_file',
    'multipatch_file',
  ];

  for (const toolName of allTools) {
    const openTagPattern = new RegExp('<' + toolName + '(\\s+[^>]*)?>', 'gi');
    let match;

    while ((match = openTagPattern.exec(rewritten)) !== null) {
      const tagStart = match.index;
      const tagContent = match[0];
      const pathAttr = /path\s*=\s*["']([^"']+)["']/i.exec(tagContent);
      const queryAttr = /query\s*=\s*["']([^"']+)["']/i.exec(tagContent);
      const commandAttr = /command\s*=\s*["']([^"']+)["']/i.exec(tagContent);
      const urlAttr = /url\s*=\s*["']([^"']+)["']/i.exec(tagContent);
      const inputAttr = /input\s*=\s*["']([^"']+)["']/i.exec(tagContent);

      const targetVal = pathAttr?.[1] || queryAttr?.[1] || commandAttr?.[1] || urlAttr?.[1] || inputAttr?.[1] || '';

      const isSelected =
        (toolName === selectedTool.name ||
          (toolName === 'ls_dir' && selectedTool.name === 'list_dir') ||
          (toolName === 'multipatch_file' && selectedTool.name === 'multi_patch_file')) &&
        targetVal.trim() ===
          (
            selectedTool.path ||
            selectedTool.query ||
            selectedTool.command ||
            selectedTool.url ||
            selectedTool.content ||
            ''
          ).trim();

      if (!isSelected) {
        let blockEnd = match.index + match[0].length;
        const closeTagRegex = new RegExp('</' + toolName + '\\s*>', 'i');
        const closeMatch = closeTagRegex.exec(rewritten.substring(blockEnd));

        if (closeMatch) {
          blockEnd += closeMatch.index + closeMatch[0].length;
        }

        rewritten = rewritten.substring(0, tagStart) + '\n' + rewritten.substring(blockEnd);

        openTagPattern.lastIndex = 0;
      }
    }
  }

  return rewritten;
}

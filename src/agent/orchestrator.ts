import * as vscode from 'vscode';
import { ChatMessage, LLMProvider } from '../types';
import { executeTool, ALL_REGISTERED_TOOLS } from './tools/tool-registry';
import { getDependentsOfFile } from './tools/code-analysis-tools';
import { RateLimiter } from '../services/rate-limiter';
import { ProviderFallback } from '../services/provider-fallback';
import { AgentSession } from './agent-session';
import { AgentParser } from './agent-parser';
import { AgentCompleter } from './agent-completer';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { getModelContextWindow } from './orchestrator-config';
import {
  buildSystemPrompt,
  hasDeclaredPlan,
  hasActionPlanningIntent,
  getDiagnosticsForFile,
} from './orchestrator-prompt';
import { ArtifactService } from '../services/artifact-service';
import { getToolSchemas, supportsNativeToolCalling } from './tool-schemas';
import { NativeToolCallParser } from './native-tool-call-parser';

// Modular imports
import { getContextLength, estimateTokens } from '../services/model-context';
import { computeInputTokenBudget } from '../services/context-budget';
import { maybeCompact, trimForContext } from '../services/context-compactor';
import { evaluateTurnResult } from './failure-detector';
import { sanitizeUserPrompt, untrustedContextMessage } from './prompt-security';
import { injectRelevantSkills } from '../services/skill-service';
import { maybeEscalate } from './teacher-escalation';
import { EventBus } from '../services/event-bus';

// New decomposed modules
import {
  AgentState,
  TaskMode,
  determineTaskMode,
  canDescribePatch,
  hasSufficientJSEvidence,
  isErrorDirectlyLocalized,
  hasEnoughInformationForReview,
  detectActiveSymptom,
} from './state-machine';
import { generateLightweightProjectMap } from './project-map';
import {
  logRewriteTelemetryToFile,
  selectHighestValueTool,
  rewriteResponseToSingleTool,
} from './rewrite-engine';
import { runWorkspaceVerification } from './verification-runner';
import { validateControlLoopGuard } from './control-loop-guard';

export { AgentState, TaskMode, determineTaskMode };

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

    const cachedConvo = this._activeMessages.filter((m) => m.role !== 'system' && !m.summarized);
    const incomingConvo = incomingHistory.filter((m) => m.role !== 'system' && !m.summarized);

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
      console.error('Failed to read .gitignore');
    }
    const patterns = ['node_modules/', '.mirror-vs/', 'turns.log'];
    const missing = patterns.filter((p) => !gitignoreContent.includes(p));
    if (missing.length > 0) {
      fs.writeFileSync(gitignorePath, gitignoreContent.trimEnd() + '\n' + missing.join('\n') + '\n', 'utf8');
      this._gitExec(['add', '.gitignore'], workspaceFolder);
    }

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

  private async _executeSingleTool(
    tool: any,
    taskMode: TaskMode,
    activeMode: string,
    verifiedFiles: Set<string>,
    searchCountWrapper: { val: number },
    maxSearchBudget: number,
    readRangesTracker: Map<string, { hash: string; ranges: Set<string> }>,
    lastSearches: string[],
    hasCommittedToPatch: boolean,
    agentState: AgentState,
    blockedScopes: string[],
    allowedScopes: string[],
    featureOwner: string,
    activeWarnings: string[],
    config: vscode.WorkspaceConfiguration,
    lastRewriteTelemetryWrapper: { val: any },
    lastSymptom: string,
    consecutivePatchFailuresWrapper: { val: number; lastFailedPath: string },
  ): Promise<string> {
    const target = tool.path || tool.query || tool.url || tool.selector || tool.command || '';

    const guard = validateControlLoopGuard(
      tool,
      taskMode,
      activeMode,
      verifiedFiles,
      this._activeMessages || [],
      searchCountWrapper.val,
      maxSearchBudget,
      readRangesTracker,
      lastSearches,
      hasCommittedToPatch,
      agentState,
      blockedScopes,
      allowedScopes,
      featureOwner
    );

    if (guard.warningsToAdd) {
      activeWarnings.push(...guard.warningsToAdd);
    }
    if (guard.newSearchCount !== undefined) {
      searchCountWrapper.val = guard.newSearchCount;
    }

    if (!guard.allowed) {
      this._sendToolStatusToWebview(tool.name, 'error', target, guard.reason);
      return '[Tool Result for ' + tool.name + ' on "' + target + '"]: Error - ' + guard.reason;
    }

    this._sendToolStatusToWebview(tool.name, 'running', target);
    try {
      const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const figmaKey = (await this._getSecret('figma_api_key')) || '';
      let result = await executeTool(tool, this._getSafePath, figmaKey, workspacePath);

      const isModifying = [
        'create_file', 'write_file', 'patch_file', 'multi_patch_file', 'delete_file', 'rename_file'
      ].includes(tool.name);

      if (isModifying) {
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
        const folders = vscode.workspace.workspaceFolders;
        if (folders && folders.length > 0) {
          const workspaceFolder = folders[0].uri.fsPath;
          if (tool.path) {
            const diagnosticsFeed = getDiagnosticsForFile(tool.path);
            result += diagnosticsFeed;
          }
          try {
            const verifyResult = runWorkspaceVerification(workspaceFolder);
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

      // Telemetry Outcome tracking for rewritten tool calls
      if (lastRewriteTelemetryWrapper.val && lastRewriteTelemetryWrapper.val.selectedTool === tool.name) {
        let outcome = 'SUCCESS';
        let outcomeReason = 'NO_NEW_INFORMATION';
        const lowerResult = result.toLowerCase();
        if (lowerResult.includes('error') || lowerResult.includes('failed')) {
          outcome = 'ERROR';
        } else {
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

        lastRewriteTelemetryWrapper.val.outcome = outcome;
        lastRewriteTelemetryWrapper.val.outcomeReason = outcomeReason;
        lastRewriteTelemetryWrapper.val.resultSnippet = result.substring(0, 200);
        logRewriteTelemetryToFile(lastRewriteTelemetryWrapper.val);
        lastRewriteTelemetryWrapper.val = null;
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
      return '[Tool Result for ' + tool.name + ' on "' + target + '"]: Success - ' + result;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`Tool execution failed (${tool.name}):`, errMsg);

      if (lastRewriteTelemetryWrapper.val && lastRewriteTelemetryWrapper.val.selectedTool === tool.name) {
        lastRewriteTelemetryWrapper.val.outcome = 'ERROR';
        lastRewriteTelemetryWrapper.val.outcomeReason = 'TOOL_EXECUTION_FAILED';
        lastRewriteTelemetryWrapper.val.resultSnippet = errMsg.substring(0, 200);
        logRewriteTelemetryToFile(lastRewriteTelemetryWrapper.val);
        lastRewriteTelemetryWrapper.val = null;
      }

      const isPatchTool =
        tool.name === 'patch_file' || tool.name === 'multi_patch_file' || tool.name === 'write_file';
      if (isPatchTool) {
        const failedPath = tool.path || 'unknown';
        if (failedPath === consecutivePatchFailuresWrapper.lastFailedPath) {
          consecutivePatchFailuresWrapper.val++;
        } else {
          consecutivePatchFailuresWrapper.val = 1;
          consecutivePatchFailuresWrapper.lastFailedPath = failedPath;
        }
      } else {
        consecutivePatchFailuresWrapper.val = 0;
        consecutivePatchFailuresWrapper.lastFailedPath = '';
      }

      this._sendToolStatusToWebview(tool.name, 'error', target, errMsg);
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

      if (images && images.length > 0) {
        const imageCheck = this._rateLimiter.checkImageBudget(images.length);
        if (!imageCheck.allowed) {
          this._postMessage({ type: 'chatResponseError', error: imageCheck.reason });
          return;
        }
      }

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
          return (await this._getSecret('deepseek_api_key')) || '';
        }
        if (p === 'gemini') {
          return (await this._getSecret('gemini_api_key')) || '';
        }
        if (p === 'openrouter') {
          return (await this._getSecret('openrouter_api_key')) || '';
        }
        if (p === 'litellm') {
          return (await this._getSecret('litellm_api_key')) || '';
        }
        if (p === 'custom') {
          return (await this._getSecret('custom_endpoint_api_key')) || '';
        }
        if (typeof p === 'string' && p.startsWith('custom_')) {
          return (await this._getSecret(`custom_api_key_${p}`)) || '';
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

      currentMessages = injectRelevantSkills(currentMessages, text || '');
      let activeMessages = this._getOrCreateActiveMessages(currentMessages);
      activeMessages = injectRelevantSkills(activeMessages, text || '');

      const pushToHistory = (msg: ChatMessage) => {
        currentMessages.push(msg);
        activeMessages.push(msg);
      };

      await this._ensureGitBaseline();

      const hasProjectMap = currentMessages.some(
        (msg) => msg.role === 'system' && msg.content.includes('[PROJECT STRUCTURE]'),
      );
      const folders = vscode.workspace.workspaceFolders;
      if (!hasProjectMap && folders && folders.length > 0) {
        try {
          const workspaceRoot = folders[0].uri.fsPath;
          const projectMap = await generateLightweightProjectMap(workspaceRoot);
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
      let consecutiveMalformedCount = 0;
      const maxMalformedRetries = 3;
      let sequentialExploratorySteps = 0;
      let consecutivePatchFailures = 0;
      let lastPatchFailedPath = '';

      let consecutiveToolFailures = 0;
      let lastFailedToolKey = '';
      let consecutiveVerbalGiveUps = 0;

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

      let featureOwner = '';
      let allowedScopes: string[] = [];
      let blockedScopes: string[] = [];

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
                  allowedScopes = value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
                } else if (key === 'SEARCH_SCOPE_BLOCKED') {
                  blockedScopes = value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
                }
              }
            }
          }
        }
      }

      let activeWarnings: string[] = [];

      try {
        while (continueLoop && loopCount < maxLoops) {
          if (signal.aborted) {
            continueLoop = false;
            break;
          }
          loopCount++;

          if (!hasSufficientJSEvidence(currentMessages)) {
            agentState = AgentState.NEEDS_EVIDENCE;
          } else if (hasEnoughInformationForReview(taskMode, verifiedFiles, currentMessages)) {
            agentState = AgentState.IMPLEMENTATION; 
          } else if (isErrorDirectlyLocalized(currentMessages, verifiedFiles)) {
            hasCommittedToPatch = true;
            agentState = AgentState.IMPLEMENTATION;
          } else if (searchCount >= maxSearchBudget) {
            agentState = AgentState.BLOCKED;
          } else if (hasCommittedToPatch) {
            agentState = AgentState.IMPLEMENTATION;
          }

          const currentSymptom = detectActiveSymptom(currentMessages);
          if (currentSymptom !== lastSymptom || agentState === AgentState.IMPLEMENTATION) {
            pendingActions = [];
          }
          lastSymptom = currentSymptom;

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

          const contextWindow = await getContextLength(currentHost, currentModel, apiKey);
          const configuredBudget = config.get('agentInputTokenBudget', 6000) as number;
          const explicitBudget =
            config.inspect('agentInputTokenBudget')?.globalValue !== undefined ||
            config.inspect('agentInputTokenBudget')?.workspaceValue !== undefined;

          const contextBudgetPercent = config.get<number>('contextBudgetPercent', 75);
          const headroom = contextBudgetPercent / 100;
          const hardMax = config.get('agentInputTokenHardMax', 200000) as number;
          const effectiveBudget = computeInputTokenBudget(configuredBudget, contextWindow, explicitBudget, { hardMax, headroom });

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
            this._activeMessages = activeMessages; 
          }

          this._postMessage({
            type: 'contextUsage',
            usedTokens: estimateTokens(activeMessages),
            maxTokens: effectiveBudget,
          });

          continueLoop = false;

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

          const reserveTokens = 1024;
          const trimmedPayload = trimForContext(payload, effectiveBudget, reserveTokens);

          const finalPayload = trimmedPayload.map((m: any) => {
            const out: any = { role: m.role, content: m.content };
            if (m.images) out.images = m.images;
            if (m.tool_call_id) out.tool_call_id = m.tool_call_id;
            if (m.tool_calls) out.tool_calls = m.tool_calls;
            return out;
          });

          const payloadTokens = estimateTokens(finalPayload);
          const utilization = Math.round((payloadTokens / contextWindow) * 100);
          console.log(
            `[Context] Payload: ${finalPayload.length} msgs, ~${Math.round(payloadTokens / 1000)}K tokens (model: ${currentModel}, window: ${Math.round(contextWindow / 1000)}K, budget: ${Math.round(effectiveBudget / 1000)}K, utilization: ${utilization}%, nativeTools: ${useNativeTools})`,
          );

          this._postMessage({ type: 'chatResponseStart' });

          const completionController = new AbortController();
          const mainAbortListener = () => completionController.abort();
          signal.addEventListener('abort', mainAbortListener);

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

          if (continueLoop && loopCount < maxLoops && assistantResponse === '') {
            continue;
          }

          signal.removeEventListener('abort', mainAbortListener);

          const earlyToolCalls = nativeToolCall ? [1] : this._parser.parseToolCalls(assistantResponse, true);
          assistantResponse = detectAndNormalizeWalkthrough(assistantResponse, earlyToolCalls.length);

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
                  allowedScopes = value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
                } else if (key === 'SEARCH_SCOPE_BLOCKED') {
                  blockedScopes = value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
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

          const planMatch = assistantResponse.match(/<implementation_plan>([\s\S]*?)<\/implementation_plan>/i);
          if (planMatch && !config.get<boolean>('autonomousMode', false) && !process.env.VITEST) {
            const { MirrorVsSidebarProvider } = require('../providers/sidebar-provider');
            const approved = await MirrorVsSidebarProvider.requestToolApproval(
              'implementation_plan',
              'Confirm Implementation Plan',
              planMatch[1].trim(),
            );
            if (!approved) {
              const errMsg = 'User rejected the proposed implementation plan.';
              this._postMessage({ type: 'chatResponseError', error: errMsg });
              return;
            }
          }

          if (canDescribePatch(assistantResponse, verifiedFiles)) {
            hasCommittedToPatch = true;
            agentState = AgentState.IMPLEMENTATION;
          }

          let toolCalls = [] as ReturnType<typeof this._parser.parseToolCalls>;
          if (nativeToolCall) {
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
            toolCalls = this._parser.parseToolCalls(assistantResponse, true);
          }

          if (toolCalls.length > 0) {
            if (toolCalls.length > 1) {
              const { selectedTool, alternatives } = selectHighestValueTool(toolCalls, currentMessages);
              console.log(
                `[Orchestrator] Multi-tool turn: ${toolCalls.length} tools. Top pick: ${selectedTool.name} (score shown in telemetry; all tools allowed).`,
              );
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

            // Executing via single deduplicated method
            if (readOnlyCalls.length > 0) {
              const searchCountWrapper = { val: searchCount };
              const lastRewriteTelemetryWrapper = { val: lastRewriteTelemetry };
              const consecutivePatchFailuresWrapper = { val: consecutivePatchFailures, lastFailedPath: lastPatchFailedPath };

              const promises = readOnlyCalls.map((tool) =>
                this._executeSingleTool(
                  tool,
                  taskMode,
                  activeMode,
                  verifiedFiles,
                  searchCountWrapper,
                  maxSearchBudget,
                  readRangesTracker,
                  lastSearches,
                  hasCommittedToPatch,
                  agentState,
                  blockedScopes,
                  allowedScopes,
                  featureOwner,
                  activeWarnings,
                  config,
                  lastRewriteTelemetryWrapper,
                  lastSymptom,
                  consecutivePatchFailuresWrapper,
                )
              );

              const resolvedResults = await Promise.all(promises);
              for (const r of resolvedResults) {
                if (r) toolResults.push(r);
              }
              searchCount = searchCountWrapper.val;
              lastRewriteTelemetry = lastRewriteTelemetryWrapper.val;
              consecutivePatchFailures = consecutivePatchFailuresWrapper.val;
              lastPatchFailedPath = consecutivePatchFailuresWrapper.lastFailedPath;
            }

            if (modifyingCalls.length > 0) {
              for (const tool of modifyingCalls) {
                if (signal.aborted) {
                  continueLoop = false;
                  break;
                }
                const searchCountWrapper = { val: searchCount };
                const lastRewriteTelemetryWrapper = { val: lastRewriteTelemetry };
                const consecutivePatchFailuresWrapper = { val: consecutivePatchFailures, lastFailedPath: lastPatchFailedPath };

                const r = await this._executeSingleTool(
                  tool,
                  taskMode,
                  activeMode,
                  verifiedFiles,
                  searchCountWrapper,
                  maxSearchBudget,
                  readRangesTracker,
                  lastSearches,
                  hasCommittedToPatch,
                  agentState,
                  blockedScopes,
                  allowedScopes,
                  featureOwner,
                  activeWarnings,
                  config,
                  lastRewriteTelemetryWrapper,
                  lastSymptom,
                  consecutivePatchFailuresWrapper,
                );
                
                toolResults.push(r);

                searchCount = searchCountWrapper.val;
                lastRewriteTelemetry = lastRewriteTelemetryWrapper.val;
                consecutivePatchFailures = consecutivePatchFailuresWrapper.val;
                lastPatchFailedPath = consecutivePatchFailuresWrapper.lastFailedPath;

                // Modifying failure check status
                if (r.includes('Error -')) {
                  const firstTool = modifyingCalls[0];
                  const currentFailedToolKey = firstTool ? `${firstTool.name}:${firstTool.path || firstTool.command || ''}` : '';
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

                if (tool.name === 'create_file' || tool.name === 'write_file' || tool.name === 'patch_file') {
                  agentState = AgentState.VERIFICATION;
                }

                if (signal.aborted) {
                  continueLoop = false;
                  break;
                }
              }
            }

            const modifiedPaths = toolCalls
              .filter((t) => t.name === 'patch_file' || t.name === 'write_file' || t.name === 'create_file')
              .map((t) => t.path)
              .filter(Boolean);
            if (modifiedPaths.length > 0) {
              const messageCountBeforeThisTurn = currentMessages.length;
              for (let mi = 0; mi < messageCountBeforeThisTurn; mi++) {
                const msg = currentMessages[mi];
                if (msg.role !== 'system' || msg.summarized) continue;
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
            }

            const images: string[] = [];
            const cleanedToolResults = toolResults.map((res) => {
              const match = res.match(/\(Base64 data hidden from output but sent to vision model: (.*)\)/);
              if (match) {
                images.push(match[1]);
                this._postMessage({ type: 'screenshotCapture', base64: match[1] });
                return res.replace(match[0], '(Image successfully captured and sent to vision model)');
              }
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

            if (turnEval.status === 'failure') {
              if (lastFailedToolKey) {
                // Keep same counter
              } else {
                consecutiveToolFailures = 1;
              }
            } else {
              consecutiveToolFailures = 0;
              lastFailedToolKey = '';
            }

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
              finalSystemContent += `\n\n[System Notice: The tool has failed 3 consecutive times. You may report this blocker to the user and request manual intervention if you are genuinely blocked.]`;
            } else if (sequentialExploratorySteps >= 4) {
              finalSystemContent +=
                '\n\n[System: You have performed several exploratory steps. Please evaluate if you have enough context. If you do, stop searching and execute the file patches immediately. Do not spend multiple turns re-reading the same file or scrolling in tiny increments. If you know the logic, write the patch block now.]';
            }

            if (nativeToolCall && (nativeToolCall as any).id) {
              const toolResultContent = finalSystemContent;
              pushToHistory({
                role: 'tool' as any,
                content: toolResultContent,
                tool_call_id: (nativeToolCall as any).id,
              } as ChatMessage);
            } else {
              const systemMessage = untrustedContextMessage('tool_execution_results', finalSystemContent);
              if (images.length > 0) systemMessage.images = images;
              pushToHistory(systemMessage);
            }
            await this._saveChatHistory(currentMessages);

            maybeEscalate(text || '', toolResults, assistantResponse, this._getSecret, this._postMessage);

            continueLoop = true;
            consecutiveMalformedCount = 0;
            consecutiveVerbalGiveUps = 0;
          } else {
            const allTools = Array.from(ALL_REGISTERED_TOOLS);
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
              const nudgeMsg = useNativeTools
                ? '[System Notice]: You emitted an <architecture_routing> block but did not invoke any functions. The architecture_routing block is guidance metadata and does not count as a response. You MUST immediately invoke exactly one function from the tools schema to proceed with your task.'
                : '[System Notice]: You emitted an <architecture_routing> block but did not invoke any tool tags. The architecture_routing block is guidance metadata and does not count as a response. You MUST immediately output exactly one valid tool tag (e.g., <read_file ...>) to proceed with your task.';
              pushToHistory({ role: 'system', content: nudgeMsg });
              await this._saveChatHistory(currentMessages);
              continueLoop = true;
            } else if (loopCount === 1 && hasActionPlanningIntent(assistantResponse)) {
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
      } catch (_) {}
    } finally {
      this._activeAbortController = undefined;
    }
  }

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

      const planMatch = assistantResponse.match(/<implementation_plan>([\s\S]*?)<\/implementation_plan>/i);
      if (planMatch) {
        const planContent = planMatch[1].trim();
        const planPath = path.join(mirrorVsDir, 'implementation_plan.md');
        fs.writeFileSync(planPath, planContent, 'utf8');

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
          taskContent = `- [ ] Analyze requirements\n- [ ] Implement changes\n- [ ] Verify execution\n`;
        }
        fs.writeFileSync(taskPath, taskContent, 'utf8');

        ArtifactService.getInstance()
          .createOrUpdateArtifact('task', 'markdown', 'Task List', taskContent, undefined, false)
          .catch((err) => console.warn('Failed to sync task list artifact:', err));
      }

      const walkthroughMatch = assistantResponse.match(/<walkthrough>([\s\S]*?)<\/walkthrough>/i);
      if (walkthroughMatch) {
        const walkthroughContent = walkthroughMatch[1].trim();
        const walkthroughPath = path.join(mirrorVsDir, 'walkthrough.md');
        fs.writeFileSync(walkthroughPath, walkthroughContent, 'utf8');

        ArtifactService.getInstance()
          .createOrUpdateArtifact('task', 'markdown', 'Task List', '', undefined, false) // trigger
          .catch(() => {});

        ArtifactService.getInstance()
          .createOrUpdateArtifact('walkthrough', 'markdown', 'Walkthrough', walkthroughContent, undefined, false)
          .catch((err) => console.warn('Failed to sync walkthrough artifact:', err));

        const taskPath = path.join(mirrorVsDir, 'task.md');
        if (fs.existsSync(taskPath)) {
          let taskContent = fs.readFileSync(taskPath, 'utf8');
          taskContent = taskContent.replace(/\[\s*\]/g, '[x]').replace(/\[\s*\/\]/g, '[x]');
          fs.writeFileSync(taskPath, taskContent, 'utf8');

          ArtifactService.getInstance()
            .createOrUpdateArtifact('task', 'markdown', 'Task List', taskContent, undefined, false)
            .catch((err) => console.warn('Failed to sync updated task list artifact:', err));
        }
      }
    } catch (e) {
      console.warn('Failed to sync planning files:', e);
    }
  }
}

export function detectAndNormalizeWalkthrough(response: string, toolCallsCount: number): string {
  if (response.includes('<walkthrough>')) {
    return response;
  }

  if (toolCallsCount > 0) {
    return response;
  }

  // Strip code blocks and blockquotes to avoid markdown structure edge cases
  const cleanText = response
    .replace(/```[\s\S]*?```/g, '')  // strip code fences
    .replace(/^\s*>\s*.*$/gm, '');   // strip blockquotes

  const lower = cleanText.toLowerCase();
  
  const walkthroughKeywords = [
    'walkthrough of changes',
    'walkthrough of the changes',
    'here is my walkthrough',
    'here is the walkthrough',
    'summary of changes',
    'summary of modifications',
    'walkthrough:',
    '### walkthrough',
    '## walkthrough',
  ];
  
  const hasExplicitWalkthrough = walkthroughKeywords.some(kw => lower.includes(kw));
  const completionKeywords = ['completed', 'finished', 'implemented', 'fixed', 'verified', 'all changes'];
  const hasCompletionKeywords = completionKeywords.some(kw => lower.includes(kw));
  const hasStructure = /^\s*[-*+]\s+/m.test(cleanText) || 
                       /^\s*\d+\.\s+/m.test(cleanText) || 
                       /^###?\s+/m.test(cleanText);

  const isPreparatory = /i will (now )?(write|create|start|output|do|perform) (a|the|some) walkthrough/i.test(cleanText) ||
                        /let's (start|write|do|perform) (a|the) walkthrough/i.test(cleanText) ||
                        /walkthrough the codebase/i.test(cleanText) ||
                        /walkthrough of the files/i.test(cleanText) ||
                        /walkthrough to/i.test(cleanText);

  if ((hasExplicitWalkthrough || (hasCompletionKeywords && hasStructure)) && !isPreparatory) {
    const rawLower = response.toLowerCase();
    const walkthroughIndex = rawLower.indexOf('walkthrough');
    if (walkthroughIndex !== -1 && response.substring(walkthroughIndex).length > 20) {
      const lineStart = response.lastIndexOf('\n', walkthroughIndex) + 1;
      const explanation = response.substring(0, lineStart).trim();
      const contentToWrap = response.substring(lineStart).trim();
      return explanation
        ? `${explanation}\n\n<walkthrough>\n${contentToWrap}\n</walkthrough>`
        : `<walkthrough>\n${contentToWrap}\n</walkthrough>`;
    }

    return `<walkthrough>\n${response.trim()}\n</walkthrough>`;
  }

  return response;
}

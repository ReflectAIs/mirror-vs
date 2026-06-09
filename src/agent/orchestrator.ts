import * as vscode from 'vscode';
import { ChatMessage, LLMProvider } from '../types';
import { executeTool } from './tools/tool-registry';
import { RateLimiter } from '../services/rate-limiter';
import { ProviderFallback } from '../services/provider-fallback';
import { AgentSession } from './agent-session';
import { AgentParser } from './agent-parser';
import { AgentCompleter } from './agent-completer';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { getModelContextWindow, estimateTokenCount, estimatePayloadTokens } from './orchestrator-config';
import { buildSystemPrompt, hasDeclaredPlan, hasActionPlanningIntent, getDiagnosticsForFile } from './orchestrator-prompt';
import { AgentMemoryService } from '../services/agent-memory-service';

export class AgentOrchestrator {
  private _activeAbortController: AbortController | undefined;
  private readonly _rateLimiter = RateLimiter.getInstance();
  private readonly _fallback = ProviderFallback.getInstance();
  private readonly _parser = new AgentParser();
  private readonly _session: AgentSession;
  private readonly _completer: AgentCompleter;

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
        const userMsg: ChatMessage = { role: 'user', content: text || '[Image provided]' };
        if (images && images.length > 0) userMsg.images = images;
        currentMessages.push(userMsg);
        await this._saveChatHistory(currentMessages);
      }

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
            content: `[PROJECT STRUCTURE]\nHere is a lightweight structure of the workspace to help you orient yourself:\n\n\`\`\`\n${projectMap}\n\`\`\``,
          };
          currentMessages.unshift(mapMsg);
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

      // Agent Control Loop Guard State Tracking (Eradicates Execution Paralysis)
      // let agentMode: "DISCOVERY" | "IMPLEMENTATION" | "VALIDATION" = "DISCOVERY";
      const activeMode = config.get<string>('agentMode', 'normal');
      let searchCount = 0;
      const maxSearchBudget = activeMode === 'debug' ? 30 : 10;
      const readHistory = new Set<string>();
      const lastSearches: string[] = [];
      let hasCommittedToPatch = false;

      const validateControlLoopGuard = (tool: any): { allowed: boolean; reason?: string } => {
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
          // 1. Commitment Lock (Search is blocked, but single-time read_file is permitted to check imports/signatures)
          if (hasCommittedToPatch && tool.name !== 'read_file' && activeMode !== 'debug') {
            return {
              allowed: false,
              reason: `[System Intervention - Commitment Locked]: You declared that you are ready to patch. In this state, exploratory search/exploratory tools like '${tool.name}' are BLOCKED. You are permitted to use 'read_file' once per file path if you need to verify parameter signatures, imports, or mutations, but you must proceed to implementation.`,
            };
          }

          // 2. Search Budget
          if (searchCount >= maxSearchBudget) {
            return {
              allowed: false,
              reason: `[System Intervention - Search Budget Exhausted]: You have exceeded your maximum allowed discovery budget of ${maxSearchBudget} search/read steps in this session. You are BLOCKED from performing further searches or reads. You MUST either immediately output the patch (patch_file/write_file) or stop and explain what is missing.`,
            };
          }

          // 3. "No Re-Read" Rule
          if (tool.name === 'read_file' && activeMode !== 'debug') {
            const startLine = tool.start_line || 1;
            const endLine = tool.end_line || 1000;
            const readKey = `${tool.path}:${startLine}-${endLine}`;
            if (readHistory.has(readKey)) {
              return {
                allowed: false,
                reason: `[System Intervention - No Re-Read]: You have already read the file section "${tool.path}" (lines ${startLine}-${endLine}) in this session. Re-reading identical content is BLOCKED to prevent wasted tokens and action loops. Please proceed to write the patch or explain using your existing knowledge.`,
              };
            }
            readHistory.add(readKey);
          }

          // 4. Convergence Detector
          searchCount++;
          const searchKey = `${tool.name}:${target}`;
          lastSearches.push(searchKey);
          if (lastSearches.length > 5) lastSearches.shift();

          if (lastSearches.length >= 3 && lastSearches.every((s) => s === searchKey)) {
            return {
              allowed: false,
              reason: `[System Intervention - Convergence Detector]: You have performed the identical search or read step "${searchKey}" three times consecutively without making progress. You have CONVERGED. You are BLOCKED from further redundant actions. You MUST proceed to execute the patch now.`,
            };
          }
        }

        // Clear read history if modifying a file or running a terminal command
        if (tool.name === 'patch_file' || tool.name === 'write_file' || tool.name === 'create_file') {
          if (tool.path) {
            for (const key of Array.from(readHistory.keys())) {
              if (key.startsWith(tool.path + ':')) {
                readHistory.delete(key);
              }
            }
          }
        } else if (tool.name === 'run_command') {
          readHistory.clear();
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

          // Context optimization guardrail: token-budget-based summarization
          const customEndpointUrl = config.get<string>('customEndpointUrl', 'https://api.openai.com/v1');
          const customEndpointModel = config.get<string>('customEndpointModel', 'gpt-4o');
          const customApis = config.get<any[]>('customApis', []);
          const activeCustomApi =
            typeof provider === 'string' && provider.startsWith('custom_')
              ? customApis.find((api) => api.id === provider)
              : null;

          const currentModel =
            provider === 'ollama'
              ? defaultOllamaModel
              : provider === 'deepseek'
                ? defaultDeepSeekModel
                : customEndpointModel;
          const currentHost =
            provider === 'ollama'
              ? ollamaHost
              : provider === 'deepseek'
                ? 'https://api.deepseek.com/chat/completions'
                : activeCustomApi
                  ? activeCustomApi.url
                  : customEndpointUrl;

          const contextWindow = getModelContextWindow(currentModel);
          const budgetPercent = config.get('contextBudgetPercent', 75) as number;
          const summarizeThreshold = contextWindow * (budgetPercent / 100);
          const targetBudget = contextWindow * (Math.max(budgetPercent - 20, 10) / 100);
          const turnsToRetain = config.get('turnsToRetain', 6);

          const systemPromptTokens = estimateTokenCount(
            buildSystemPrompt(loopCount, hasDeclaredPlan(currentMessages, '')),
          );
          const activeMessages = currentMessages.filter((msg, idx) => {
            if (idx === 0) return false;
            if (msg.role === 'system' && msg.content.includes('[CONSOLIDATED CONTEXT SUMMARY]')) return false;
            return !msg.summarized;
          });
          let activeTokens =
            systemPromptTokens + activeMessages.reduce((sum, msg) => sum + estimateTokenCount(msg.content), 0);

          // Dynamic token-driven file content eviction:
          // If we exceed the threshold, try to prune the oldest read_file contents first
          if (activeTokens > summarizeThreshold) {
            const readFileMessages = activeMessages.filter(
              (msg) =>
                msg.role === 'system' &&
                msg.content.startsWith('[Tool Result for read_file on "') &&
                msg.content.includes('"]: Success -'),
            );

            for (const msg of readFileMessages) {
              if (activeTokens <= targetBudget) break;
              const match = msg.content.match(/^\[Tool Result for read_file on "([^"]+)"\]: Success - /);
              if (match) {
                const filePath = match[1];
                const prevTokens = estimateTokenCount(msg.content);
                msg.content = `[Tool Result for read_file on "${filePath}"]: (Content evicted dynamically to stay within token budget. Re-read the file to see contents.)`;
                const newTokens = estimateTokenCount(msg.content);
                activeTokens = activeTokens - prevTokens + newTokens;
              }
            }
            await this._saveChatHistory(currentMessages);
          }

          if (activeTokens > summarizeThreshold) {
            try {
              // Remove oldest messages until under target budget
              let tokensToRemove = activeTokens - targetBudget;
              let summarizeCount = 0;
              let removedTokens = 0;
              for (let i = 0; i < activeMessages.length - turnsToRetain; i++) {
                removedTokens += estimateTokenCount(activeMessages[i].content);
                summarizeCount = i + 1;
                if (removedTokens >= tokensToRemove) break;
              }
              if (summarizeCount === 0) summarizeCount = Math.max(1, activeMessages.length - turnsToRetain);

              const toSummarize = activeMessages.slice(0, summarizeCount);
              const existingSummaries = currentMessages.filter(
                (msg) => msg.role === 'system' && msg.content.includes('[CONSOLIDATED CONTEXT SUMMARY]'),
              );
              this._postMessage({ type: 'chatResponseStart' });
              this._postMessage({
                type: 'chatResponseChunk',
                text: `Compressing context (~${Math.round(activeTokens / 1000)}K tokens → target ~${Math.round(targetBudget / 1000)}K, model window: ${Math.round(contextWindow / 1000)}K)...`,
              });
              const summary = await this._completer.summarizeHistory(
                provider as LLMProvider,
                currentHost,
                currentModel,
                apiKey,
                [...existingSummaries, ...toSummarize],
              );
              const summaryMsg: ChatMessage = { role: 'system', content: '[CONSOLIDATED CONTEXT SUMMARY]\n' + summary };
              const cleaned = currentMessages.filter(
                (msg) => !(msg.role === 'system' && msg.content.includes('[CONSOLIDATED CONTEXT SUMMARY]')),
              );
              toSummarize.forEach((msg) => {
                const found = cleaned.find((m) => m === msg);
                if (found) {
                  found.summarized = true;
                  found.content = `[Summarized: ${found.role} message, ${found.content.length} chars original]`;
                  if (found.images) found.images = [];
                }
              });
              currentMessages = [cleaned[0], summaryMsg, ...cleaned.slice(1)];
              await this._saveChatHistory(currentMessages);
              this._postMessage({ type: 'updateChatHistory', history: currentMessages });
              this._postMessage({ type: 'chatResponseComplete', fullText: 'Context optimized.' });
            } catch (e: unknown) {
              console.warn('Failed to summarize history:', e instanceof Error ? e.message : String(e));
            }
          }
          continueLoop = false;

          const resolvedPayloadPromises = currentMessages
            .filter((msg) => !msg.summarized)
            .map(async (msg) => {
              let content = msg.content;
              if (msg.role === 'user' && content) {
                content = await this._resolveFileRefs(content);
              }
              return {
                role: (msg.role === 'system' ? 'user' : msg.role) as 'user' | 'assistant' | 'system',
                content: content,
                images: msg.images,
              };
            });
          const resolvedPayload = await Promise.all(resolvedPayloadPromises);

          const payload: ChatMessage[] = [
            { role: 'system', content: buildSystemPrompt(loopCount, hasDeclaredPlan(currentMessages, '')) },
            ...resolvedPayload,
          ];

          // Payload diagnostics
          const payloadTokens = estimatePayloadTokens(payload);
          const utilization = Math.round((payloadTokens / contextWindow) * 100);
          console.log(
            `[Context] Payload: ${payload.length} msgs, ~${Math.round(payloadTokens / 1000)}K tokens (model: ${currentModel}, window: ${Math.round(contextWindow / 1000)}K, utilization: ${utilization}%)`,
          );

          this._postMessage({ type: 'chatResponseStart' });

          const completionController = new AbortController();
          const mainAbortListener = () => completionController.abort();
          signal.addEventListener('abort', mainAbortListener);

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
                payload,
                completionController.signal,
                this._session.sessionId,
                completionController,
                vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || undefined,
              );

              // If response is not empty, we are good
              if (assistantResponse && assistantResponse.trim() !== '') {
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

          currentMessages.push({ role: 'assistant', content: assistantResponse });
          await this._saveChatHistory(currentMessages);

          // Commitment Detection: check if the model says it has enough context or is ready to patch
          const lowerResponse = assistantResponse.toLowerCase();
          const commitmentPatterns = [
            'i will now apply the patch',
            'i will now modify',
            "i'll write the patch",
            'i will write the patch',
            'i have enough context',
            'i will now implement',
            'applying the patch',
            'applying patch',
            "i'm ready to patch",
            'i am ready to patch',
          ];
          if (commitmentPatterns.some((p) => lowerResponse.includes(p))) {
            hasCommittedToPatch = true;
            // agentMode = "IMPLEMENTATION";
          }

          const toolCalls = this._parser.parseToolCalls(assistantResponse, true);

          if (toolCalls.length > 0) {
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
            const isAllReadOnly = toolCalls.every((t) => readOnlyTools.includes(t.name));
            if (isAllReadOnly) {
              // Parallel execution for read-only tools
              const promises = toolCalls.map(async (tool) => {
                if (signal.aborted) return;
                const target = tool.path || tool.query || tool.url || tool.selector || tool.command || '';

                const guard = validateControlLoopGuard(tool);
                if (!guard.allowed) {
                  this._sendToolStatusToWebview(tool.name, 'error', target, guard.reason);
                  this._sendAvatarState('error');
                  return '[Tool Result for ' + tool.name + ' on "' + target + '"]: Error - ' + guard.reason;
                }

                this._sendToolStatusToWebview(tool.name, 'running', target);
                try {
                  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                  const figmaKey = (await this._getSecret('figma_api_key')) || '';
                  const result = await executeTool(tool, this._getSafePath, figmaKey, workspacePath);

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
                  const errMsg = err instanceof Error ? err.message : String(err);
                  this._sendToolStatusToWebview(tool.name, 'error', target, errMsg);
                  this._sendAvatarState('error');
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
            } else {
              // Sequential execution for mixed or modifying tools
              for (const tool of toolCalls) {
                if (signal.aborted) {
                  continueLoop = false;
                  break;
                }
                const target = tool.path || tool.query || tool.url || tool.selector || tool.command || '';

                const guard = validateControlLoopGuard(tool);
                if (!guard.allowed) {
                  this._sendToolStatusToWebview(tool.name, 'error', target, guard.reason);
                  this._sendAvatarState('error');
                  toolResults.push(`[Tool Result for ${tool.name} on "${target}"]: Error - ${guard.reason}`);
                  continue;
                }

                this._sendToolStatusToWebview(tool.name, 'running', target);
                try {
                  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                  const figmaKey = (await this._getSecret('figma_api_key')) || '';
                  let result = await executeTool(tool, this._getSafePath, figmaKey, workspacePath);

                  // Grounding Verification Hook
                  if (tool.name === 'create_file' || tool.name === 'write_file' || tool.name === 'patch_file') {
                    await new Promise((resolve) => setTimeout(resolve, 300));
                    if (tool.path) {
                      const diagnosticsFeed = getDiagnosticsForFile(tool.path);
                      result += diagnosticsFeed;
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
                  const errMsg = err instanceof Error ? err.message : String(err);
                  this._sendToolStatusToWebview(tool.name, 'error', target, errMsg);
                  this._sendAvatarState('error');
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
            if (sequentialExploratorySteps >= 4) {
              finalSystemContent +=
                '\n\n[System: You have performed several exploratory steps. Please evaluate if you have enough context. If you do, stop searching and execute the file patches immediately. Do not spend multiple turns re-reading the same file or scrolling in tiny increments. If you know the logic, write the patch block now.]';
            }
            const systemMessage: ChatMessage = { role: 'system', content: finalSystemContent };
            if (images.length > 0) systemMessage.images = images;
            currentMessages.push(systemMessage);
            await this._saveChatHistory(currentMessages);
            continueLoop = true;
            consecutiveMalformedCount = 0;
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
              'analyze_dead_code',
              'analyze_impact',
              'graphify',
            ];
            const stripped = this._parser.stripCodeBlocks(assistantResponse);
            // Only check partial tags if we already see what looks like a tool attempt
            const ltChar = String.fromCharCode(60);
            const hasToolAttempt =
              stripped.includes(ltChar + 'read_file') || allTools.some((t) => stripped.includes(ltChar + t));
            if (hasToolAttempt && consecutiveMalformedCount < maxMalformedRetries) {
              consecutiveMalformedCount++;
              const errorMsg =
                '[Tool Parsing Error]: Your tool call was malformed or incomplete (attempt ' +
                consecutiveMalformedCount +
                '/' +
                maxMalformedRetries +
                '). Please retry with correct XML syntax.';
              currentMessages.push({ role: 'system', content: errorMsg });
              await this._saveChatHistory(currentMessages);
              continueLoop = true;
            } else if (loopCount === 1 && hasActionPlanningIntent(assistantResponse)) {
              // Conversational nudge: if the model gave a conversational greeting in its very first turn without calling any tools,
              // but explicitly indicated that it plans to perform actions, we nudge it to execute a tool to keep the autonomous flow alive.
              const nudgeMsg =
                "[System Notice]: You did not invoke any tool tags in your response. If you need to search, read/write files, run commands, or analyze the workspace to fulfill the user's request, please output a valid tool tag now to continue autonomously.";
              currentMessages.push({ role: 'system', content: nudgeMsg });
              await this._saveChatHistory(currentMessages);
              continueLoop = true;
            }
          }
        }
        this._sendAvatarState('idle');
        this._postMessage({ type: 'updateChatHistory', history: currentMessages });
        this._postMessage({ type: 'loopComplete' });
      } catch (err: unknown) {
        if (signal.aborted) {
          console.log('Agent stream aborted.');
          this._sendAvatarState('idle');
          this._postMessage({ type: 'updateChatHistory', history: currentMessages });
          this._postMessage({ type: 'loopComplete' });
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
    return text.replace(/\[([^\[\]]+?)\]/g, (match: string, filePath: string) => {
      try {
        const trimmed = filePath.trim();
        const fullPath = path.join(workspaceRoot, trimmed);
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const ext = path.extname(trimmed).slice(1) || 'txt';
          return `\n\`\`\`${ext}:${trimmed}\n${content}\n\`\`\``;
        }
      } catch {}
      return match;
    });
  }

  private async _generateLightweightProjectMap(workspaceRoot: string): Promise<string> {
    const shouldSkipDir = (name: string): boolean => {
      return [
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
    };

    const countFiles = (dir: string): number => {
      let count = 0;
      try {
        const entries = fs.readdirSync(dir);
        for (const e of entries) {
          if (shouldSkipDir(e)) continue;
          const fp = path.join(dir, e);
          try {
            const s = fs.statSync(fp);
            if (s.isDirectory()) {
              count += countFiles(fp);
            } else if (s.isFile()) {
              count++;
            }
          } catch {
            /* skip */
          }
        }
      } catch {
        /* skip */
      }
      return count;
    };

    const buildTree = (dir: string, depth: number, prefix: string): string[] => {
      if (depth > 2) return [];
      const lines: string[] = [];
      try {
        const entries = fs.readdirSync(dir);
        const dirs: string[] = [];
        const files: string[] = [];

        for (const e of entries) {
          if (shouldSkipDir(e)) continue;
          const fp = path.join(dir, e);
          try {
            const s = fs.statSync(fp);
            if (s.isDirectory()) {
              dirs.push(e);
            } else if (s.isFile()) {
              files.push(e);
            }
          } catch {
            /* skip */
          }
        }

        dirs.sort();
        files.sort();

        const allItems = [
          ...dirs.map((d) => ({ name: d, isDir: true })),
          ...files.map((f) => ({ name: f, isDir: false })),
        ];

        const maxItemsToDisplay = 15;
        const displayItems = allItems.slice(0, maxItemsToDisplay);

        for (let i = 0; i < displayItems.length; i++) {
          const item = displayItems[i];
          const isLast = i === displayItems.length - 1 && displayItems.length === allItems.length;
          const marker = isLast ? '└── ' : '├── ';
          const childPrefix = prefix + (isLast ? '    ' : '│   ');

          if (item.isDir) {
            const fullPath = path.join(dir, item.name);
            const numFiles = countFiles(fullPath);
            lines.push(`${prefix}${marker}${item.name}/ (${numFiles} files)`);
            if (depth < 2) {
              lines.push(...buildTree(fullPath, depth + 1, childPrefix));
            }
          } else {
            lines.push(`${prefix}${marker}${item.name}`);
          }
        }
        if (allItems.length > maxItemsToDisplay) {
          lines.push(`${prefix}└── ... and ${allItems.length - maxItemsToDisplay} more items`);
        }
      } catch {
        /* skip */
      }
      return lines;
    };

    try {
      const rootFilesCount = countFiles(workspaceRoot);
      const treeLines = buildTree(workspaceRoot, 0, '');
      return `Root: ${path.basename(workspaceRoot)} (${rootFilesCount} files total)\n` + treeLines.join('\n');
    } catch (e) {
      return `Error generating map: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
}


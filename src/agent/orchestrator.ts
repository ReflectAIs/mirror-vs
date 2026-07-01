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
  buildStaticSystemPromptCore,
  buildDynamicSystemContext,
  hasDeclaredPlan,
  hasActionPlanningIntent,
  getDiagnosticsForFile,
} from './orchestrator-prompt';
import { evictStaleToolResults } from '../services/tool-result-eviction';
import { ArtifactService } from '../services/artifact-service';
import { getToolSchemas, supportsNativeToolCalling } from './tool-schemas';
import { NativeToolCallParser } from './native-tool-call-parser';
import * as crypto from 'crypto';
import { generateUnifiedDiff } from '../utils/diff';

// Modular imports
import { getContextLength, estimateTokens } from '../services/model-context';
import { computeInputTokenBudget } from '../services/context-budget';
import { maybeCompact, trimForContext, COMPACT_THRESHOLD, SELF_SUMMARY_SYSTEM_PROMPT } from '../services/context-compactor';
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

// Mirror VS Runtime integration
import { StateGraph } from './runtime/state-graph';
import { TaskQueue } from './runtime/task-queue';
import { ContextStore } from './runtime/context-store';
import { ActionRequestManager } from './runtime/action-request';
import { LoopDetector } from './runtime/loop-detector';
import { ExplorerModeManager } from './runtime/explorer-mode';
import { ConfidenceEngine } from './runtime/confidence-engine';
import { JobManager } from './runtime/job-manager';
import { detectWorkspaceAdapter, WorkspaceAdapter } from './runtime/workspace-adapters';
import { ExecutionState } from './runtime/types';
import { sanitizeToolMessages } from '../services/context-compactor';
import { RecoveryEngine } from './runtime/recovery-engine';
import { VerificationPipeline } from './runtime/verification-pipeline';
import { ASTParser } from './runtime/ast-parser';
import { KnowledgeGraph } from './runtime/knowledge-graph';
import { MultiAgentCoordinator } from './runtime/multi-agent';
import { LearningEngine } from './runtime/learning-engine';

export { AgentState, TaskMode, determineTaskMode };

export class AgentOrchestrator {
  private _activeAbortController: AbortController | undefined;
  private readonly _rateLimiter = RateLimiter.getInstance();
  private readonly _fallback = ProviderFallback.getInstance();
  private readonly _parser = new AgentParser();
  private readonly _session: AgentSession;
  private readonly _completer: AgentCompleter;

  private _activeMessages: ChatMessage[] | undefined;
  private _isCompacting = false;
  private readonly _sentFiles = new Map<string, { hash: string; content: string }>();

  // Context reduction: read_file dedup cache
  // key = file path  →  { hash of last-returned result, loop turn number }
  private readonly _readFileCache = new Map<string, { hash: string; turn: number }>();

  // Context reduction: system prompt static-core cache
  private _systemPromptCache: string | null = null;
  private _systemPromptCacheKey: string = '';

  // Runtime instances
  private readonly _stateGraph = new StateGraph();
  private readonly _taskQueue = new TaskQueue();
  private readonly _contextStore = new ContextStore();
  private readonly _actionManager = new ActionRequestManager();
  private readonly _loopDetector = new LoopDetector();
  private readonly _explorerManager = new ExplorerModeManager();
  private readonly _confidenceEngine = new ConfidenceEngine();
  private readonly _jobManager = new JobManager();
  private readonly _recoveryEngine = new RecoveryEngine();
  private readonly _astParser = new ASTParser();
  private readonly _knowledgeGraph = new KnowledgeGraph();
  private readonly _multiAgent = new MultiAgentCoordinator();
  private readonly _virtualPageCache = new Map<string, { content: string; ext: string; hash: string }>();
  private _sessionModifiedFiles = new Set<string>();
  private _sessionSearchedQueries = new Set<string>();
  private _sessionVerifiedBuild = false;
  private _sessionCompletedActions: string[] = [];
  private _lastToolStatus: { name: string; status: 'success' | 'failed' | 'running'; reason?: string } | null = null;
  private _learningEngine: LearningEngine | undefined;
  private _workspaceAdapter: WorkspaceAdapter | undefined;

  constructor(
    private readonly _getSecret: (key: string) => Promise<string | undefined>,
    _getChatHistory: () => ChatMessage[],
    private readonly _saveChatHistory: (history: ChatMessage[]) => Promise<void>,
    private readonly _postMessage: (msg: any) => void,
    private readonly _getSafePath: (targetPath: string) => string,
  ) {
    this._session = new AgentSession(_getSecret, _getChatHistory, _saveChatHistory, _postMessage, _getSafePath);
    this._completer = new AgentCompleter(_postMessage);
    
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceFolder) {
      this._workspaceAdapter = detectWorkspaceAdapter(workspaceFolder);
      this._learningEngine = new LearningEngine(workspaceFolder);
    }
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
      this._sentFiles.clear();
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

    // Parse stable ActionRequest
    const request = this._actionManager.parseActionRequest(tool);
    
    // Track execution as a job
    const isJobType = [
      'create_file', 'write_file', 'patch_file', 'multi_patch_file',
      'delete_file', 'rename_file', 'run_command'
    ].includes(tool.name);

    let jobId = '';
    if (isJobType) {
      const job = this._jobManager.createJob(
        tool.name === 'run_command' ? (tool.command || 'run_command') : `File Ops: ${tool.name} on ${target}`,
        tool.name === 'run_command' ? 'generic' : 'generic'
      );
      jobId = job.id;
      this._jobManager.startJob(jobId);
    }

    this._sendToolStatusToWebview(tool.name, 'running', target);
    try {
      const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const figmaKey = (await this._getSecret('figma_api_key')) || '';
      let result = await executeTool(tool, this._getSafePath, figmaKey, workspacePath, this._activeMessages);

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

        // Build Knowledge Graph dynamically
        if (tool.path) {
          try {
            const fullPath = this._getSafePath(tool.path);
            if (fs.existsSync(fullPath)) {
              const fileContent = fs.readFileSync(fullPath, 'utf8');
              this._knowledgeGraph.addNode(tool.path, 'file');
              const importRegex = /import\s+.*from\s+['"]([^'"]+)['"]/g;
              let match;
              while ((match = importRegex.exec(fileContent)) !== null) {
                const imported = match[1];
                this._knowledgeGraph.addNode(imported, 'file');
                this._knowledgeGraph.addEdge(tool.path, imported, 'imports');
              }
            }
          } catch (e) {
            console.warn('Failed to construct dynamic knowledge graph relationship:', e);
          }
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
            if (this._workspaceAdapter) {
              const pipeline = new VerificationPipeline(this._workspaceAdapter);
              const report = await pipeline.verify();
              result += `\n\n### 🔎 WORKSPACE VERIFICATION STATUS [${this._workspaceAdapter.name}]:\n`;
              result += `- Build status: ${report.buildStatus.toUpperCase()}\n`;
              result += `- Diagnostics error/warning count: ${report.diagnosticsCount}\n`;
              result += `- Test status: ${report.testStatus.toUpperCase()}\n`;
              
              if (report.success) {
                try {
                  EventBus.getInstance().fire('VerificationPassed', { adapter: this._workspaceAdapter.name });
                } catch (e) {
                  console.error('Failed to fire VerificationPassed event:', e);
                }
              }
            } else {
              const verifyResult = runWorkspaceVerification(workspaceFolder);
              result += verifyResult;
            }
          } catch (e) {
            console.error('Failed to run verification pipeline:', e);
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

      // Strategy 5: read_file deduplication
      // If the model reads the same file twice and the content is unchanged, return a compact
      // placeholder instead of the full content again — avoids duplicate KB-size entries in history.
      // The placeholder contains exact re-read instructions as the model's "way out".
      if (tool.name === 'read_file' && tool.path) {
        const resultHash = crypto.createHash('md5').update(result).digest('hex').substring(0, 12);
        const cached = this._readFileCache.get(tool.path);
        if (cached && cached.hash === resultHash) {
          result =
            `[File: ${tool.path} — content identical to earlier read this session ` +
            `(hash: ${resultHash}). The full content is already in your context above. ` +
            `Re-read with <read_file path="${tool.path}" /> or a specific range ` +
            `<read_file path="${tool.path}" start_line="N" end_line="M" /> if it has scrolled out of view.]`;
          console.log(`[ReadFileDedup] Returning compact placeholder for ${tool.path} (unchanged, hash ${resultHash})`);
        } else {
          // New content or first read — update cache
          this._readFileCache.set(tool.path, { hash: resultHash, turn: readRangesTracker.size });
        }
      }

      // Invalidate read_file dedup cache for edited files so the next read always returns fresh content
      if (
        (tool.name === 'patch_file' || tool.name === 'multi_patch_file' ||
         tool.name === 'write_file' || tool.name === 'create_file') &&
        tool.path
      ) {
        if (this._readFileCache.has(tool.path)) {
          this._readFileCache.delete(tool.path);
          console.log(`[ReadFileDedup] Cache invalidated for ${tool.path} after write/patch`);
        }
      }

      let displayResult = result;
      if (tool.name === 'browser_screenshot') {
        const match = result.match(/\(Base64 data hidden from output but sent to vision model:\s*([^)]+)\)/);
        if (match) displayResult = result.replace(match[0], '(Image captured)');
      } else {
        // Per-tool output limits — read_file gets more budget (needs full context),
        // run_command / browser ops get less (usually just status / errors matter).
        const defaultMax = config.get<number>('maxToolOutputLength', 8000);
        const toolOutputLimits: Record<string, number> = {
          read_file:               Math.min(defaultMax * 2, 20000),  // needs full content for patching
          grep_search:             Math.min(defaultMax, 6000),
          semantic_search:         Math.min(defaultMax, 5000),
          web_search:              Math.min(defaultMax, 5000),
          list_dir:                Math.min(defaultMax, 3000),
          run_command:             Math.min(defaultMax, 4000),
          browser_evaluate_script: Math.min(defaultMax, 3000),
          browser_navigate:        Math.min(defaultMax, 2000),
          read_terminal:           Math.min(defaultMax, 3000),
          get_diagnostics:         Math.min(defaultMax, 5000),
        };
        const truncateThreshold = toolOutputLimits[tool.name] ?? defaultMax;

        if (result.length > truncateThreshold) {
          // Keep 70% from start (most important context), 30% from tail (end state)
          const keep = Math.floor(truncateThreshold * 0.7);
          const tail = Math.max(200, truncateThreshold - keep);
          const truncatedChars = result.length - keep - tail;

          // Build a helpful recovery hint so the model always has a way out
          const recoveryHint = (() => {
            const p = tool.path || tool.file || tool.target || tool.url || '';
            switch (tool.name) {
              case 'read_file':
                return p
                  ? ` Use <read_file path="${p}" start_line="N" end_line="M" /> to read specific line ranges.`
                  : ' Use read_file with start_line/end_line to read specific sections.';
              case 'grep_search':
                return ' Narrow with a more specific path/query or use start_line/end_line on matched files.';
              case 'run_command':
                return ' Run a more targeted command or pipe output through head/tail/grep.';
              case 'web_search':
                return ' Re-run with a more specific query, or use browser_navigate to read the page directly.';
              case 'list_dir':
                return p ? ` Re-list a subdirectory: <list_dir path="${p}/subdir" />.` : '';
              default:
                return ' Re-run the tool with a more targeted query if needed.';
            }
          })();

          displayResult =
            result.substring(0, keep).trimEnd() +
            `\n\n[... ${truncatedChars} characters omitted to save context.${recoveryHint}]\n\n` +
            result.substring(result.length - tail).trimStart();
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

      // Track session metrics for the state machine and JSON context
      const lowerResult = result.toLowerCase();
      const isFailed = lowerResult.includes('error') || lowerResult.includes('failed');

      this._lastToolStatus = {
        name: tool.name,
        status: isFailed ? 'failed' : 'success',
        reason: isFailed ? result.substring(0, 150) : undefined
      };

      if (!isFailed) {
        if (tool.name === 'create_file' || tool.name === 'write_file' || tool.name === 'patch_file') {
          if (tool.path) {
            this._sessionModifiedFiles.add(tool.path);
            this._sessionCompletedActions.push(`Modified file ${tool.path}`);
          }
        } else if (tool.name === 'multi_patch_file') {
          if (tool.path) {
            this._sessionModifiedFiles.add(tool.path);
            this._sessionCompletedActions.push(`Multi-patched file ${tool.path}`);
          }
        } else if (tool.name === 'grep_search' || tool.name === 'semantic_search' || tool.name === 'web_search') {
          const q = tool.query || tool.content || '';
          if (q) {
            this._sessionSearchedQueries.add(q);
            this._sessionCompletedActions.push(`Searched for "${q}"`);
          }
        } else if (tool.name === 'read_file') {
          if (tool.path) {
            this._sessionCompletedActions.push(`Read file ${tool.path}`);
          }
        } else if (tool.name === 'run_command') {
          const cmd = (tool.command || '').toLowerCase();
          this._sessionCompletedActions.push(`Executed command "${tool.command}"`);
          if (cmd.includes('compile') || cmd.includes('test') || cmd.includes('build') || cmd.includes('vitest')) {
            this._sessionVerifiedBuild = true;
          }
        }
      }

      if (jobId) {
        this._jobManager.completeJob(jobId, result, 0);
      }

      if (isModifying && this._learningEngine && tool.path) {
        this._learningEngine.registerOutcome(
          this._taskQueue.activeTaskId || 'task',
          request.patchStrategy || 'line',
          true
        );
      }

      // Track action for repetition loop detection
      const actionTarget = tool.path || tool.query || tool.command || target || '';
      const actionKey = `${tool.name}:${actionTarget}`;
      this._loopDetector.registerAction(actionKey);

      // Loop Detector progress tracking
      if (tool.name === 'create_file') {
        this._loopDetector.registerProgress('new_file', target);
      } else if (tool.name === 'patch_file' || tool.name === 'write_file' || tool.name === 'multi_patch_file') {
        this._loopDetector.registerProgress('patch_applied', target);
      } else if (tool.name === 'run_command') {
        this._loopDetector.registerProgress('build_completed', target);
      }

      // If this was modifying, transition StateGraph to Verifying state
      if (isModifying) {
        await this._stateGraph.transitionTo(ExecutionState.Verifying);
        try {
          EventBus.getInstance().fire('FilePatched', { path: tool.path });
        } catch (e) {
          console.error('Failed to fire FilePatched event:', e);
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
      return '[Tool Result for ' + tool.name + ' on "' + target + '"]: Success - ' + result;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`Tool execution failed (${tool.name}):`, errMsg);

      if (jobId) {
        this._jobManager.failJob(jobId, errMsg, 1);
      }

      // Transition StateGraph to Recovery state
      await this._stateGraph.transitionTo(ExecutionState.Recovery);

      let recoveryNotice = '';
      if (tool.path) {
        this._recoveryEngine.registerFailure(tool.path);
        const request = this._actionManager.parseActionRequest(tool);
        
        if (this._learningEngine) {
          this._learningEngine.registerOutcome(
            this._taskQueue.activeTaskId || 'task',
            request.patchStrategy || 'line',
            false
          );
        }

        const escalated = this._recoveryEngine.suggestRecovery(request, errMsg);
        if (escalated.patchStrategy === 'rewrite') {
          recoveryNotice = `\n[Recovery Engine Notice]: Consecutive patch failures detected for "${tool.path}". Escalating strategy to rewrite. Do NOT use patch_file or multi_patch_file. Instead, use write_file to overwrite the file contents completely.`;
        } else if (escalated.details && escalated.details._recoveryNotice) {
          recoveryNotice = `\n[Recovery Engine Notice]: ${escalated.details._recoveryNotice}`;
        }
      }

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
        recoveryNotice +
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

        // Reset and initialize runtime components
        this._stateGraph.reset();
        this._taskQueue.clear();
        this._taskQueue.addTask(text || 'Execute workspace tasks');
        this._loopDetector.clear();
        this._explorerManager.reset();
        this._jobManager.clear();
        this._recoveryEngine.clear();
        this._virtualPageCache.clear();
        this._sessionModifiedFiles.clear();
        this._sessionSearchedQueries.clear();
        this._sessionVerifiedBuild = false;
        this._sessionCompletedActions = [];
        this._lastToolStatus = null;
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

          // 1. Transition state graph based on heuristics
          if (!hasSufficientJSEvidence(currentMessages)) {
            agentState = AgentState.NEEDS_EVIDENCE;
            await this._stateGraph.transitionTo(ExecutionState.Reasoning);
          } else if (hasEnoughInformationForReview(taskMode, verifiedFiles, currentMessages)) {
            agentState = AgentState.IMPLEMENTATION; 
            await this._stateGraph.transitionTo(ExecutionState.Planning);
          } else if (isErrorDirectlyLocalized(currentMessages, verifiedFiles)) {
            hasCommittedToPatch = true;
            agentState = AgentState.IMPLEMENTATION;
            await this._stateGraph.transitionTo(ExecutionState.Executing);
          } else if (searchCount >= maxSearchBudget) {
            agentState = AgentState.BLOCKED;
            await this._stateGraph.transitionTo(ExecutionState.Interrupted);
          } else if (hasCommittedToPatch) {
            agentState = AgentState.IMPLEMENTATION;
            await this._stateGraph.transitionTo(ExecutionState.Executing);
          } else {
            await this._stateGraph.transitionTo(ExecutionState.Reasoning);
          }

          // 2. Register turn with loop detector
          this._loopDetector.registerTurn();

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

          // Pre-resolve file references to populate _virtualPageCache and use placeholders
          const processedMessages = await Promise.all(
            activeMessages.map(async (msg) => {
              if (msg.role === 'user' && msg.content) {
                const resolved = await this._resolveFileRefs(msg.content, loopCount);
                return { ...msg, content: resolved };
              }
              return msg;
            })
          );

          // 3. Scored Context Eviction Manager
          this._contextStore.clear();
          for (let i = 0; i < processedMessages.length; i++) {
            const msg = processedMessages[i];
            const isApprovedPlan = msg.content && msg.content.includes('APPROVED PLAN');
            const isProtected = (msg as any)._protected || isApprovedPlan;
            
            let priority = 5; // default for tool/logs
            if (msg.role === 'system') priority = 100;
            else if (msg.role === 'user') priority = 50;
            else if (msg.role === 'assistant') priority = 20;

            let dependencyCount = 0;
            if (msg.content) {
              for (const file of verifiedFiles) {
                if (msg.content.includes(path.basename(file))) {
                  dependencyCount++;
                }
              }
            }

            this._contextStore.addItem(
              `msg-${i}`,
              msg,
              msg.role as any,
              priority,
              dependencyCount,
              !!isProtected
            );
          }

          // Add files from page cache to ContextStore
          const activeEditor = vscode.window?.activeTextEditor;
          const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
          const activeFile = activeEditor ? path.relative(workspaceRoot, activeEditor.document.fileName || activeEditor.document.uri?.fsPath || '').replace(/\\/g, '/') : '';

          for (const [filePath, fileData] of this._virtualPageCache.entries()) {
            let priority = 10; // Default config/others
            
            const isTarget = 
              filePath === activeFile || 
              filePath === lastPatchFailedPath ||
              filePath === 'main.py' ||
              path.basename(filePath) === 'main.py' ||
              path.basename(filePath) === 'main.ts' ||
              path.basename(filePath) === 'app.ts' ||
              path.basename(filePath) === 'index.ts';

            const isTypes = 
              filePath.endsWith('.d.ts') || 
              /type|model|interface|schema/i.test(filePath);

            if (isTarget) {
              priority = 100;
            } else if (isTypes) {
              priority = 50;
            }

            let dependencyCount = 0;
            for (const msg of processedMessages) {
              if (msg.content && (msg.content.includes(filePath) || msg.content.includes(path.basename(filePath)))) {
                dependencyCount++;
              }
            }

            this._contextStore.addItem(
              `file:${filePath}`,
              fileData,
              'tool',
              priority,
              dependencyCount,
              false,
              fileData.lastAccessedTurn
            );
          }

          // Evict low priority context items if we exceed budget
          const evictedKeys = this._contextStore.evictToBudget(
            effectiveBudget,
            (item) => {
              if (item.key.startsWith('file:')) {
                const fileData = item.value as { content: string; ext: string };
                return estimateTokens([{ role: 'user', content: fileData.content }]);
              } else {
                return estimateTokens([item.value]);
              }
            }
          );

          if (evictedKeys.length > 0) {
            console.log(`[Scored Eviction] Evicted ${evictedKeys.length} items (messages/files) from context due to budget limits.`);
          }

          // Rebuild activeMessages from non-file kept items
          const keptItems = this._contextStore.items.sort((a, b) => a.recency - b.recency);
          const keptMessages: ChatMessage[] = [];
          let usedTokens = 0;
          for (const item of keptItems) {
            if (!item.key.startsWith('file:')) {
              keptMessages.push(item.value);
              usedTokens += estimateTokens([item.value]);
            } else {
              const fileData = item.value as { content: string; ext: string };
              usedTokens += estimateTokens([{ role: 'user', content: fileData.content }]);
            }
          }
          activeMessages = sanitizeToolMessages(keptMessages);
          this._activeMessages = activeMessages;

          // Strategy 1: Evict stale, re-readable tool results to keep history lean.
          // Target 60% of effectiveBudget, leaving headroom for the system prompt (~5K) and response.
          // Each eviction leaves a placeholder with exact re-run instructions (the model's "way out").
          const historyEvictionCap = Math.floor(effectiveBudget * 0.60);
          const evictionResult = evictStaleToolResults(activeMessages, historyEvictionCap);
          if (evictionResult.evictedCount > 0) {
            console.log(
              `[ToolEviction] Evicted ${evictionResult.evictedCount} tool results, ` +
              `saved ~${Math.round(evictionResult.savedTokens / 1000)}K tokens (history was over ${Math.round(historyEvictionCap / 1000)}K cap)`,
            );
            activeMessages = evictionResult.messages;
            this._activeMessages = activeMessages;
          }

          // Strategy 4: Auto-prune project structure map after turn 3.
          // By then the model has already oriented itself; it can call <analyze_project /> to get it again.
          if (loopCount > 3) {
            let projectMapPruned = false;
            activeMessages = activeMessages.map((msg) => {
              if (
                msg.role === 'system' &&
                typeof msg.content === 'string' &&
                msg.content.includes('[PROJECT STRUCTURE]') &&
                !msg.summarized
              ) {
                projectMapPruned = true;
                return {
                  ...msg,
                  summarized: true,
                  content:
                    msg.content +
                    '\n[Project map excluded from context after turn 3. Re-run <analyze_project /> or <graphify /> to restore.]',
                };
              }
              return msg;
            });
            if (projectMapPruned) {
              this._activeMessages = activeMessages;
              console.log('[ProjectMapPrune] Project structure map marked summarized after turn 3.');
            }
          }

          // Strategy 5: Context Compaction and Summarization (Non-blocking Out-of-band)
          const activeMessagesForCheck = activeMessages.filter((m) => !m.summarized);
          const used = estimateTokens(activeMessagesForCheck);
          const pct = effectiveBudget ? used / effectiveBudget : 0;

          if (pct >= COMPACT_THRESHOLD && !this._isCompacting) {
            this._isCompacting = true;

            // Separate system preface, conversation, and existing summaries
            const systemMsgs: ChatMessage[] = [];
            const convoMsgs: ChatMessage[] = [];
            const existingSummaries: ChatMessage[] = [];
            const alreadySummarized: ChatMessage[] = [];

            for (const msg of activeMessages) {
              if (msg.role === 'system') {
                if (msg.content && msg.content.startsWith('[Conversation summary')) {
                  existingSummaries.push(msg);
                } else if (msg.content && msg.content.includes('\n\n[Conversation summary')) {
                  const summaryIndex = msg.content.indexOf('\n\n[Conversation summary');
                  const originalContent = msg.content.substring(0, summaryIndex);
                  const summaryContent = msg.content.substring(summaryIndex + 2);

                  existingSummaries.push({ role: 'system', content: summaryContent });
                  systemMsgs.push({ ...msg, content: originalContent });
                } else {
                  systemMsgs.push(msg);
                }
              } else if (msg.summarized) {
                alreadySummarized.push(msg);
              } else {
                convoMsgs.push(msg);
              }
            }

            if (convoMsgs.length >= 4) {
              // Split conversation: summarize older half, keep recent half.
              let splitPoint = Math.floor(convoMsgs.length / 2);
              while (splitPoint < convoMsgs.length) {
                const currentMsg = convoMsgs[splitPoint];
                const isToolResult = (currentMsg.role as string) === 'tool' || 
                                     (currentMsg.role === 'system' && currentMsg.content && currentMsg.content.startsWith('[Tool Result for '));
                
                const prevMsg = splitPoint > 0 ? convoMsgs[splitPoint - 1] : null;
                const prevHasToolCalls = prevMsg && prevMsg.role === 'assistant' && (prevMsg as any).tool_calls && (prevMsg as any).tool_calls.length > 0;
                
                if (isToolResult || prevHasToolCalls) {
                  splitPoint++;
                } else {
                  break;
                }
              }

              const older = convoMsgs.slice(0, splitPoint);
              const olderMessageIds = new Set(older.map(m => m.id || (m as any)._id).filter(Boolean));

              console.log('[Orchestrator] Starting background context compaction...');
              
              // Run the LLM summarization asynchronously
              const summarizePayload = async (): Promise<string> => {
                const summaryPayload: ChatMessage[] = [
                  { role: 'system', content: SELF_SUMMARY_SYSTEM_PROMPT },
                  ...older,
                ];
                const summaryController = new AbortController();
                const res = await this._completer.getLLMCompletion(
                  provider as LLMProvider,
                  currentHost,
                  currentModel,
                  apiKey,
                  summaryPayload.map(m => ({ role: m.role === 'system' ? 'user' : m.role, content: m.content || '' })),
                  summaryController.signal,
                  this._session.sessionId,
                  summaryController,
                  vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || undefined,
                  undefined,
                  undefined,
                  false
                );
                return res;
              };

              const actualSlicePoint = splitPoint;

              summarizePayload().then(async (summaryText) => {
                const newSummaryMsg: ChatMessage = {
                  role: 'system',
                  content: `[Conversation summary of turns ${alreadySummarized.length} to ${alreadySummarized.length + older.length}]:\n${summaryText}`,
                };

                const updatedMessages: ChatMessage[] = [];
                for (const m of this._activeMessages || []) {
                  const mId = m.id || (m as any)._id;
                  if (mId && olderMessageIds.has(mId)) {
                    updatedMessages.push({ ...m, summarized: true });
                  } else {
                    updatedMessages.push(m);
                  }
                }

                let lastSummaryIndex = -1;
                for (let i = 0; i < updatedMessages.length; i++) {
                  if (updatedMessages[i].role === 'system' && updatedMessages[i].content && updatedMessages[i].content.startsWith('[Conversation summary')) {
                    lastSummaryIndex = i;
                  }
                }

                if (lastSummaryIndex !== -1) {
                  updatedMessages.splice(lastSummaryIndex + 1, 0, newSummaryMsg);
                } else {
                  const sysIndex = updatedMessages.findIndex(m => m.role === 'system');
                  if (sysIndex !== -1) {
                    updatedMessages.splice(sysIndex + 1, 0, newSummaryMsg);
                  } else {
                    updatedMessages.unshift(newSummaryMsg);
                  }
                }

                this._activeMessages = updatedMessages;
                await this._saveChatHistory(updatedMessages);
                console.log('[Orchestrator] Background context compaction complete.');

                const newTokens = estimateTokens(updatedMessages.filter(m => !m.summarized));
                this._postMessage({
                  type: 'contextUsage',
                  usedTokens: newTokens,
                  maxTokens: effectiveBudget,
                });
              }).catch((err) => {
                console.error('[Orchestrator] Background context compaction failed:', err);
              }).finally(() => {
                this._isCompacting = false;
              });
            } else {
              this._isCompacting = false;
            }
          }

          // Recompute usedTokens after evictions and compaction
          usedTokens = estimateTokens(activeMessages);

          this._postMessage({
            type: 'contextUsage',
            usedTokens: usedTokens,
            maxTokens: effectiveBudget,
          });

          continueLoop = false;

          const useNativeTools = supportsNativeToolCalling(provider, currentModel);
          const browserEnabled = config.get<boolean>('browserToolsEnabled', true);
          const excludedTools: string[] = [];
          if (!browserEnabled) {
            excludedTools.push(
              'browser_navigate',
              'browser_click',
              'browser_type',
              'browser_evaluate_script',
              'browser_screenshot'
            );
          }
          const toolSchemas = useNativeTools ? getToolSchemas(excludedTools) : undefined;

          const resolvedPayloadPromises = activeMessages
            .filter((msg) => !msg.summarized)
            .map(async (msg) => {
              let content = msg.content;
              if (content) {
                content = this._resolveCachePlaceholders(content);
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

          // 4. Inject Active Task and loop warnings into system prompt
          const activeTaskPrompt = this._taskQueue.getActiveTaskPromptContext();
          const loopWarning = this._loopDetector.detectLoop().reason;
          const loopWarningPrompt = loopWarning
            ? `\n\n### ⚠️ LOOP DETECTOR WARNING:\nI seem to be repeating actions without making positive progress. [Details: ${loopWarning}]\nSTRICT RULE: If you are confident you are progressing (e.g. searching/reading new/different files, or adjusting your search parameters), then continue searching. Or else, you MUST immediately stop calling tools and ask the user your query or explain your blockers.`
            : '';
          const activeJobs = this._jobManager.jobs.filter(j => j.status === 'running' || j.status === 'queued');
          const jobsPrompt = activeJobs.length > 0
            ? `\n\n### ⚙️ RUNNING JOBS:\n` + activeJobs.map(j => `- Job [${j.id}]: ${j.name} (${j.status})`).join('\n')
            : '';

          // Strategy 2: System prompt caching.
          // The static core (base role, tool specs, workspace context, rules, memory) is ~4–8K tokens
          // and does not change between loop turns within the same session unless key inputs change.
          // We cache it and only rebuild on cache miss — saving those tokens every subsequent turn.
          const isSubsequentForPrompt = loopCount > 1;
          const hasPlanNow = hasDeclaredPlan(activeMessages, '');
          const staticCacheKey = [
            provider, currentModel, String(isSubsequentForPrompt), String(useNativeTools), text || '',
          ].join('||');

          if (!this._systemPromptCache || this._systemPromptCacheKey !== staticCacheKey) {
            this._systemPromptCache = buildStaticSystemPromptCore(isSubsequentForPrompt, text || '', useNativeTools);
            this._systemPromptCacheKey = staticCacheKey;
            console.log('[PromptCache] Static system prompt rebuilt (cache miss).');
          } else {
            console.log('[PromptCache] Static system prompt cache hit — reusing (~' +
              Math.round(estimateTokens([{ role: 'system', content: this._systemPromptCache }]) / 1000) + 'K tokens saved).');
          }

          let currentPhase = 'PLANNING';
          if (this._sessionVerifiedBuild && this._sessionModifiedFiles.size > 0) {
            currentPhase = 'VERIFIED';
          } else if (this._sessionModifiedFiles.size > 0 || verifiedFiles.size > 0) {
            currentPhase = 'IMPLEMENTING';
          }
          await this._updateTaskArtifacts(text || '', currentPhase, verifiedFiles);

          const dynamicCtx = buildDynamicSystemContext(
            hasPlanNow,
            featureOwner,
            agentState,
            taskMode,
            verifiedFiles,
            this._sessionSearchedQueries,
            this._sessionCompletedActions,
            this._lastToolStatus,
            text
          );
          const runtimeCtx = `\n\n### 🎯 RUNTIME CONTEXT:\n${activeTaskPrompt}${loopWarningPrompt}${jobsPrompt}`+`\n\n### 📦 artifacts update:\nArtifacts "Implementation Plan" (plan_artifact) and "Task List" (tasks_artifact) have been automatically created/updated on disk by the orchestrator and rendered for the user. Do NOT write or edit these files manually.`;
          const payload: ChatMessage[] = [
            {
              role: 'system',
              content: this._systemPromptCache,
            },
            {
              role: 'system',
              content: `## WORKSPACE CONTEXT & RUNTIME STATUS\n${dynamicCtx}${runtimeCtx}`,
              _protected: true,
            } as any,
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
                loopCount > 1,
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
            pushToHistory({
              role: 'system',
              content: '[System Notice]: Your previous response was empty. If you have completed the task, please output a final <walkthrough>...</walkthrough> summary. If you still need to run commands or read/write files, please invoke the correct tool.'
            });
            await this._saveChatHistory(currentMessages);
            continue;
          }

          signal.removeEventListener('abort', mainAbortListener);

          const earlyToolCalls = nativeToolCall ? [1] : this._parser.parseToolCalls(assistantResponse, true);
          assistantResponse = detectAndNormalizeWalkthrough(assistantResponse, earlyToolCalls.length);

          if (loopCount > 1 && !nativeToolCall && earlyToolCalls.length > 0) {
            const xmlRegex = /<[a-zA-Z0-9_]+[\s\S]*?>(?:[\s\S]*?<\/[a-zA-Z0-9_]+>)?/g;
            const matches = assistantResponse.match(xmlRegex);
            if (matches && matches.length > 0) {
              assistantResponse = matches.join('\n');
            } else {
              assistantResponse = '';
            }
          }

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

              const resolvedResults = await Promise.race([
                Promise.all(promises),
                new Promise<string[]>((_, reject) => {
                  const abortHandler = () => reject(new Error('Task aborted by user'));
                  if (signal.aborted) abortHandler();
                  else signal.addEventListener('abort', abortHandler);
                })
              ]);
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

                const r = await Promise.race([
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
                  ),
                  new Promise<string>((_, reject) => {
                    const abortHandler = () => reject(new Error('Task aborted by user'));
                    if (signal.aborted) abortHandler();
                    else signal.addEventListener('abort', abortHandler);
                  })
                ]);
                
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
                const base64 = match[1].trim();
                images.push(base64);
                this._postMessage({ type: 'screenshotCapture', base64 });
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
                '\n\n[System: You have performed several exploratory steps. Please evaluate if you have enough context. If you do, stop searching and execute the file patches immediately. Do not spend multiple turns re-reading the same file or scrolling in tiny increments. If you know the logic, write the patch block now. If you do not have enough context or if your search returned no results, please explain this to the user and ask for clarification, rather than making redundant searches or generating an empty patch.]';
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
            if (taskMode === TaskMode.CONVERSATIONAL) {
              continueLoop = false;
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
                ? '[SYSTEM AUTOMATED NOTICE - DO NOT ADD CONVERSATIONAL PREAMBLE. Just invoke a tool directly]: You emitted an <architecture_routing> block but did not invoke any functions. The architecture_routing block is guidance metadata and does not count as a response. You MUST immediately invoke exactly one function from the tools schema to proceed with your task.'
                : '[SYSTEM AUTOMATED NOTICE - DO NOT ADD CONVERSATIONAL PREAMBLE. Just output a tool tag directly]: You emitted an <architecture_routing> block but did not invoke any tool tags. The architecture_routing block is guidance metadata and does not count as a response. You MUST immediately output exactly one valid tool tag (e.g., <read_file ...>) to proceed with your task.';
              pushToHistory({ role: 'system', content: nudgeMsg });
              await this._saveChatHistory(currentMessages);
              continueLoop = true;
            } else if (loopCount === 1 && hasActionPlanningIntent(assistantResponse)) {
              const nudgeMsg = useNativeTools
                ? "[SYSTEM AUTOMATED NOTICE - DO NOT ADD CONVERSATIONAL PREAMBLE. Just invoke a tool directly]: You did not invoke any tool functions in your response. If you need to search, read/write files, run commands, or analyze the workspace to fulfill the user's request, please invoke a valid tool function now to continue autonomously."
                : "[SYSTEM AUTOMATED NOTICE - DO NOT ADD CONVERSATIONAL PREAMBLE. Just output a tool tag directly]: You did not invoke any tool tags in your response. If you need to search, read/write files, run commands, or analyze the workspace to fulfill the user's request, please output a valid tool tag now to continue autonomously.";
              pushToHistory({ role: 'system', content: nudgeMsg });
              await this._saveChatHistory(currentMessages);
              continueLoop = true;
            } else if (
              loopCount > 1 &&
              (taskMode === TaskMode.IMPLEMENT || taskMode === TaskMode.DEBUG || taskMode === TaskMode.VERIFY) &&
              (hasCommittedToPatch || verifiedFiles.size > 0) &&
              !assistantResponse.includes('<walkthrough>') &&
              toolCalls.length === 0
            ) {
              const nudgeMsg = useNativeTools
                ? "[SYSTEM AUTOMATED NOTICE - DO NOT REPLY CONVERSATIONALLY OR DEFEND PREVIOUS RESPONSE. Just execute the next step directly]: You did not invoke any tool functions or output a final <walkthrough> block. If you are still working on the task, you MUST invoke a tool (such as read_file, patch_file, run_command, etc.) to continue implementation. If you have completed the task, you MUST output a <walkthrough>...</walkthrough> block to document your changes and conclude the session."
                : "[SYSTEM AUTOMATED NOTICE - DO NOT REPLY CONVERSATIONALLY OR DEFEND PREVIOUS RESPONSE. Just execute the next step directly]: You did not invoke any tool tags or output a final <walkthrough> block. If you are still working on the task, you MUST output a valid tool tag (such as <read_file ...>, <patch_file ...>, <run_command ...>, etc.) to continue implementation. If you have completed the task, you MUST output a <walkthrough>...</walkthrough> block to document your changes and conclude the session.";
              pushToHistory({ role: 'system', content: nudgeMsg });
              await this._saveChatHistory(currentMessages);
              continueLoop = true;
            }
          }
        }
        }
        this._sendAvatarState('idle');

        let lastMsg = currentMessages[currentMessages.length - 1];
        let isCompleted = lastMsg && lastMsg.role === 'assistant' && lastMsg.content && lastMsg.content.includes('<walkthrough>');

        if (
          !isCompleted &&
          lastMsg &&
          lastMsg.role === 'assistant' &&
          lastMsg.content &&
          (taskMode === TaskMode.IMPLEMENT || taskMode === TaskMode.DEBUG || taskMode === TaskMode.VERIFY)
        ) {
          lastMsg.content = `<walkthrough>\n${lastMsg.content.trim()}\n</walkthrough>`;
          isCompleted = true;
          this._syncPlanningFiles(lastMsg.content);
          await this._saveChatHistory(currentMessages);
        }

        this._postMessage({ type: 'updateChatHistory', history: currentMessages });
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

  private async _resolveFileRefs(text: string, currentTurn: number): Promise<string> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    return text.replace(/\[([^[\]]+?)\]/g, (match: string, filePath: string) => {
      try {
        const trimmed = filePath.trim();
        const fullPath = path.join(workspaceRoot, trimmed);
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const ext = path.extname(trimmed).slice(1) || 'txt';
          const hash = crypto.createHash('sha256').update(content).digest('hex');

          this._virtualPageCache.set(trimmed, {
            content,
            ext,
            hash,
            lastAccessedTurn: currentTurn,
          });

          return `[File Cache: ${trimmed}]`;
        }
      } catch (e) {
        console.error('Failed to read embedding file:', filePath, e);
      }
      return match;
    });
  }

  public _resolveCachePlaceholders(text: string): string {
    if (!text) return text;
    return text.replace(/\[File Cache:\s*([^\]]+?)\]/g, (match, trimmedPath) => {
      const filePath = trimmedPath.trim();
      const fileItem = this._contextStore.getItem(`file:${filePath}`);
      if (fileItem) {
        const fileData = fileItem.value;
        if (!this._sentFiles.has(filePath)) {
          this._sentFiles.set(filePath, { hash: fileData.hash, content: fileData.content });
          return `\n\`\`\`${fileData.ext}:${filePath}\n${fileData.content}\n\`\`\``;
        }

        const cached = this._sentFiles.get(filePath)!;
        if (cached.hash === fileData.hash) {
          return `\n[File: ${filePath} (unchanged since last sent)]`;
        }

        const diff = generateUnifiedDiff(filePath, cached.content, fileData.content);
        this._sentFiles.set(filePath, { hash: fileData.hash, content: fileData.content });
        
        if (!diff) {
          return `\n[File: ${filePath} (unchanged since last sent)]`;
        }
        return `\n[File: ${filePath} (diff since last sent)]\n\`\`\`diff\n${diff}\n\`\`\``;
      } else {
        return `\n[File: ${filePath} (evicted from cache to save tokens)]`;
      }
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

  private async _updateTaskArtifacts(
    goal: string,
    currentPhase: string,
    verifiedFiles: Set<string>,
  ): Promise<void> {
    try {
      const artifactService = ArtifactService.getInstance();
      
      // 1. Create or Update Implementation Plan
      const planId = 'plan_artifact';
      const visitedList = verifiedFiles.size > 0
        ? Array.from(verifiedFiles).map((f) => {
            try {
              return `- ${vscode.workspace.asRelativePath(f)}`;
            } catch {
              return `- ${path.basename(f)}`;
            }
          }).join('\n')
        : '- None';
      const modifiedList = this._sessionModifiedFiles.size > 0
        ? Array.from(this._sessionModifiedFiles).map((f) => `- ${f}`).join('\n')
        : '- None';
      const searchList = this._sessionSearchedQueries.size > 0
        ? Array.from(this._sessionSearchedQueries).map((q) => `- "${q}"`).join('\n')
        : '- None';

      const planContent = `# Implementation Plan: ${goal}

## Active Phase
${currentPhase}

## Visited Files
${visitedList}

## Search Queries
${searchList}

## Modified Files
${modifiedList}

## Verification Status
- Compile/Test Verification: ${this._sessionVerifiedBuild ? '✅ Verified successfully' : '⏳ Pending compilation/test run'}
`;
      await artifactService.createOrUpdateArtifact(planId, 'markdown', 'Implementation Plan', planContent, undefined, false);

      // 2. Create or Update Task List
      const taskId = 'tasks_artifact';
      const tasksContent = `# Task List: ${goal}

- [${verifiedFiles.size > 0 ? 'x' : ' '}] Read files to locate relevant logic
- [${this._sessionModifiedFiles.size > 0 ? 'x' : ' '}] Implement proposed modifications
- [${this._sessionVerifiedBuild ? 'x' : ' '}] Verify changes compile and test suite runs
- [${currentPhase === 'VERIFIED' ? 'x' : ' '}] Create walkthrough summary
`;
      await artifactService.createOrUpdateArtifact(taskId, 'markdown', 'Task List', tasksContent, undefined, false);

      // 3. Create or Update Walkthrough if verified
      if (currentPhase === 'VERIFIED') {
        const walkthroughId = 'walkthrough_artifact';
        const walkthroughContent = `# Walkthrough of Changes: ${goal}

## Summary of Accomplishments
- [x] Successfully completed the task: "${goal}"
- [x] All proposed edits implemented and verified.

## Files Modified
${modifiedList}

## Verification Results
- All diagnostics cleared.
- Compilation and test suite verified successfully.
`;
        await artifactService.createOrUpdateArtifact(walkthroughId, 'markdown', 'Walkthrough', walkthroughContent, undefined, false);
      }
    } catch (e) {
      console.warn('Failed to update task artifacts programmatically:', e);
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
  
  const highConfidenceKeywords = [
    'walkthrough of changes',
    'walkthrough of the changes',
    'here is my walkthrough',
    'here is the walkthrough',
    'summary of changes',
    'summary of modifications',
  ];
  const structureRequiredKeywords = [
    'walkthrough:',
    '### walkthrough',
    '## walkthrough',
  ];
  
  const hasHighConfidence = highConfidenceKeywords.some(kw => lower.includes(kw));
  const hasStructureKeywords = structureRequiredKeywords.some(kw => lower.includes(kw));
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

  const isCodeDiscussion = /walkthrough (?:method|function|class|variable|field|property|parameter|argument|endpoint|api|test|code|comment|logic|service|helper|component|route|page)/i.test(cleanText) ||
                           /\b(function|class|const|let|var|def|import|export)\s+\w*walkthrough/i.test(cleanText) ||
                           /walkthrough\s*\(/i.test(cleanText);

  const shouldWrap = (hasHighConfidence || (hasStructure && (hasStructureKeywords || hasCompletionKeywords))) && 
                     !isPreparatory && 
                     !isCodeDiscussion;

  if (shouldWrap) {
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

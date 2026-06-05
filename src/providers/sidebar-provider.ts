import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { SecretService } from '../services/secret-service';
import { StorageService } from '../services/storage-service';
import { applyCodeToActiveEditor, revertCheckpoint } from '../utils/editor-utils';
import { LLMProvider, ExtensionSettings, ChatMessage, WebviewToExtensionMessage, ChatSession } from '../types';
import { diffLines, LineDiffResult } from '../utils/diff';
import { CommandService } from '../services/command-service';
import { AgentOrchestrator } from '../agent/orchestrator';
import { fetchOllamaModels } from '../services/api-service';
import { ReviewManager } from '../services/review-manager';
import { LocalRagService } from '../services/local-rag-service';
import { TelemetryService } from '../services/telemetry-service';

export class MirrorVsSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'mirror-vs.sidebar';
  private _view?: vscode.WebviewView;
  private readonly _secretService: SecretService;
  private readonly _storageService: StorageService;
  private readonly _orchestrator: AgentOrchestrator;
  private readonly _migrationPromise: Promise<void>;
  private readonly _unstrippedHistoryCache = new Map<string, ChatMessage[]>();

  constructor(private readonly _context: vscode.ExtensionContext) {
    this._secretService = new SecretService(_context.secrets);
    this._storageService = new StorageService(_context.workspaceState);

    // Migrate legacy storage to per-session keys
    this._migrationPromise = this._storageService.migrateFromLegacyIfNeeded().then(() => {
      return this._storageService.trimOldSessions(50);
    });

    // Initialize decoupled Agent Orchestrator
    this._orchestrator = new AgentOrchestrator(
      (key) => this._secretService.getSecret(key),
      () => this._getChatHistory(),
      (history) => this._saveChatHistory(history),
      (msg) => {
        if (msg && msg.type === 'loopComplete') {
          vscode.window.showInformationMessage('Mirror VS: Task completed successfully! 🎉');
        }
        this._view?.webview.postMessage(msg);
      },
      (targetPath) => this.getSafePath(targetPath),
    );

    // Listen to terminal output streaming
    CommandService.onDidStreamData((e) => {
      this._view?.webview.postMessage({
        type: 'terminalStream',
        terminalName: e.name,
        data: e.data,
      });
    });
  }

  public async resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    this._view = webviewView;

    try {
      // Await storage migration completion before resolving view
      try {
        await this._migrationPromise;
      } catch (err) {
        console.error('[Migration] Failed during startup:', err);
      }

      webviewView.webview.options = {
        enableScripts: true,
        localResourceRoots: [this._context.extensionUri],
      };

      // Construct the webview HTML
      webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

      // Initialize Local RAG Index in the background
      LocalRagService.getInstance()
        .loadIndex()
        .then(() => {
          LocalRagService.getInstance().indexWorkspace();
        });

      // Listen for editor changes to update context bar live
      const activeEditorListener = vscode.window.onDidChangeActiveTextEditor(() => {
        this._sendActiveFileContext();
      });
      const visibleEditorsListener = vscode.window.onDidChangeVisibleTextEditors(() => {
        this._sendActiveFileContext();
      });
      const activeReviewsListener = ReviewManager.getInstance().onDidChangeActiveReviews(() => {
        this._sendActiveReviewsCount();
      });
      const configChangeListener = vscode.workspace.onDidChangeConfiguration(async (e) => {
        if (e.affectsConfiguration('mirror-vs')) {
          await this._sendSettingsToWebview();
        }
      });

      webviewView.onDidDispose(() => {
        activeEditorListener.dispose();
        visibleEditorsListener.dispose();
        activeReviewsListener.dispose();
        configChangeListener.dispose();
      });

      // Set up message listener from Webview
      webviewView.webview.onDidReceiveMessage(async (data: WebviewToExtensionMessage) => {
        try {
          switch (data.type) {
            case 'getSettings': {
              await this._sendSettingsToWebview();
              break;
            }
            case 'saveSettings': {
              console.log('[SidebarProvider] saveSettings payload:', JSON.stringify(data));
              const config = vscode.workspace.getConfiguration('mirror-vs');
              await config.update('defaultProvider', data.provider, vscode.ConfigurationTarget.Global);
              await config.update('ollamaHost', data.ollamaHost, vscode.ConfigurationTarget.Global);
              await config.update('defaultOllamaModel', data.defaultOllamaModel, vscode.ConfigurationTarget.Global);
              await config.update('defaultDeepSeekModel', data.defaultDeepSeekModel, vscode.ConfigurationTarget.Global);

              if (data.deepSeekThinking !== undefined) {
                await config.update('deepSeekThinking', data.deepSeekThinking, vscode.ConfigurationTarget.Global);
              }
              if (data.deepSeekThinkingLevel !== undefined) {
                await config.update(
                  'deepSeekThinkingLevel',
                  data.deepSeekThinkingLevel,
                  vscode.ConfigurationTarget.Global,
                );
              }

              if (data.contextBudgetPercent !== undefined) {
                await config.update(
                  'contextBudgetPercent',
                  data.contextBudgetPercent,
                  vscode.ConfigurationTarget.Global,
                );
              }
              if (data.turnsToRetain !== undefined) {
                await config.update('turnsToRetain', data.turnsToRetain, vscode.ConfigurationTarget.Global);
              }

              if (data.deepSeekKey !== undefined) {
                if (data.deepSeekKey.trim() === '') {
                  await this._secretService.deleteSecret('deepseek_api_key');
                } else {
                  await this._secretService.storeSecret('deepseek_api_key', data.deepSeekKey.trim());
                }
              }

              if (data.figmaKey !== undefined) {
                if (data.figmaKey.trim() === '') {
                  await this._secretService.deleteSecret('figma_api_key');
                } else {
                  await this._secretService.storeSecret('figma_api_key', data.figmaKey.trim());
                }
              }

              if (data.customEndpointEnabled !== undefined) {
                await config.update(
                  'customEndpointEnabled',
                  data.customEndpointEnabled,
                  vscode.ConfigurationTarget.Global,
                );
              }
              if (data.customEndpointUrl !== undefined) {
                await config.update('customEndpointUrl', data.customEndpointUrl, vscode.ConfigurationTarget.Global);
              }
              if (data.customEndpointModel !== undefined) {
                await config.update('customEndpointModel', data.customEndpointModel, vscode.ConfigurationTarget.Global);
              }
              if ((data as any).customEndpointKey !== undefined) {
                const keyVal = (data as any).customEndpointKey;
                console.log(`[SidebarProvider] Saving custom endpoint key: length ${keyVal ? keyVal.length : 0}`);
                if (keyVal.trim() === '') {
                  await this._secretService.deleteSecret('custom_endpoint_api_key');
                } else {
                  await this._secretService.storeSecret('custom_endpoint_api_key', keyVal.trim());
                }
              } else {
                console.log(`[SidebarProvider] customEndpointKey is undefined in saveSettings payload`);
              }
              if ((data as any).customApis !== undefined) {
                await config.update('customApis', (data as any).customApis, vscode.ConfigurationTarget.Global);
              }
              if ((data as any).customApiKeys !== undefined) {
                const keys = (data as any).customApiKeys as Record<string, string>;
                for (const [apiId, keyVal] of Object.entries(keys)) {
                  if (keyVal === '') {
                    await this._secretService.deleteSecret(`custom_api_key_${apiId}`);
                  } else if (keyVal !== '••••••••') {
                    await this._secretService.storeSecret(`custom_api_key_${apiId}`, keyVal.trim());
                  }
                }
              }
              if ((data as any).agentMode !== undefined) {
                await config.update('agentMode', (data as any).agentMode, vscode.ConfigurationTarget.Global);
              }
              if ((data as any).customSystemPrompt !== undefined) {
                await config.update(
                  'customSystemPrompt',
                  (data as any).customSystemPrompt,
                  vscode.ConfigurationTarget.Global,
                );
              }

              vscode.window.showInformationMessage('Mirror VS Settings saved successfully!');
              await this._sendSettingsToWebview();
              break;
            }
            case 'fetchModels': {
              await this._fetchAndSendOllamaModels();
              break;
            }
            case 'validateHost': {
              try {
                const models = await fetchOllamaModels(data.host);
                this._view?.webview.postMessage({
                  type: 'hostValidationResult',
                  isValid: true,
                  models,
                });
              } catch (e) {
                this._view?.webview.postMessage({
                  type: 'hostValidationResult',
                  isValid: false,
                  models: [],
                });
              }
              break;
            }
            case 'sendMessage': {
              // Linked files are sent as inline path tags only — the model can
              // call read_file itself if it needs the content. Pre-reading file
              // contents wastes tokens and pollutes context.
              let fullMessageText = data.text;

              await this._orchestrator.handleMessageStream(fullMessageText, data.history, data.images);
              break;
            }
            case 'retryLastToolCall': {
              // Re-send the last user message to retry the failed tool call
              const history = this._getChatHistory();
              const lastUserMsg = [...history].reverse().find((m) => m.role === 'user');
              if (lastUserMsg) {
                // Remove assistant + system messages after the last user message to clean state
                const lastUserIdx = history.lastIndexOf(lastUserMsg);
                const cleanHistory = history.slice(0, lastUserIdx + 1);
                await this._saveChatHistory(cleanHistory);
                await this._orchestrator.handleMessageStream(lastUserMsg.content, cleanHistory, lastUserMsg.images);
              }
              break;
            }
            case 'cancelStream': {
              this._orchestrator.cancelActiveStream();
              break;
            }
            case 'applyCode': {
              await applyCodeToActiveEditor(data.code, data.mode);
              break;
            }
            case 'clearChat': {
              await this.clearActiveChat();
              break;
            }
            case 'revertHistory': {
              const { text, role, inclusive, messageIndex } = data;
              const history = this._getChatHistory();
              // Use explicit index if provided, otherwise fall back to content matching
              let idx = messageIndex !== undefined && messageIndex >= 0 ? messageIndex : -1;
              if (idx === -1) {
                idx = history.findIndex((m) => m.role === role && m.content === text);
              }
              if (idx !== -1 && idx < history.length) {
                this._orchestrator.cancelActiveStream(); // Cancel any running generation
                const sliceIndex = inclusive ? idx + 1 : idx;
                const newHistory = history.slice(0, sliceIndex);
                const deletedHistory = history.slice(sliceIndex);

                // Auto-revert any checkpoints in the deleted history
                for (let i = deletedHistory.length - 1; i >= 0; i--) {
                  const msg = deletedHistory[i];
                  if (msg.role === 'system' && msg.content) {
                    // Look for un-reverted checkpoints
                    const match = msg.content.match(/Revert ID: (\w+)/);
                    if (match) {
                      const checkpointId = match[1];
                      console.log(`[Auto-Revert] Reverting checkpoint ${checkpointId} from truncated history`);
                      await revertCheckpoint(checkpointId);
                    }
                  }
                }

                await this._saveChatHistory(newHistory);
              }
              break;
            }
            case 'requestWorkspaceFiles': {
              await this._sendWorkspaceFiles();
              break;
            }
            case 'getChatSessions': {
              this._sendChatSessionsToWebview();
              break;
            }
            case 'getChatHistory': {
              this._sendChatHistoryToWebview();
              break;
            }
            case 'newSession': {
              await this._createNewSession();
              break;
            }
            case 'selectSession': {
              await this._selectSession(data.sessionId);
              break;
            }
            case 'deleteSession': {
              await this._deleteSession(data.sessionId);
              break;
            }
            case 'openFile': {
              const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
              if (workspaceFolder && data.path) {
                const safePath = path.resolve(workspaceFolder, data.path);
                if (safePath.startsWith(workspaceFolder) && fs.existsSync(safePath)) {
                  const doc = await vscode.workspace.openTextDocument(safePath);
                  await vscode.window.showTextDocument(doc, { preview: false });
                } else {
                  vscode.window.showErrorMessage(`File not found: ${data.path}`);
                }
              }
              break;
            }
            case 'openTerminal': {
              if (!data.command) break;
              const svc = CommandService.getInstance();
              const termName =
                data.terminalName ||
                `Mirror: ${data.command.length > 30 ? data.command.substring(0, 30) + '…' : data.command}`;
              const revealed = svc.revealTerminal(termName);
              if (!revealed) {
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                const newTerminal = vscode.window.createTerminal({
                  name: termName,
                  cwd: workspaceFolder,
                });
                newTerminal.show(false);
                setTimeout(() => {
                  newTerminal.sendText(data.command, true);
                }, 300);
              }
              break;
            }
            case 'getGitStatus': {
              const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
              if (!wsFolder) break;
              try {
                const gitStatus = execFileSync('git', ['status', '--porcelain'], { cwd: wsFolder, encoding: 'utf8' });
                const changes: { file: string; status: string }[] = [];
                gitStatus
                  .split('\n')
                  .filter(Boolean)
                  .forEach((line) => {
                    // For staged files (first char) and unstaged files (second char), prioritize staged
                    const stagedStatus = line[0].trim();
                    const unstagedStatus = line[1].trim();
                    let file = line.substring(3).trim();
                    // Handle "both modified" or copied/renamed patterns
                    if (file.includes(' -> ')) {
                      // Rename or copy: take the new name
                      file = file.split(' -> ').pop() || file;
                    }
                    const effectiveStatus = stagedStatus || unstagedStatus || '?';
                    changes.push({ file, status: effectiveStatus });
                  });
                this._view?.webview.postMessage({
                  type: 'gitChanges',
                  changes,
                });
              } catch (e) {
                // Not a git repo or git not installed
                this._view?.webview.postMessage({
                  type: 'gitChanges',
                  changes: [],
                });
              }
              break;
            }
            case 'openDiff': {
              const wsf = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
              if (!wsf || !data.file) break;
              const filePath = path.resolve(wsf, data.file);
              if (!filePath.startsWith(wsf)) break;
              try {
                const uri = vscode.Uri.file(filePath);
                // Open file with gutter diff visible (VS Code auto-shows git diff decorations)
                const doc = await vscode.workspace.openTextDocument(uri);
                await vscode.window.showTextDocument(doc, { preview: false });
              } catch (e) {
                vscode.window.showErrorMessage(`Could not open file for diff: ${data.file}`);
              }
              break;
            }
            case 'getGitDiff': {
              const wsFolderDiff = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
              if (!wsFolderDiff || !data.file) break;
              try {
                const diffOutput = execFileSync('git', ['diff', '--unified=10', '--', data.file], {
                  cwd: wsFolderDiff,
                  encoding: 'utf8',
                });

                if (!diffOutput.trim()) {
                  this._view?.webview.postMessage({ type: 'gitDiffContent', file: data.file, diff: null });
                  break;
                }

                const hunks: any[] = [];
                let currentHunk: any = null;

                diffOutput.split('\n').forEach((line) => {
                  if (line.startsWith('@@ ')) {
                    if (currentHunk) hunks.push(currentHunk);
                    const match = line.match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
                    currentHunk = {
                      oldStart: parseInt(match?.[1] || '0'),
                      oldLines: parseInt(match?.[2] || '1'),
                      newStart: parseInt(match?.[3] || '0'),
                      newLines: parseInt(match?.[4] || '1'),
                      lines: [],
                    };
                  } else if (currentHunk) {
                    if (line.startsWith('+')) {
                      currentHunk.lines.push({ type: 'add', content: line.substring(1) });
                    } else if (line.startsWith('-')) {
                      currentHunk.lines.push({ type: 'del', content: line.substring(1) });
                    } else if (line.startsWith(' ')) {
                      currentHunk.lines.push({ type: 'ctx', content: line.substring(1) });
                    }
                  }
                });
                if (currentHunk) hunks.push(currentHunk);

                this._view?.webview.postMessage({
                  type: 'gitDiffContent',
                  file: data.file,
                  diff: {
                    file: data.file,
                    status: 'M',
                    hunks,
                  },
                });
              } catch (e) {
                this._view?.webview.postMessage({ type: 'gitDiffContent', file: data.file, diff: null });
              }
              break;
            }
            case 'applyGitDiff': {
              const wsFolderApply = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
              if (!wsFolderApply || !data.file) break;
              try {
                if (data.action === 'accept') {
                  // Stage the file (accept changes)
                  execFileSync('git', ['add', '--', data.file], { cwd: wsFolderApply, encoding: 'utf8', shell: false });
                  vscode.window.showInformationMessage(`✅ Changes accepted for ${data.file}`);
                } else if (data.action === 'reject') {
                  // Restore the file (reject changes)
                  execFileSync('git', ['checkout', '--', data.file], {
                    cwd: wsFolderApply,
                    encoding: 'utf8',
                    shell: false,
                  });
                  vscode.window.showInformationMessage(`⏪ Changes rejected for ${data.file}`);
                }

                // Refresh git status
                this._view?.webview.postMessage({ type: 'gitChanges', changes: [] });
                // Trigger full refresh
                setTimeout(() => {
                  vscode.commands.executeCommand('mirror-vs.refreshGitStatus');
                }, 500);
              } catch (e: any) {
                vscode.window.showErrorMessage(`Failed to ${data.action} changes: ${e.message}`);
              }
              break;
            }
            case 'commitGitChanges': {
              const wsF = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
              if (!wsF) break;
              try {
                execFileSync('git', ['add', '-A'], { cwd: wsF, encoding: 'utf8' });
                execFileSync('git', ['commit', '-m', 'Mirror VS: agent changes committed'], {
                  cwd: wsF,
                  encoding: 'utf8',
                });
                vscode.window.showInformationMessage('✅ All changes committed.');
                // Refresh git status
                this._view?.webview.postMessage({ type: 'gitChanges', changes: [] });
              } catch (e: any) {
                if (e.message && e.message.includes('nothing to commit')) {
                  this._view?.webview.postMessage({ type: 'gitChanges', changes: [] });
                } else {
                  vscode.window.showErrorMessage(`Commit failed: ${e.message}`);
                }
              }
              break;
            }
            case 'revertCheckpoint': {
              console.log(`[Host] revertCheckpoint received for ID: ${data.checkpointId}`);
              const success = await revertCheckpoint(data.checkpointId);
              console.log(`[Host] revertCheckpoint result: ${success}`);

              this._view?.webview.postMessage({
                type: 'checkpointReverted',
                checkpointId: data.checkpointId,
                success,
              });

              if (success) {
                const history = this._getChatHistory();
                let updated = false;
                const newHistory = history.map((msg) => {
                  if (msg.role === 'system' && msg.content.includes(data.checkpointId)) {
                    const newContent = msg.content.replace(
                      new RegExp(`Revert ID:\\s*${data.checkpointId}`, 'g'),
                      `Reverted ID: ${data.checkpointId}`,
                    );

                    if (newContent !== msg.content) {
                      updated = true;
                      return { ...msg, content: newContent };
                    }
                  }
                  return msg;
                });

                if (updated) {
                  console.log(`[Host] Chat history updated with Reverted ID: ${data.checkpointId}`);
                  await this._saveChatHistory(newHistory);
                }
              }
              break;
            }
            case 'acceptAllReviews': {
              await vscode.commands.executeCommand('mirror-vs.acceptAllReviews');
              break;
            }
            case 'rejectAllReviews': {
              const rm = ReviewManager.getInstance();
              const filePaths = Array.from(rm['_activeReviews'].keys());
              for (const filePath of filePaths) {
                const review = rm['_activeReviews'].get(filePath);
                if (review) {
                  await rm.resolveReview(review.filePath, false);
                }
              }
              vscode.window.showInformationMessage('⏪ All active changes rejected.');
              break;
            }
            case 'acceptReview': {
              if (data.filePath) {
                await ReviewManager.getInstance().resolveReview(data.filePath, true);
              }
              break;
            }
            case 'rejectReview': {
              if (data.filePath) {
                await ReviewManager.getInstance().resolveReview(data.filePath, false);
              }
              break;
            }
            case 'getActiveReviews': {
              this._sendActiveReviewsCount();
              break;
            }
            case 'copyToClipboard': {
              if (data.text) {
                await vscode.env.clipboard.writeText(data.text);
              }
              break;
            }
            case 'exportChatMarkdown': {
              const history = this._getChatHistory();
              let md = `# Chat Session\n\n`;
              history.forEach((m) => {
                const roleName = m.role === 'user' ? 'User' : 'Mirror VS';
                md += `## ${roleName}\n\n${m.content}\n\n---\n\n`;
              });
              const doc = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(
                  path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '', 'chat-export.md'),
                ),
                filters: { Markdown: ['md'] },
              });
              if (doc) {
                fs.writeFileSync(doc.fsPath, md, 'utf8');
                vscode.window.showInformationMessage('Chat exported successfully!');
              }
              break;
            }
            case 'exportChatSession': {
              const history = this._getChatHistory();
              const doc = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(
                  path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '', 'chat-session.json'),
                ),
                filters: { JSON: ['json'] },
              });
              if (doc) {
                fs.writeFileSync(doc.fsPath, JSON.stringify(history, null, 2), 'utf8');
                vscode.window.showInformationMessage('Session exported successfully!');
              }
              break;
            }
            case 'getCheckpoints': {
              const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
              if (!workspaceFolder) {
                this._view?.webview.postMessage({ type: 'checkpointsList', checkpoints: [] });
                break;
              }
              const manifestPath = path.join(workspaceFolder, '.mirror-vs', 'checkpoints', 'manifest.json');
              try {
                if (fs.existsSync(manifestPath)) {
                  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                  this._view?.webview.postMessage({ type: 'checkpointsList', checkpoints: manifest });
                } else {
                  this._view?.webview.postMessage({ type: 'checkpointsList', checkpoints: [] });
                }
              } catch (e) {
                this._view?.webview.postMessage({ type: 'checkpointsList', checkpoints: [] });
              }
              break;
            }
            case 'getPromptTemplates': {
              const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
              if (!workspaceFolder) {
                this._view?.webview.postMessage({ type: 'promptTemplatesList', templates: [] });
                break;
              }
              const promptsDir = path.join(workspaceFolder, '.mirror-vs', 'prompts');
              try {
                if (fs.existsSync(promptsDir)) {
                  const files = fs.readdirSync(promptsDir);
                  const templates = files
                    .filter((file) => file.endsWith('.txt') || file.endsWith('.md'))
                    .map((file) => {
                      const content = fs.readFileSync(path.join(promptsDir, file), 'utf8');
                      return {
                        name: file.replace(/\.(txt|md)$/, ''),
                        content: content,
                      };
                    });
                  this._view?.webview.postMessage({ type: 'promptTemplatesList', templates });
                } else {
                  this._view?.webview.postMessage({ type: 'promptTemplatesList', templates: [] });
                }
              } catch (e) {
                this._view?.webview.postMessage({ type: 'promptTemplatesList', templates: [] });
              }
              break;
            }
            case 'createPromptTemplate': {
              const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
              if (!workspaceFolder) {
                vscode.window.showErrorMessage('Please open a workspace first to create templates.');
                break;
              }
              const promptsDir = path.join(workspaceFolder, '.mirror-vs', 'prompts');
              try {
                if (!fs.existsSync(promptsDir)) {
                  fs.mkdirSync(promptsDir, { recursive: true });
                }

                const templateName = await vscode.window.showInputBox({
                  prompt: 'Enter a name for the new prompt template',
                  placeHolder: 'e.g., refactor-helper, docstring-format',
                  validateInput: (value) => {
                    if (!value || value.trim() === '') {
                      return 'Template name cannot be empty.';
                    }
                    if (/[\\/:*?"<>|]/.test(value)) {
                      return 'Invalid characters for a file name.';
                    }
                    return null;
                  },
                });

                if (templateName) {
                  const cleanedName = templateName.trim().replace(/\.(txt|md)$/, '');
                  const filePath = path.join(promptsDir, `${cleanedName}.md`);

                  if (fs.existsSync(filePath)) {
                    vscode.window.showErrorMessage(`Template "${cleanedName}" already exists.`);
                  } else {
                    const defaultContent = `# ${cleanedName}\n\nType your custom system prompt or template instructions here...\n`;
                    fs.writeFileSync(filePath, defaultContent, 'utf8');

                    const doc = await vscode.workspace.openTextDocument(filePath);
                    await vscode.window.showTextDocument(doc);

                    vscode.window.showInformationMessage(
                      `Created template "${cleanedName}.md". Edit it and it will load in the assistant.`,
                    );

                    const files = fs.readdirSync(promptsDir);
                    const templates = files
                      .filter((file) => file.endsWith('.txt') || file.endsWith('.md'))
                      .map((file) => {
                        const content = fs.readFileSync(path.join(promptsDir, file), 'utf8');
                        return {
                          name: file.replace(/\.(txt|md)$/, ''),
                          content: content,
                        };
                      });
                    this._view?.webview.postMessage({ type: 'promptTemplatesList', templates });
                  }
                }
              } catch (e: any) {
                vscode.window.showErrorMessage(`Failed to create template: ${e.message}`);
              }
              break;
            }
            case 'exportTelemetryJson': {
              const entries = TelemetryService.getInstance().getEntries();
              const doc = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(
                  path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '', 'telemetry-report.json'),
                ),
                filters: { JSON: ['json'] },
              });
              if (doc) {
                fs.writeFileSync(doc.fsPath, JSON.stringify(entries, null, 2), 'utf8');
                vscode.window.showInformationMessage('Telemetry report exported successfully!');
              }
              break;
            }
            case 'exportTelemetryCsv': {
              const entries = TelemetryService.getInstance().getEntries();
              const headers = [
                'Timestamp',
                'Session ID',
                'Session Title',
                'Provider',
                'Model',
                'Tokens Input',
                'Tokens Output',
                'Cost',
                'Latency (ms)',
                'Error',
                'Error Message',
                'Tool Calls',
              ];
              const lines = [headers.join(',')];
              for (const entry of entries) {
                const row = [
                  new Date(entry.timestamp).toISOString(),
                  entry.sessionId,
                  `"${entry.sessionTitle.replace(/"/g, '""')}"`,
                  entry.provider,
                  entry.model,
                  entry.tokensInput,
                  entry.tokensOutput,
                  entry.cost.toFixed(6),
                  entry.latency,
                  entry.error,
                  entry.errorMessage ? `"${entry.errorMessage.replace(/"/g, '""')}"` : '',
                  entry.toolCalls || 0,
                ];
                lines.push(row.join(','));
              }
              const csvContent = lines.join('\n');
              const doc = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(
                  path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '', 'telemetry-report.csv'),
                ),
                filters: { CSV: ['csv'] },
              });
              if (doc) {
                fs.writeFileSync(doc.fsPath, csvContent, 'utf8');
                vscode.window.showInformationMessage('Telemetry report exported successfully!');
              }
              break;
            }
            case 'generatePRDescription':
            case 'generateCommitMessage': {
              const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
              if (!wsFolder) {
                vscode.window.showErrorMessage('No workspace folder open.');
                break;
              }
              try {
                const diff = execFileSync('git', ['diff'], { cwd: wsFolder, encoding: 'utf8' });
                if (!diff.trim()) {
                  vscode.window.showInformationMessage('No unstaged changes to generate from.');
                  break;
                }
                const promptText =
                  data.type === 'generatePRDescription'
                    ? `Generate a detailed Markdown Pull Request (PR) description summarizing these changes:\n\n\`\`\`diff\n${diff.substring(0, 8000)}\n\`\`\``
                    : `Generate a short conventional commit message for these changes:\n\n\`\`\`diff\n${diff.substring(0, 8000)}\n\`\`\``;

                this._view?.webview.postMessage({
                  type: 'prefillPrompt',
                  text: promptText,
                });
              } catch (e: any) {
                vscode.window.showErrorMessage(`Git error: ${e.message}`);
              }
              break;
            }
            case 'searchSessions': {
              const query = data.query.toLowerCase().trim();
              if (!query) {
                this._view?.webview.postMessage({
                  type: 'searchSessionsResult',
                  matchingIds: [],
                  query: '',
                });
                break;
              }
              const sessions = this._storageService.getSessions();
              const matchingIds: string[] = [];
              for (const s of sessions) {
                if (s.title.toLowerCase().includes(query)) {
                  matchingIds.push(s.id);
                  continue;
                }
                try {
                  const msgs = this._storageService.loadMessages(s.id);
                  const hasMatch = msgs.some((m) => m.content.toLowerCase().includes(query));
                  if (hasMatch) {
                    matchingIds.push(s.id);
                  }
                } catch (err) {
                  // ignore
                }
              }
              this._view?.webview.postMessage({
                type: 'searchSessionsResult',
                matchingIds,
                query,
              });
              break;
            }
            case 'showWarning': {
              if (data.text) {
                vscode.window.showWarningMessage(data.text);
              }
              break;
            }
          }
        } catch (err) {
          console.error('Error handling webview message:', err);
        }
      });

      // Ensure migration is complete before reading sessions/history
      try {
        await this._migrationPromise;
      } catch (e) {
        console.warn('Migration promise failed on startup:', e);
      }

      await this._ensureDefaultSession(true);

      await this._sendSettingsToWebview();
      this._sendActiveFileContext();
      this._sendActiveReviewsCount();
      this._sendChatSessionsToWebview();
      this._sendChatHistoryToWebview();
      // Do NOT eagerly send workspace files — they are fetched on-demand
      // when user types '@' in the prompt input. This avoids crashes on large repos.
    } catch (err) {
      console.error('Error resolving webview view:', err);
    }
  }

  public refreshGitStatus(): void {
    const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!wsFolder) return;
    try {
      const gitStatus = execFileSync('git', ['status', '--porcelain'], { cwd: wsFolder, encoding: 'utf8' });
      const changes: { file: string; status: string }[] = [];
      gitStatus
        .split('\n')
        .filter(Boolean)
        .forEach((line) => {
          const stagedStatus = line[0].trim();
          const unstagedStatus = line[1].trim();
          let file = line.substring(3).trim();
          if (file.includes(' -> ')) {
            file = file.split(' -> ').pop() || file;
          }
          const effectiveStatus = stagedStatus || unstagedStatus || '?';
          changes.push({ file, status: effectiveStatus });
        });
      this._view?.webview.postMessage({
        type: 'gitChanges',
        changes,
      });
    } catch (e) {
      this._view?.webview.postMessage({
        type: 'gitChanges',
        changes: [],
      });
    }
  }

  private _resetAgentPlanAndMemory(): void {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return;
    const primaryFolder = folders[0].uri.fsPath;
    const planPath = path.join(primaryFolder, '.mirror-vs', 'plan.md');

    // Archive plan.md if it exists instead of deleting it to be safe
    if (fs.existsSync(planPath)) {
      try {
        const archiveDir = path.join(primaryFolder, '.mirror-vs', 'archive');
        if (!fs.existsSync(archiveDir)) {
          fs.mkdirSync(archiveDir, { recursive: true });
        }
        const archivePlanPath = path.join(archiveDir, `plan_archived_${Date.now()}.md`);
        fs.renameSync(planPath, archivePlanPath);
        console.log(`[Session Reset] Archived plan.md to ${archivePlanPath}`);
      } catch (e) {
        try {
          fs.unlinkSync(planPath);
        } catch (_) {
          /* ignore */
        }
      }
    }
  }

  public async clearActiveChat() {
    this._orchestrator.cancelActiveStream();
    this._resetAgentPlanAndMemory();
    await this._saveChatHistory([]);
    this._view?.webview.postMessage({
      type: 'updateChatHistory',
      history: [],
    });
    vscode.window.showInformationMessage('Chat session cleared and agent checklist reset.');
  }

  private async _sendSettingsToWebview() {
    if (!this._view) return;

    const config = vscode.workspace.getConfiguration('mirror-vs');
    const provider = config.get<LLMProvider>('defaultProvider', 'ollama');
    const ollamaHost = config.get<string>('ollamaHost', 'http://localhost:11434');
    const defaultOllamaModel = config.get<string>('defaultOllamaModel', 'llama3');
    const defaultDeepSeekModel = config.get<string>('defaultDeepSeekModel', 'deepseek-v4-pro');
    const contextBudgetPercent = config.get<number>('contextBudgetPercent', 75);
    const turnsToRetain = config.get<number>('turnsToRetain', 6);
    const deepSeekThinking = config.get<boolean>('deepSeekThinking', true);
    const deepSeekThinkingLevel = config.get<'high' | 'max'>('deepSeekThinkingLevel', 'high');

    const hasDeepSeekKey = await this._secretService.hasSecret('deepseek_api_key');
    const hasFigmaKey = await this._secretService.hasSecret('figma_api_key');

    const customEndpointEnabled = config.get<boolean>('customEndpointEnabled', false);
    const customEndpointUrl = config.get<string>('customEndpointUrl', 'https://api.openai.com/v1');
    const customEndpointModel = config.get<string>('customEndpointModel', 'gpt-4o');
    const hasCustomEndpointKey = await this._secretService.hasSecret('custom_endpoint_api_key');
    const customApis = config.get<any[]>('customApis', []);

    const configuredCustomApiKeys: Record<string, boolean> = {};
    for (const api of customApis) {
      configuredCustomApiKeys[api.id] = await this._secretService.hasSecret(`custom_api_key_${api.id}`);
    }

    const agentMode = config.get<string>('agentMode', 'normal');
    const customSystemPrompt = config.get<string>('customSystemPrompt', '');

    const settings: ExtensionSettings = {
      provider,
      ollamaHost,
      defaultOllamaModel,
      defaultDeepSeekModel,
      hasDeepSeekKey,
      hasFigmaKey,
      contextBudgetPercent,
      turnsToRetain,
      deepSeekThinking,
      deepSeekThinkingLevel,
      customEndpointEnabled,
      customEndpointUrl,
      customEndpointModel,
      hasCustomEndpointKey,
      agentMode,
      customSystemPrompt,
      customApis,
      configuredCustomApiKeys,
    } as any;

    this._view.webview.postMessage({
      type: 'updateSettings',
      settings,
    });
  }

  private _sendActiveFileContext() {
    if (!this._view) return;
    const editor =
      vscode.window.activeTextEditor ||
      (vscode.window.visibleTextEditors.length > 0 ? vscode.window.visibleTextEditors[0] : undefined);
    const fileName = editor ? editor.document.fileName.split(/[\\/]/).pop() || editor.document.fileName : '';
    const filePath = editor ? editor.document.fileName : '';

    this._view.webview.postMessage({
      type: 'activeFileChanged',
      fileName: fileName,
      filePath: filePath,
    });
  }

  private _sendActiveReviewsCount() {
    if (!this._view) return;
    const count = ReviewManager.getInstance().getActiveReviewsCount();
    this._view.webview.postMessage({
      type: 'activeReviewsChanged',
      count: count,
    });
    this._sendActiveReviewsList();
  }

  private _sendActiveReviewsList() {
    if (!this._view) return;
    const rm = ReviewManager.getInstance();
    const activeReviewsMap = rm.getActiveReviews();
    const reviews: any[] = [];
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

    activeReviewsMap.forEach((review) => {
      const relPath = path.relative(workspaceFolder, review.filePath).replace(/\\/g, '/');
      const diff = diffLines(review.originalContent, review.proposedContent);
      const hunks = this._computeHunks(diff);
      reviews.push({
        filePath: relPath,
        absolutePath: review.filePath,
        hunks: hunks,
      });
    });

    this._view.webview.postMessage({
      type: 'activeReviewsList',
      reviews: reviews,
    });
  }

  private _computeHunks(diff: LineDiffResult[]): any[] {
    const hunks: any[] = [];
    const contextSize = 5;
    let i = 0;
    while (i < diff.length) {
      if (diff[i].type === 'common') {
        i++;
        continue;
      }

      let start = Math.max(0, i - contextSize);
      let end = i;
      let lookahead = i;

      while (lookahead < diff.length) {
        if (diff[lookahead].type !== 'common') {
          end = lookahead;
        }
        if (lookahead - end > 10) {
          break;
        }
        lookahead++;
      }

      const hunkEnd = Math.min(diff.length - 1, end + contextSize);
      const hunkLines = diff.slice(start, hunkEnd + 1);

      let oldStart = 0;
      let oldLines = 0;
      let newStart = 0;
      let newLines = 0;

      for (const dl of hunkLines) {
        if (dl.originalLineNum !== undefined) {
          oldStart = dl.originalLineNum + 1;
          break;
        }
      }
      for (const dl of hunkLines) {
        if (dl.proposedLineNum !== undefined) {
          newStart = dl.proposedLineNum + 1;
          break;
        }
      }

      const lines: any[] = hunkLines.map((dl) => {
        if (dl.type === 'added') {
          newLines++;
          return { type: 'add', content: dl.line };
        } else if (dl.type === 'removed') {
          oldLines++;
          return { type: 'del', content: dl.line };
        } else {
          oldLines++;
          newLines++;
          return { type: 'ctx', content: dl.line };
        }
      });

      hunks.push({
        oldStart,
        oldLines,
        newStart,
        newLines,
        lines,
      });

      i = hunkEnd + 1;
    }
    return hunks;
  }

  private async _fetchAndSendOllamaModels() {
    if (!this._view) return;

    const config = vscode.workspace.getConfiguration('mirror-vs');
    const host = config.get<string>('ollamaHost', 'http://localhost:11434');

    try {
      const models = await fetchOllamaModels(host);
      this._view.webview.postMessage({
        type: 'updateModels',
        models,
      });
    } catch (err: any) {
      console.warn('Ollama models fetch failed:', err.message);
      this._view.webview.postMessage({
        type: 'updateModels',
        models: [],
      });
    }
  }

  private getSafePath(targetPath: string): string {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      throw new Error('No workspace folder open.');
    }

    // If the target path is already absolute, use it directly (after security check)
    if (path.isAbsolute(targetPath)) {
      const resolvedLower = targetPath.toLowerCase();
      // Security check: absolute path must be under one of the workspace folders
      for (const f of folders) {
        const folderLower = f.uri.fsPath.toLowerCase();
        if (resolvedLower.startsWith(folderLower)) {
          return targetPath;
        }
      }
      throw new Error('Access denied: Absolute file path is outside of all workspace folders.');
    }

    // Relative path: resolve against the first workspace folder (primary)
    const primaryFolder = folders[0].uri.fsPath;
    const resolved = path.resolve(primaryFolder, targetPath);
    const resolvedLower = resolved.toLowerCase();

    // Security check: resolved path must be under one of the workspace folders
    for (const f of folders) {
      const folderLower = f.uri.fsPath.toLowerCase();
      if (resolvedLower.startsWith(folderLower)) {
        return resolved;
      }
    }
    throw new Error('Access denied: File path resolves outside of all workspace folders.');
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const htmlPath = vscode.Uri.joinPath(this._context.extensionUri, 'dist', 'webview', 'sidebar.html');

    let htmlContent = '';
    try {
      htmlContent = fs.readFileSync(htmlPath.fsPath, 'utf8');
    } catch (err) {
      return `<h3>Error loading webview template</h3><p>${err}</p>`;
    }

    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, 'dist', 'webview', 'sidebar.css'),
    );
    const jsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, 'dist', 'webview', 'sidebar.js'),
    );
    const logoUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'logo.png'));
    const cspSource = webview.cspSource;

    htmlContent = htmlContent.replace('{{styleUri}}', cssUri.toString());
    htmlContent = htmlContent.replace('{{scriptUri}}', jsUri.toString());
    htmlContent = htmlContent.replace(/{{logoUri}}/g, logoUri.toString());
    htmlContent = htmlContent.replace(/{{cspSource}}/g, cspSource);

    return htmlContent;
  }

  private _getChatHistory(): ChatMessage[] {
    const activeId = this._getActiveSessionId();
    if (!activeId) return [];
    if (this._unstrippedHistoryCache.has(activeId)) {
      return this._unstrippedHistoryCache.get(activeId)!;
    }
    return this._storageService.loadMessages(activeId);
  }

  private async _saveChatHistory(history: ChatMessage[]): Promise<void> {
    const activeId = this._getActiveSessionId();
    if (!activeId) return;

    // Cache unstripped history in-memory to preserve base64 images for active session
    this._unstrippedHistoryCache.set(activeId, history);

    // Update session metadata
    const sessions = this._storageService.getSessions();
    const sessionIndex = sessions.findIndex((s) => s.id === activeId);
    if (sessionIndex !== -1) {
      if (sessions[sessionIndex].title === 'New Session' && history.length > 0) {
        const firstUser = history.find((m) => m.role === 'user');
        if (firstUser) {
          let text = firstUser.content.trim();
          const contextIndex = text.indexOf('\n\n[Active File Context:');
          if (contextIndex !== -1) {
            text = text.substring(0, contextIndex).trim();
          }
          let title = text.substring(0, 32);
          if (text.length > 32) title += '...';
          sessions[sessionIndex].title = title || 'Chat Session';
        }
      }
      sessions[sessionIndex].timestamp = Date.now();
    }
    // Update message count in session metadata
    if (sessionIndex !== -1) {
      sessions[sessionIndex].messageCount = history.length;
    }
    await this._storageService.saveSessions(sessions);
    this._sendChatSessionsToWebview();

    // Persist messages to per-session key (strip base64 images to avoid bloat)
    const stripped = history.map((msg) => ({
      ...msg,
      images: msg.images ? msg.images.map(() => '[IMAGE STRIPPED]') : undefined,
    }));
    await this._storageService.saveMessages(activeId, stripped);

    // Send the original history with base64 images to the webview to preserve rendering and LLM context in-memory
    if (this._view) {
      this._view.webview.postMessage({
        type: 'updateChatHistory',
        history,
      });
    }
  }

  private _sendChatHistoryToWebview(): void {
    if (!this._view) return;
    const history = this._getChatHistory();
    this._view.webview.postMessage({
      type: 'updateChatHistory',
      history,
    });
  }

  private async _ensureDefaultSession(initialLoad: boolean = false): Promise<void> {
    const sessions = this._storageService.getSessions();
    let activeId = this._getActiveSessionId();

    if (sessions.length === 0) {
      const defaultSession: ChatSession = {
        id: 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
        title: 'New Session',
        timestamp: Date.now(),
        messages: [],
        messageCount: 0,
      };
      sessions.push(defaultSession);
      activeId = defaultSession.id;
      await this._storageService.saveSessions(sessions);
      await this._saveActiveSessionId(activeId);
      // Send empty history for the new default session
      if (initialLoad) {
        this._sendChatHistoryToWebview();
      }
    } else if (!activeId || !sessions.find((s) => s.id === activeId)) {
      activeId = sessions[0].id;
      await this._saveActiveSessionId(activeId);
      // Send history for the existing session we're switching to
      if (initialLoad) {
        this._sendChatHistoryToWebview();
      }
    }
  }

  private async _createNewSession(): Promise<void> {
    const sessions = this._storageService.getSessions();
    const newSession: ChatSession = {
      id: 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
      title: 'New Session',
      timestamp: Date.now(),
      messages: [],
      messageCount: 0,
    };
    sessions.unshift(newSession);
    await this._storageService.saveSessions(sessions);
    await this._saveActiveSessionId(newSession.id);
    this._resetAgentPlanAndMemory();

    this._sendChatSessionsToWebview();
    this._sendChatHistoryToWebview();
  }

  private async _selectSession(sessionId: string): Promise<void> {
    const sessions = this._storageService.getSessions();
    const session = sessions.find((s) => s.id === sessionId);
    if (session) {
      await this._saveActiveSessionId(sessionId);
      this._sendChatSessionsToWebview();
      this._sendChatHistoryToWebview();
    } else {
      // Session not found in list — could be stale. Re-sync from storage.
      this._sendChatSessionsToWebview();
      vscode.window.showWarningMessage(`Session "${sessionId}" not found. Refreshing session list.`);
    }
  }

  private async _deleteSession(sessionId: string): Promise<void> {
    const sessions = this._storageService.getSessions();
    const activeId = this._getActiveSessionId();

    const filtered = sessions.filter((s) => s.id !== sessionId);
    await this._storageService.saveSessions(filtered);

    // Also delete the messages key for this session
    await this._storageService.deleteMessages(sessionId);

    if (activeId === sessionId) {
      if (filtered.length > 0) {
        await this._saveActiveSessionId(filtered[0].id);
      } else {
        await this._saveActiveSessionId('');
        await this._ensureDefaultSession(true);
      }
    } else if (!activeId || !filtered.find((s) => s.id === activeId)) {
      // Our active session was deleted but we're on a different session — ensure we have a valid one
      await this._ensureDefaultSession(true);
    }

    this._sendChatSessionsToWebview();
    this._sendChatHistoryToWebview();
  }

  private _getActiveSessionId(): string | undefined {
    const id = this._context.workspaceState.get<string>('mirror-vs.activeSessionId');
    if (id) return id;
    // Fall back to file backup for cross-workspace compatibility
    return this._storageService.getActiveSessionIdFromFile();
  }

  private async _saveActiveSessionId(id: string): Promise<void> {
    await this._context.workspaceState.update('mirror-vs.activeSessionId', id);
    // Also persist to file backup
    this._storageService.persistActiveSessionId(id);
  }

  private _sendChatSessionsToWebview(): void {
    if (!this._view) return;
    const sessions = this._storageService.getSessions();
    const activeSessionId = this._getActiveSessionId() || '';
    // Use stored messageCount from metadata (faster than loading each session's messages)
    const enrichedSessions: ChatSession[] = sessions.map((s) => ({
      id: s.id,
      title: s.title,
      timestamp: s.timestamp,
      messages: [],
      messageCount: s.messageCount || 0,
    }));
    this._view.webview.postMessage({
      type: 'updateChatSessions',
      sessions: enrichedSessions,
      activeSessionId,
    });
  }

  private _sendWorkspaceFileTokenSource: vscode.CancellationTokenSource | undefined;

  // Recursive glob patterns to find files at any directory depth.
  // VS Code's findFiles automatically ignores standard system folders like node_modules via user settings.
  private static readonly _WORKSPACE_GLOB_PATTERNS = [
    '**/*.{ts,tsx,js,jsx,json,html,css,scss,py,rb,go,rs,md,yaml,yml,toml,sh,bash}',
  ];

  private async _sendWorkspaceFiles() {
    if (!this._view) return;

    // Cancel any previous pending scan
    if (this._sendWorkspaceFileTokenSource) {
      this._sendWorkspaceFileTokenSource.cancel();
      this._sendWorkspaceFileTokenSource.dispose();
    }

    try {
      this._sendWorkspaceFileTokenSource = new vscode.CancellationTokenSource();
      const token = this._sendWorkspaceFileTokenSource.token;

      // Run parallel recursive glob queries.
      // Use AbortController-style cancellation via the token.
      const allResults = await Promise.all(
        MirrorVsSidebarProvider._WORKSPACE_GLOB_PATTERNS.map((pattern) =>
          vscode.workspace.findFiles(pattern, undefined, 3000, token),
        ),
      );

      if (token.isCancellationRequested) return;

      // Deduplicate and flatten results
      const seen = new Set<string>();
      const files: string[] = [];
      for (const results of allResults) {
        for (const uri of results) {
          const relPath = path.relative(vscode.workspace.workspaceFolders![0].uri.fsPath, uri.fsPath);
          if (!seen.has(relPath)) {
            seen.add(relPath);
            files.push(relPath);
          }
        }
      }

      // Cap at 3000 files to support extremely large codebases seamlessly
      files.sort();
      const cappedFiles = files.slice(0, 3000);

      this._view.webview.postMessage({
        type: 'workspaceFiles',
        files: cappedFiles,
      });
    } catch (e) {
      console.warn('Workspace files fetch failed:', e);
      // Fallback: send empty list gracefully
      this._view?.webview.postMessage({ type: 'workspaceFiles', files: [] });
    }
  }

  public handleSelectionCommand(action: 'fix' | 'explain', text: string) {
    if (!this._view) {
      return;
    }
    if (!text.trim()) {
      vscode.window.showWarningMessage('Please select some code in the active editor first!');
      return;
    }

    const formattedText =
      action === 'fix'
        ? `Fix the following code:\n\`\`\`\n${text}\n\`\`\``
        : `Explain the following code:\n\`\`\`\n${text}\n\`\`\``;

    this._view.webview.postMessage({
      type: 'prefillPrompt',
      text: formattedText,
    });
  }
}

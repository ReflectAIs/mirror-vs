import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { SecretService } from '../services/secret-service';
import { StorageService } from '../services/storage-service';
import {
  getActiveFileName,
  getActiveFileContext,
  applyCodeToActiveEditor,
  revertCheckpoint,
} from '../utils/editor-utils';
import { LLMProvider, ExtensionSettings, ChatMessage, WebviewToExtensionMessage, ChatSession } from '../types';
import { CommandService } from '../services/command-service';
import { AgentOrchestrator } from '../agent/orchestrator';
import { fetchOllamaModels } from '../services/api-service';
import { ReviewManager } from '../services/review-manager';

export class MirrorVsSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'mirror-vs.sidebar';
  private _view?: vscode.WebviewView;
  private readonly _secretService: SecretService;
  private readonly _storageService: StorageService;
  private readonly _orchestrator: AgentOrchestrator;
  private readonly _migrationPromise: Promise<void>;

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
      (msg) => this._view?.webview.postMessage(msg),
      (targetPath) => this.getSafePath(targetPath),
    );
  }

  public async resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    this._view = webviewView;

    // Await storage migration completion before resolving view
    await this._migrationPromise;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._context.extensionUri],
    };

    // Construct the webview HTML
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

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
    webviewView.onDidDispose(() => {
      activeEditorListener.dispose();
      visibleEditorsListener.dispose();
      activeReviewsListener.dispose();
    });

    // Set up message listener from Webview
    webviewView.webview.onDidReceiveMessage(async (data: WebviewToExtensionMessage) => {
      switch (data.type) {
        case 'getSettings': {
          await this._sendSettingsToWebview();
          break;
        }
        case 'saveSettings': {
          const config = vscode.workspace.getConfiguration('mirror-vs');
          await config.update('defaultProvider', data.provider, vscode.ConfigurationTarget.Global);
          await config.update('ollamaHost', data.ollamaHost, vscode.ConfigurationTarget.Global);
          await config.update('defaultOllamaModel', data.defaultOllamaModel, vscode.ConfigurationTarget.Global);
          await config.update('defaultDeepSeekModel', data.defaultDeepSeekModel, vscode.ConfigurationTarget.Global);

          if (data.maxTurnsBeforeSummarize !== undefined) {
            await config.update(
              'maxTurnsBeforeSummarize',
              data.maxTurnsBeforeSummarize,
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
          let fullMessageText = data.text;

          // Process and append selected context files from user autocomplete selections
          if ((data as any).linkedFiles && (data as any).linkedFiles.length > 0) {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (workspaceFolder) {
              let linkedContent = '\n\n[Additional Workspace Files Context]:\n';
              for (const relPath of (data as any).linkedFiles) {
                const safePath = path.resolve(workspaceFolder, relPath);
                if (safePath.startsWith(workspaceFolder) && fs.existsSync(safePath)) {
                  try {
                    let content = '';
                    const proposed = ReviewManager.getInstance().getProposedContent(safePath);
                    if (proposed !== undefined) {
                      content = proposed;
                    } else {
                      content = fs.readFileSync(safePath, 'utf8');
                    }
                    if (content.length > 25000) {
                      const keepLength = 12500;
                      const truncatedCount = content.length - 25000;
                      content =
                        content.substring(0, keepLength) +
                        `\n\n... [TRUNCATED ${truncatedCount} CHARACTERS TO PREVENT CONTEXT HANGS / API LIMITS] ...\n\n` +
                        content.substring(content.length - keepLength);
                    }
                    linkedContent += `\n--- File: ${relPath} ---\n${content}\n`;
                  } catch (e) {
                    console.warn(`Could not load context file: ${relPath}`, e);
                  }
                }
              }
              fullMessageText += linkedContent;
            }
          }

          // Append active file context if any before sending
          const contextPrompt = getActiveFileContext();
          fullMessageText += contextPrompt;

          await this._orchestrator.handleMessageStream(fullMessageText, data.history, (data as any).images);
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
            (data as any).terminalName ||
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
              execFileSync('git', ['checkout', '--', data.file], { cwd: wsFolderApply, encoding: 'utf8', shell: false });
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
            execFileSync('git', ['commit', '-m', 'Mirror VS: agent changes committed'], { cwd: wsF, encoding: 'utf8' });
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
      }
    });

    // Ensure migration is complete before reading sessions/history
    await this._migrationPromise;

    await this._ensureDefaultSession(true);

    await this._sendSettingsToWebview();
    this._sendActiveFileContext();
    this._sendActiveReviewsCount();
    this._sendChatSessionsToWebview();
    this._sendChatHistoryToWebview();
    // Do NOT eagerly send workspace files — they are fetched on-demand
    // when user types '@' in the prompt input. This avoids crashes on large repos.
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

  public async clearActiveChat() {
    this._orchestrator.cancelActiveStream();
    await this._saveChatHistory([]);
    this._view?.webview.postMessage({
      type: 'updateChatHistory',
      history: [],
    });
    vscode.window.showInformationMessage('Chat session cleared.');
  }

  private async _sendSettingsToWebview() {
    if (!this._view) return;

    const config = vscode.workspace.getConfiguration('mirror-vs');
    const provider = config.get<LLMProvider>('defaultProvider', 'ollama');
    const ollamaHost = config.get<string>('ollamaHost', 'http://localhost:11434');
    const defaultOllamaModel = config.get<string>('defaultOllamaModel', 'llama3');
    const defaultDeepSeekModel = config.get<string>('defaultDeepSeekModel', 'deepseek-chat');
    const maxTurnsBeforeSummarize = config.get<number>('maxTurnsBeforeSummarize', 16);
    const turnsToRetain = config.get<number>('turnsToRetain', 6);

    const hasDeepSeekKey = await this._secretService.hasSecret('deepseek_api_key');
    const hasFigmaKey = await this._secretService.hasSecret('figma_api_key');

    const settings: ExtensionSettings = {
      provider,
      ollamaHost,
      defaultOllamaModel,
      defaultDeepSeekModel,
      hasDeepSeekKey,
      hasFigmaKey,
      maxTurnsBeforeSummarize,
      turnsToRetain,
    };

    this._view.webview.postMessage({
      type: 'updateSettings',
      settings,
    });
  }

  private _sendActiveFileContext() {
    if (!this._view) return;
    const fileName = getActiveFileName();
    this._view.webview.postMessage({
      type: 'activeFileChanged',
      fileName: fileName,
    });
  }

  private _sendActiveReviewsCount() {
    if (!this._view) return;
    const count = ReviewManager.getInstance().getActiveReviewsCount();
    this._view.webview.postMessage({
      type: 'activeReviewsChanged',
      count: count,
    });
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
    const htmlPath = vscode.Uri.joinPath(this._context.extensionUri, 'src', 'webview', 'sidebar.html');

    let htmlContent = '';
    try {
      htmlContent = fs.readFileSync(htmlPath.fsPath, 'utf8');
    } catch (err) {
      return `<h3>Error loading webview template</h3><p>${err}</p>`;
    }

    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, 'src', 'webview', 'sidebar.css'),
    );
    const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'src', 'webview', 'sidebar.js'));
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
    return this._storageService.loadMessages(activeId);
  }

  private async _saveChatHistory(history: ChatMessage[]): Promise<void> {
    const activeId = this._getActiveSessionId();
    if (!activeId) return;

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
    this._sendChatHistoryToWebview();
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
      messageCount: (s as any).messageCount || 0,
    }));
    this._view.webview.postMessage({
      type: 'updateChatSessions',
      sessions: enrichedSessions,
      activeSessionId,
    });
  }

  private _sendWorkspaceFileTokenSource: vscode.CancellationTokenSource | undefined;

  // Restricted glob — only top-level and 1-level nested files in key source dirs.
  // Avoids deep recursive enumeration that crashes on large repos.
  private static readonly _WORKSPACE_GLOB_PATTERNS = [
    // Top-level source files only
    '*.{ts,tsx,js,jsx,json,html,css,scss,py,rb,go,rs,md,yaml,yml,toml,sh,bash}',
    // Common src/ directory (1 level deep max)
    'src/*.{ts,tsx,js,jsx,json,html,css,scss,py,rb,go,rs,md,yaml,yml}',
    // Some projects use lib/, app/, server/ — shallow only
    'lib/*.{ts,tsx,js,jsx,json}',
    'app/*.{ts,tsx,js,jsx,json,html,css,scss}',
    'server/*.{ts,tsx,js,jsx,json}',
    'components/*.{ts,tsx,js,jsx,vue,svelte}',
    'pages/*.{ts,tsx,js,jsx}',
    'utils/*.{ts,tsx,js,jsx}',
    'helpers/*.{ts,tsx,js,jsx}',
    'config/*.{ts,tsx,js,jsx,json,yaml,yml}',
    'routes/*.{ts,tsx,js,jsx}',
    'middleware/*.{ts,tsx,js,jsx}',
    'models/*.{ts,tsx,js,jsx,py,go}',
    'controllers/*.{ts,tsx,js,jsx,py,go}',
    'api/*.{ts,tsx,js,jsx,py}',
    'scripts/*.{ts,tsx,js,jsx,py,sh,bash}',
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

      // Run multiple parallel restricted glob queries instead of one huge one.
      // Each pattern only matches shallow files in specific directories.
      // Use AbortController-style cancellation via the token.
      const allResults = await Promise.all(
        MirrorVsSidebarProvider._WORKSPACE_GLOB_PATTERNS.map(pattern =>
          vscode.workspace.findFiles(pattern, undefined, 50, token),
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

      // Hard cap what we send
      files.sort();
      const cappedFiles = files.slice(0, 300);

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

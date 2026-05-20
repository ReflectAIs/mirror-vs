import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { fetchOllamaModels, streamOllamaChat, streamDeepSeekChat } from '../services/api-service';
import { SecretService } from '../services/secret-service';
import { getActiveFileName, getActiveFileContext, applyCodeToActiveEditor, createCheckpoint, revertCheckpoint } from '../utils/editor-utils';
import { LLMProvider, ExtensionSettings, ChatMessage, WebviewToExtensionMessage, ChatSession } from '../types';
import { BrowserService } from '../services/browser-service';
import { CommandService } from '../services/command-service';

interface ToolCall {
  name: 'read_file' | 'create_file' | 'write_file' | 'patch_file' | 'list_dir' | 'grep_search' | 'browser_navigate' | 'browser_click' | 'browser_type' | 'browser_screenshot' | 'run_command';
  path?: string;
  query?: string;
  content?: string;
  url?: string;
  selector?: string;
  text?: string;
  command?: string;
}

const AGENT_SYSTEM_PROMPT = `You are Mirror VS, a highly capable, autonomous AI coding assistant integrated directly into the developer's Visual Studio Code IDE.

Your primary mission is to help the developer implement features, refactor code, find bugs, and manage files automatically with minimum friction.

To accomplish these tasks, you have access to a set of special workspace tools that you can invoke using XML-like tags. When you use one of these tags in your response, the execution host will automatically intercept it, run the requested tool, and feed the exact result back to you in a subsequent "system" role message. You will then continue your work using those results in a multi-turn autonomous loop.

### IMPORTANT TOOL USAGE RULES:
1. Always output valid XML tags. All parameters (like path and query) MUST be enclosed in double quotes.
2. Self-closing tags MUST end with " />".
3. When creating or writing files, always provide the COMPLETE, FULL file content. Do NOT use ellipsis, comments like "// rest of code", or placeholders/stubs, because the file will be written exactly as you provide it. When using patch_file, always make sure the SEARCH blocks match the target file content exactly, and provide complete and functional changes in the REPLACE blocks.
4. CRITICAL: You MUST call ONLY ONE tool per response turn. After outputting a tool tag, immediately STOP GENERATING. Do not hallucinate the tool result. The system will execute the tool and provide the result to you in the next turn.
5. In every turn, if a tool result indicates a failure, read the error message carefully and correct your input in the next turn.
6. NEVER say "let me check", "I will verify", "let me look", or any similar phrase WITHOUT immediately outputting a tool tag in the same response. If you intend to check something, DO IT NOW by outputting the appropriate tool tag. Stating an intention without a tool tag is FORBIDDEN and will cause the agent loop to terminate prematurely.
7. BACKGROUND COMMANDS: If a run_command result says a command is "running in the background", you MUST immediately verify its side effects in the next turn using a tool. For example:
   - After "npm install" backgrounds → run: <run_command command="ls node_modules | head -5" />
   - After a dev server backgrounds → run: <run_command command="curl -s -o /dev/null -w '%{http_code}' http://localhost:PORT" />
   - After "npm run build" backgrounds → run: <run_command command="ls dist" /> or <list_dir path="dist" />
   Never assume a background command succeeded. Always verify with a follow-up tool call.
8. Keep explanations minimal. Prefer action over narration. Do the work, don't describe it.

### AVAILABLE TOOLS:

1. READ FILE:
   Read the complete contents of an existing file.
   Usage:
   <read_file path="relative/path/to/file.ts" />
   Note: The path is relative to the open workspace directory.

2. CREATE FILE:
   Create a new file with specified contents. If directories in the path do not exist, they will be created automatically.
   Usage:
   <create_file path="relative/path/to/new_file.ts">
   // full contents of the file here
   </create_file>

3. WRITE FILE:
   Overwrite or update the contents of an existing file.
   Usage:
   <write_file path="relative/path/to/existing_file.ts">
   // full contents of the file here
   </write_file>

4. PATCH FILE:
   Apply targeted search-and-replace edits to an existing file without rewriting it entirely.
   Always prefer patch_file over write_file when making partial changes to large files, as it is faster and safer.
   Usage:
   <patch_file path="relative/path/to/existing_file.ts">
   <<<<<<< SEARCH
   // exact lines to find (must match exactly, including whitespace and indentation)
   =======
   // replacement lines
   >>>>>>> REPLACE
   </patch_file>
   You can include multiple SEARCH/REPLACE blocks in one patch_file call.
   IMPORTANT: The SEARCH block must match existing file content exactly.

5. LIST DIRECTORY:
   List all files and subdirectories directly inside the specified directory path.
   Usage:
   <list_dir path="relative/path/to/directory" />

6. GREP SEARCH:
   Search for a string or pattern within files across the workspace. Ignores standard ignored paths (node_modules, .git, etc.).
   Usage:
   <grep_search query="pattern_to_find" />

7. BROWSER NAVIGATE:
   Open a URL in the browser.
   Usage:
   <browser_navigate url="http://localhost:3000" />

8. BROWSER CLICK:
   Click an element in the browser.
   Usage:
   <browser_click selector="#my-button" />

9. BROWSER TYPE:
   Type text into an input field in the browser.
   Usage:
   <browser_type selector="#search-input" text="hello world" />

10. BROWSER SCREENSHOT:
    Take a screenshot of the current page (returns base64 image).
    Usage:
    <browser_screenshot />

11. RUN COMMAND:
    Execute a terminal command in the workspace folder.
    - Short commands (ls, cat, curl, npm run build, npm install, etc.) run and return full output.
    - Server/watcher commands (npm run dev, npm start, python -m http.server) run in the background and return initial output. Always follow up with a verification command.
    Usage:
    <run_command command="npm install" />

### EXECUTION WORKFLOW EXAMPLE:
Developer: "Install deps and start the todo app dev server."
Your Turn 1: "Installing dependencies."
<run_command command="cd todo-app && npm install" />
Host (System): "[Tool Result for run_command on \"cd todo-app && npm install\"]: Success - added 312 packages..."
Your Turn 2:
<run_command command="cd todo-app && npm run dev" />
Host (System): "[Tool Result for run_command on \"cd todo-app && npm run dev\"]: Server command is running in the background (PID: 1234). Initial Output: VITE v5.0 ready on http://localhost:5173"
Your Turn 3: "Verifying the server is up."
<run_command command="curl -s -o /dev/null -w '%{http_code}' http://localhost:5173" />
Host (System): "[Tool Result for run_command on \"curl ...\"]: Success - 200"
Your Turn 4: "Server is confirmed running. Navigating to the app."
<browser_navigate url="http://localhost:5173" />

Remember: Every intention to check, verify, or investigate MUST be followed immediately by a tool tag in the same response turn. Outputting text without a tool tag ends your turn and stops the agent loop.`;

export class MirrorVsSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'mirror-vs.sidebar';
  private _view?: vscode.WebviewView;
  private _activeAbortController?: AbortController;
  private readonly _secretService: SecretService;

  constructor(private readonly _context: vscode.ExtensionContext) {
    this._secretService = new SecretService(_context.secrets);
  }

  public async resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): Promise<void> {
    this._view = webviewView;

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
    webviewView.onDidDispose(() => {
      activeEditorListener.dispose();
      visibleEditorsListener.dispose();
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

          if (data.deepSeekKey !== undefined) {
            if (data.deepSeekKey.trim() === '') {
              await this._secretService.deleteSecret('deepseek_api_key');
            } else {
              await this._secretService.storeSecret('deepseek_api_key', data.deepSeekKey.trim());
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
        case 'sendMessage': {
          await this._handleMessageStream(data.text, data.history);
          break;
        }
        case 'applyCode': {
          await applyCodeToActiveEditor(data.code, data.mode);
          break;
        }
        case 'clearChat': {
          this.clearActiveChat();
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
              await vscode.window.showTextDocument(doc);
            } else {
              vscode.window.showErrorMessage(`File not found: ${data.path}`);
            }
          }
          break;
        }
        case 'openTerminal': {
          if (!data.command) break;
          const svc = CommandService.getInstance();
          // Use the terminalName sent by the webview if provided (agent-spawned terminal),
          // otherwise derive it from the command the same way CommandService does.
          const termName = (data as any).terminalName
            || `Mirror: ${data.command.length > 30 ? data.command.substring(0, 30) + '…' : data.command}`;
          // Try to reveal an existing agent-managed terminal first
          const revealed = svc.revealTerminal(termName);
          if (!revealed) {
            // No tracked terminal found — create a fresh one and run the command
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
        case 'revertCheckpoint': {
          console.log(`[Host] revertCheckpoint received for ID: ${data.checkpointId}`);
          const success = await revertCheckpoint(data.checkpointId);
          console.log(`[Host] revertCheckpoint result: ${success}`);

          // Send callback event to webview
          this._view?.webview.postMessage({
            type: 'checkpointReverted',
            checkpointId: data.checkpointId,
            success
          });

          if (success) {
            const history = this._getChatHistory();
            let updated = false;
            const newHistory = history.map(msg => {
              if (msg.role === 'system' && msg.content.includes(data.checkpointId)) {
                const newContent = msg.content.replace(
                  new RegExp(`Revert ID:\\s*${data.checkpointId}`, 'g'),
                  `Reverted ID: ${data.checkpointId}`
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
            } else {
              console.warn(`[Host] Warning: Revert ID ${data.checkpointId} not found or replaced in history!`);
            }
          }
          break;
        }
      }
    });

    // Ensure at least one session exists
    await this._ensureDefaultSession();

    // Send initial state
    await this._sendSettingsToWebview();
    this._sendActiveFileContext();
    this._sendChatSessionsToWebview();
    this._sendChatHistoryToWebview();
  }

  /**
   * Clears any running stream and sends clean-up indicators if needed.
   */
  public async clearActiveChat() {
    if (this._activeAbortController) {
      this._activeAbortController.abort();
      this._activeAbortController = undefined;
    }
    await this._saveChatHistory([]);
    this._view?.webview.postMessage({
      type: 'updateChatHistory',
      history: [],
    });
    vscode.window.showInformationMessage('Chat session cleared.');
  }

  /**
   * Reads settings from workspace config and secrets, and pushes the structure to Webview.
   */
  private async _sendSettingsToWebview() {
    if (!this._view) {
      return;
    }

    const config = vscode.workspace.getConfiguration('mirror-vs');
    const provider = config.get<LLMProvider>('defaultProvider', 'ollama');
    const ollamaHost = config.get<string>('ollamaHost', 'http://localhost:11434');
    const defaultOllamaModel = config.get<string>('defaultOllamaModel', 'llama3');
    const defaultDeepSeekModel = config.get<string>('defaultDeepSeekModel', 'deepseek-chat');

    const hasDeepSeekKey = await this._secretService.hasSecret('deepseek_api_key');

    const settings: ExtensionSettings = {
      provider,
      ollamaHost,
      defaultOllamaModel,
      defaultDeepSeekModel,
      hasDeepSeekKey,
    };

    this._view.webview.postMessage({
      type: 'updateSettings',
      settings,
    });
  }

  /**
   * Sends the current active file's short name to the Webview context bar.
   */
  private _sendActiveFileContext() {
    if (!this._view) {
      return;
    }
    const fileName = getActiveFileName();
    this._view.webview.postMessage({
      type: 'activeFileChanged',
      fileName: fileName,
    });
  }

  /**
   * Fetches installed Ollama models and sends them to the Webview.
   */
  private async _fetchAndSendOllamaModels() {
    if (!this._view) {
      return;
    }

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

  /**
   * Handles core AI chat streaming, injecting active file context if present.
   */
  private async _handleMessageStream(text: string, history: ChatMessage[]) {
    if (!this._view) {
      return;
    }

    // Cancel any previous incomplete response streams
    if (this._activeAbortController) {
      this._activeAbortController.abort();
    }
    this._activeAbortController = new AbortController();
    const signal = this._activeAbortController.signal;

    // Retrieve active configuration
    const config = vscode.workspace.getConfiguration('mirror-vs');
    const provider = config.get<LLMProvider>('defaultProvider', 'ollama');
    const ollamaHost = config.get<string>('ollamaHost', 'http://localhost:11434');
    const defaultOllamaModel = config.get<string>('defaultOllamaModel', 'llama3');
    const defaultDeepSeekModel = config.get<string>('defaultDeepSeekModel', 'deepseek-chat');

    let apiKey = '';
    if (provider === 'deepseek') {
      apiKey = await this._secretService.getSecret('deepseek_api_key') || '';
      if (!apiKey) {
        this._view.webview.postMessage({
          type: 'chatResponseError',
          error: 'DeepSeek API Key is missing. Please add your key in the settings drawer.'
        });
        return;
      }
    }

    let currentMessages = [...history];

    // If there is user text, capture context and add user prompt to history
    if (text) {
      const contextPrompt = getActiveFileContext();
      const userMessageContent = text + contextPrompt;
      currentMessages.push({ role: 'user', content: userMessageContent });
      await this._saveChatHistory(currentMessages);
    }

    let loopCount = 0;
    const maxLoops = 25; // Guard against infinite run loops
    let continueLoop = true;

    try {
      while (continueLoop && loopCount < maxLoops) {
        loopCount++;
        continueLoop = false; // Stop by default unless tools are called

        // Build full payload prepended with System Prompt instructions
        const payload: { role: 'user' | 'assistant' | 'system'; content: string; images?: string[] }[] = [
          { role: 'system' as const, content: AGENT_SYSTEM_PROMPT },
          ...currentMessages.map(msg => ({
            role: msg.role as 'user' | 'assistant' | 'system',
            content: msg.content,
            images: msg.images
          }))
        ];

        // Notify webview that LLM completion turn has started
        this._view.webview.postMessage({ type: 'chatResponseStart' });

        const completionController = new AbortController();
        const mainAbortListener = () => completionController.abort();
        signal.addEventListener('abort', mainAbortListener);

        // Retrieve full response string from LLM
        const assistantResponse = await this._getLLMCompletion(
          provider,
          ollamaHost,
          provider === 'ollama' ? defaultOllamaModel : defaultDeepSeekModel,
          apiKey,
          payload,
          completionController.signal,
          completionController
        );

        signal.removeEventListener('abort', mainAbortListener);

        // Save assistant response to conversation history
        currentMessages.push({ role: 'assistant', content: assistantResponse });
        await this._saveChatHistory(currentMessages);

        // Parse tool calls from the response
        const toolCalls = this._parseToolCalls(assistantResponse);

        if (toolCalls.length > 0) {
          const toolResults: string[] = [];

          for (const tool of toolCalls) {
            const target = tool.path || tool.query || tool.url || tool.selector || tool.command || '';
            this._sendToolStatusToWebview(tool.name, 'running', target);

            try {
              const result = await this._executeTool(tool);

              // Check for revert ID
              let checkpointId: string | undefined;
              const cpMatch = result.match(/Revert ID: (\w+)/);
              if (cpMatch) {
                checkpointId = cpMatch[1];
              }

              // For run_command server tools, extract the terminal name so the
              // webview button can reveal the exact terminal that was opened.
              let terminalName: string | undefined;
              if (tool.name === 'run_command') {
                const tnMatch = result.match(/VS Code terminal "([^"]+)"/);
                if (tnMatch) {
                  terminalName = tnMatch[1];
                }
              }

              this._sendToolStatusToWebview(tool.name, 'success', target, result, checkpointId, tool.content, terminalName);
              toolResults.push(`[Tool Result for ${tool.name} on "${target}"]: Success - ${result}`);
            } catch (err: any) {
              this._sendToolStatusToWebview(tool.name, 'error', target, err.message);
              toolResults.push(`[Tool Result for ${tool.name} on "${target}"]: Error - ${err.message}`);
            }
          }

          // Extract base64 images from tool results for vision models
          const images: string[] = [];
          const cleanedToolResults = toolResults.map(res => {
            const match = res.match(/\(Base64 data hidden from output but sent to vision model: (.*)\)/);
            if (match) {
              images.push(match[1]);
              return res.replace(match[0], '(Image successfully captured and sent to vision model)');
            }
            return res;
          });

          // Feed execution outputs back into history as a system message
          const combinedToolResult = cleanedToolResults.join('\n\n');
          const systemMessage: ChatMessage = { role: 'system', content: combinedToolResult };
          if (images.length > 0) {
            systemMessage.images = images;
          }
          currentMessages.push(systemMessage);
          await this._saveChatHistory(currentMessages);

          // Loop again to feed results to the model
          continueLoop = true;
        }
      }

      // Signal completion of entire autonomous loop
      this._view.webview.postMessage({ type: 'loopComplete' });

    } catch (err: any) {
      if (signal.aborted) {
        console.log('Agent stream aborted.');
      } else {
        this._view.webview.postMessage({ type: 'chatResponseError', error: err.message });
      }
    } finally {
      this._activeAbortController = undefined;
    }
  }

  private hasCompleteToolCall(text: string): boolean {
    const selfClosingTools = ['read_file', 'list_dir', 'grep_search', 'browser_navigate', 'browser_click', 'browser_type', 'browser_screenshot', 'run_command'];
    for (const tool of selfClosingTools) {
      const regex = new RegExp(`<${tool}[^>]*>`, 'i');
      if (regex.test(text)) {
        return true;
      }
    }

    const blockTools = ['create_file', 'write_file', 'patch_file'];
    for (const tool of blockTools) {
      const regex = new RegExp(`</${tool}\\s*>`, 'i');
      if (regex.test(text)) {
        return true;
      }
    }

    return false;
  }

  private async _getLLMCompletion(
    provider: LLMProvider,
    host: string,
    model: string,
    apiKey: string,
    messages: { role: 'user' | 'assistant' | 'system'; content: string; images?: string[] }[],
    signal: AbortSignal,
    completionController?: AbortController
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let fullText = '';

      if (provider === 'ollama') {
        streamOllamaChat(
          host,
          model,
          messages,
          signal,
          (chunk) => {
            fullText += chunk;
            this._view?.webview.postMessage({ type: 'chatResponseChunk', text: chunk });

            if (this.hasCompleteToolCall(fullText)) {
              completionController?.abort();
              this._view?.webview.postMessage({ type: 'chatResponseComplete', fullText });
              resolve(fullText);
            }
          },
          (completedText) => {
            this._view?.webview.postMessage({ type: 'chatResponseComplete', fullText: completedText });
            resolve(completedText);
          },
          (err) => {
            reject(err);
          }
        );
      } else {
        streamDeepSeekChat(
          apiKey,
          model,
          messages,
          signal,
          (chunk) => {
            fullText += chunk;
            this._view?.webview.postMessage({ type: 'chatResponseChunk', text: chunk });

            if (this.hasCompleteToolCall(fullText)) {
              completionController?.abort();
              this._view?.webview.postMessage({ type: 'chatResponseComplete', fullText });
              resolve(fullText);
            }
          },
          (completedText) => {
            this._view?.webview.postMessage({ type: 'chatResponseComplete', fullText: completedText });
            resolve(completedText);
          },
          (err) => {
            reject(err);
          }
        );
      }
    });
  }

  private _parseToolCalls(text: string): ToolCall[] {
    const tools: ToolCall[] = [];
    let match;

    // 1. read_file
    const readFileRegex = /<read_file([\s\S]*?)\/?>/gi;
    while ((match = readFileRegex.exec(text)) !== null) {
      const attrs = match[1];
      const pathMatch = attrs.match(/path\s*=\s*["']([^"']+)["']/i);
      if (pathMatch) {
        tools.push({ name: 'read_file', path: pathMatch[1].trim() });
      }
    }

    // 2. list_dir
    const listDirRegex = /<list_dir([\s\S]*?)\/?>/gi;
    while ((match = listDirRegex.exec(text)) !== null) {
      const attrs = match[1];
      const pathMatch = attrs.match(/path\s*=\s*["']([^"']+)["']/i);
      if (pathMatch) {
        tools.push({ name: 'list_dir', path: pathMatch[1].trim() });
      }
    }

    // 3. grep_search
    const grepSearchRegex = /<grep_search([\s\S]*?)\/?>/gi;
    while ((match = grepSearchRegex.exec(text)) !== null) {
      const attrs = match[1];
      const queryMatch = attrs.match(/query\s*=\s*["']([^"']+)["']/i);
      if (queryMatch) {
        tools.push({ name: 'grep_search', query: queryMatch[1] });
      }
    }

    // 4. write_file
    const writeFileRegex = /<write_file([\s\S]*?)>([\s\S]*?)<\/write_file\s*>/gi;
    while ((match = writeFileRegex.exec(text)) !== null) {
      const attrs = match[1];
      const content = match[2];
      const pathMatch = attrs.match(/path\s*=\s*["']([^"']+)["']/i);
      if (pathMatch) {
        tools.push({ name: 'write_file', path: pathMatch[1].trim(), content });
      }
    }

    // 5. create_file
    const createFileRegex = /<create_file([\s\S]*?)>([\s\S]*?)<\/create_file\s*>/gi;
    while ((match = createFileRegex.exec(text)) !== null) {
      const attrs = match[1];
      const content = match[2];
      const pathMatch = attrs.match(/path\s*=\s*["']([^"']+)["']/i);
      if (pathMatch) {
        tools.push({ name: 'create_file', path: pathMatch[1].trim(), content });
      }
    }

    // 5b. patch_file
    const patchFileRegex = /<patch_file([\s\S]*?)>([\s\S]*?)<\/patch_file\s*>/gi;
    while ((match = patchFileRegex.exec(text)) !== null) {
      const attrs = match[1];
      const content = match[2];
      const pathMatch = attrs.match(/path\s*=\s*["']([^"']+)["']/i);
      if (pathMatch) {
        tools.push({ name: 'patch_file', path: pathMatch[1].trim(), content });
      }
    }

    // 6. browser_navigate
    const browserNavRegex = /<browser_navigate([\s\S]*?)\/?>/gi;
    while ((match = browserNavRegex.exec(text)) !== null) {
      const attrs = match[1];
      const urlMatch = attrs.match(/url\s*=\s*["']([^"']+)["']/i);
      if (urlMatch) {
        tools.push({ name: 'browser_navigate', url: urlMatch[1] });
      }
    }

    // 7. browser_click
    const browserClickRegex = /<browser_click([\s\S]*?)\/?>/gi;
    while ((match = browserClickRegex.exec(text)) !== null) {
      const attrs = match[1];
      const selMatch = attrs.match(/selector\s*=\s*["']([^"']+)["']/i);
      if (selMatch) {
        tools.push({ name: 'browser_click', selector: selMatch[1] });
      }
    }

    // 8. browser_type
    const browserTypeRegex = /<browser_type([\s\S]*?)\/?>/gi;
    while ((match = browserTypeRegex.exec(text)) !== null) {
      const attrs = match[1];
      const selMatch = attrs.match(/selector\s*=\s*["']([^"']+)["']/i);
      const textMatch = attrs.match(/text\s*=\s*["']([^"']+)["']/i);
      if (selMatch && textMatch) {
        tools.push({ name: 'browser_type', selector: selMatch[1], text: textMatch[1] });
      }
    }

    // 9. browser_screenshot
    const browserScreenshotRegex = /<browser_screenshot[\s\S]*?\/?>/gi;
    while ((match = browserScreenshotRegex.exec(text)) !== null) {
      tools.push({ name: 'browser_screenshot' });
    }

    // 10. run_command
    const runCommandRegex = /<run_command([\s\S]*?)\/?>/gi;
    while ((match = runCommandRegex.exec(text)) !== null) {
      const attrs = match[1];
      const cmdMatch = attrs.match(/command\s*=\s*["']([^"']+)["']/i);
      if (cmdMatch) {
        tools.push({ name: 'run_command', command: cmdMatch[1] });
      }
    }

    return tools;
  }

  private getSafePath(targetPath: string): string {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) {
      throw new Error('No workspace folder open.');
    }
    const resolved = path.resolve(workspaceFolder, targetPath);
    if (!resolved.startsWith(workspaceFolder)) {
      throw new Error('Access denied: File path is outside of workspace.');
    }
    return resolved;
  }

  private async _executeTool(tool: ToolCall): Promise<string> {
    switch (tool.name) {
      case 'read_file': {
        if (!tool.path) throw new Error('Missing "path" attribute for read_file.');
        const safePath = this.getSafePath(tool.path);
        if (!fs.existsSync(safePath)) {
          throw new Error(`File does not exist: ${tool.path}`);
        }
        return fs.readFileSync(safePath, 'utf8');
      }

      case 'list_dir': {
        if (!tool.path) throw new Error('Missing "path" attribute for list_dir.');
        const safePath = this.getSafePath(tool.path);
        if (!fs.existsSync(safePath)) {
          throw new Error(`Directory does not exist: ${tool.path}`);
        }
        const stat = fs.statSync(safePath);
        if (!stat.isDirectory()) {
          throw new Error(`Not a directory: ${tool.path}`);
        }
        const entries = fs.readdirSync(safePath);
        return entries.map(e => {
          const isDir = fs.statSync(path.join(safePath, e)).isDirectory();
          return `${e}${isDir ? '/' : ''}`;
        }).join('\n') || '[Directory is empty]';
      }

      case 'grep_search': {
        if (!tool.query) throw new Error('Missing "query" attribute for grep_search.');
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceFolder) throw new Error('No workspace folder open.');

        const query = tool.query.toLowerCase();
        const results: string[] = [];

        const search = (dir: string) => {
          const list = fs.readdirSync(dir);
          for (const item of list) {
            if (['node_modules', 'dist', '.git', '.mirror-vs'].includes(item)) continue;
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              search(fullPath);
            } else if (stat.isFile()) {
              try {
                const content = fs.readFileSync(fullPath, 'utf8');
                if (content.toLowerCase().includes(query)) {
                  const lines = content.split('\n');
                  lines.forEach((line, idx) => {
                    if (line.toLowerCase().includes(query)) {
                      const relPath = path.relative(workspaceFolder, fullPath);
                      results.push(`${relPath}:${idx + 1}: ${line.trim()}`);
                    }
                  });
                }
              } catch (e) {
                // Ignore binary/read errors
              }
            }
          }
        };
        search(workspaceFolder);
        return results.slice(0, 40).join('\n') || 'No matches found.';
      }

      case 'create_file': {
        if (!tool.path) throw new Error('Missing "path" attribute for create_file.');
        const safePath = this.getSafePath(tool.path);
        const dir = path.dirname(safePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        const checkpointId = await createCheckpoint(safePath, 'create');
        fs.writeFileSync(safePath, tool.content || '', 'utf8');

        try {
          const doc = await vscode.workspace.openTextDocument(safePath);
          await vscode.window.showTextDocument(doc);
        } catch (e) {
          // ignore editor open failures
        }

        return `File created and opened in editor: ${tool.path}. Revert ID: ${checkpointId}`;
      }

      case 'write_file': {
        if (!tool.path) throw new Error('Missing "path" attribute for write_file.');
        const safePath = this.getSafePath(tool.path);
        const originalContent = fs.existsSync(safePath) ? fs.readFileSync(safePath, 'utf8') : '';
        const dir = path.dirname(safePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        const checkpointId = await createCheckpoint(safePath, 'replace');
        fs.writeFileSync(safePath, tool.content || '', 'utf8');

        try {
          const doc = await vscode.workspace.openTextDocument(safePath);
          await vscode.window.showTextDocument(doc);
        } catch (e) {
          // ignore editor open failures
        }

        return `File updated and opened in editor: ${tool.path}. Revert ID: ${checkpointId}`;
      }

      case 'patch_file': {
        if (!tool.path) throw new Error('Missing "path" attribute for patch_file.');
        const safePath = this.getSafePath(tool.path);
        if (!fs.existsSync(safePath)) {
          throw new Error(`File does not exist: ${tool.path}`);
        }

        let fileContent = fs.readFileSync(safePath, 'utf8').replace(/\r\n/g, '\n');
        const patches = parsePatchBlocks(tool.content || '');
        if (patches.length === 0) {
          throw new Error('No valid SEARCH/REPLACE blocks found in patch_file content.');
        }

        for (let i = 0; i < patches.length; i++) {
          const { search, replace } = patches[i];
          if (!fileContent.includes(search)) {
            throw new Error(`SEARCH block #${i + 1} not found in file. Make sure the search block matches the file content exactly (including whitespace and indentation).\nSearch target:\n${search}`);
          }
          fileContent = fileContent.replace(search, replace);
        }

        const checkpointId = await createCheckpoint(safePath, 'replace');
        fs.writeFileSync(safePath, fileContent, 'utf8');

        try {
          const doc = await vscode.workspace.openTextDocument(safePath);
          await vscode.window.showTextDocument(doc);
        } catch (e) {
          // ignore editor open failures
        }

        return `File patched: ${tool.path}. Applied ${patches.length} block(s). Revert ID: ${checkpointId}`;
      }

      case 'browser_navigate': {
        if (!tool.url) throw new Error('Missing "url" attribute for browser_navigate.');
        return await BrowserService.getInstance().navigate(tool.url);
      }

      case 'browser_click': {
        if (!tool.selector) throw new Error('Missing "selector" attribute for browser_click.');
        return await BrowserService.getInstance().click(tool.selector);
      }

      case 'browser_type': {
        if (!tool.selector) throw new Error('Missing "selector" attribute for browser_type.');
        if (!tool.text) throw new Error('Missing "text" attribute for browser_type.');
        return await BrowserService.getInstance().type(tool.selector, tool.text);
      }

      case 'browser_screenshot': {
        const base64Image = await BrowserService.getInstance().screenshot();
        return `Screenshot taken successfully. (Base64 data hidden from output but sent to vision model: ${base64Image})`;
      }

      case 'run_command': {
        if (!tool.command) throw new Error('Missing "command" attribute for run_command.');
        return await CommandService.getInstance().executeCommand(tool.command);
      }

      default:
        throw new Error(`Unsupported tool call: ${(tool as any).name}`);
    }
  }

  private _sendToolStatusToWebview(
    toolName: string,
    status: 'running' | 'success' | 'error',
    target: string,
    result?: string,
    checkpointId?: string,
    code?: string,
    terminalName?: string
  ) {
    this._view?.webview.postMessage({
      type: 'toolStatus',
      toolName,
      status,
      target,
      result,
      checkpointId,
      code,
      terminalName
    });
  }

  /**
   * Loads the HTML structure from local disk and replaces resource paths with Webview URIs.
   */
  private _getHtmlForWebview(webview: vscode.Webview): string {
    const htmlPath = vscode.Uri.joinPath(this._context.extensionUri, 'src', 'webview', 'sidebar.html');

    let htmlContent = '';
    try {
      htmlContent = fs.readFileSync(htmlPath.fsPath, 'utf8');
    } catch (err) {
      return `<h3>Error loading webview template</h3><p>${err}</p>`;
    }

    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'src', 'webview', 'sidebar.css'));
    const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'src', 'webview', 'sidebar.js'));
    const cspSource = webview.cspSource;

    // Inject styles, scripts, and security policy
    htmlContent = htmlContent.replace('{{styleUri}}', cssUri.toString());
    htmlContent = htmlContent.replace('{{scriptUri}}', jsUri.toString());
    htmlContent = htmlContent.replace(/{{cspSource}}/g, cspSource);

    return htmlContent;
  }

  private _getChatHistory(): ChatMessage[] {
    const activeId = this._getActiveSessionId();
    if (!activeId) {
      return [];
    }
    const sessions = this._getChatSessions();
    const session = sessions.find(s => s.id === activeId);
    return session ? session.messages : [];
  }

  private async _saveChatHistory(history: ChatMessage[]): Promise<void> {
    const activeId = this._getActiveSessionId();
    if (!activeId) {
      return;
    }
    const sessions = this._getChatSessions();
    const sessionIndex = sessions.findIndex(s => s.id === activeId);
    if (sessionIndex !== -1) {
      sessions[sessionIndex].messages = history;
      // Auto-update title if it's "New Session" and we have messages
      if (sessions[sessionIndex].title === 'New Session' && history.length > 0) {
        const firstUser = history.find(m => m.role === 'user');
        if (firstUser) {
          let text = firstUser.content.trim();
          const contextIndex = text.indexOf('\n\n--- Active File Context');
          if (contextIndex !== -1) {
            text = text.substring(0, contextIndex).trim();
          }
          let title = text.substring(0, 32);
          if (text.length > 32) {
            title += '...';
          }
          sessions[sessionIndex].title = title || 'Chat Session';
        }
      }
      sessions[sessionIndex].timestamp = Date.now();
      await this._saveChatSessions(sessions);

      this._sendChatSessionsToWebview();
    }
    await this._context.workspaceState.update('mirror-vs.chatHistory', history);
    this._sendChatHistoryToWebview();
  }

  private _sendChatHistoryToWebview(): void {
    if (!this._view) {
      return;
    }
    const history = this._getChatHistory();
    this._view.webview.postMessage({
      type: 'updateChatHistory',
      history,
    });
  }

  private async _ensureDefaultSession(): Promise<void> {
    const sessions = this._getChatSessions();
    let activeId = this._getActiveSessionId();

    if (sessions.length === 0) {
      const defaultSession: ChatSession = {
        id: 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
        title: 'New Session',
        timestamp: Date.now(),
        messages: [],
      };
      sessions.push(defaultSession);
      activeId = defaultSession.id;
      await this._saveChatSessions(sessions);
      await this._saveActiveSessionId(activeId);
    } else if (!activeId || !sessions.find(s => s.id === activeId)) {
      activeId = sessions[0].id;
      await this._saveActiveSessionId(activeId);
    }
  }

  private async _createNewSession(): Promise<void> {
    const sessions = this._getChatSessions();
    const newSession: ChatSession = {
      id: 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
      title: 'New Session',
      timestamp: Date.now(),
      messages: [],
    };
    sessions.unshift(newSession);
    await this._saveChatSessions(sessions);
    await this._saveActiveSessionId(newSession.id);

    this._sendChatSessionsToWebview();
    this._sendChatHistoryToWebview();
  }

  private async _selectSession(sessionId: string): Promise<void> {
    const sessions = this._getChatSessions();
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      await this._saveActiveSessionId(sessionId);
      this._sendChatSessionsToWebview();
      this._sendChatHistoryToWebview();
    }
  }

  private async _deleteSession(sessionId: string): Promise<void> {
    let sessions = this._getChatSessions();
    const activeId = this._getActiveSessionId();

    sessions = sessions.filter(s => s.id !== sessionId);
    await this._saveChatSessions(sessions);

    if (activeId === sessionId) {
      if (sessions.length > 0) {
        await this._saveActiveSessionId(sessions[0].id);
      } else {
        await this._saveActiveSessionId('');
        await this._ensureDefaultSession();
      }
    } else {
      await this._ensureDefaultSession();
    }

    this._sendChatSessionsToWebview();
    this._sendChatHistoryToWebview();
  }

  private _getChatSessions(): ChatSession[] {
    return this._context.workspaceState.get<ChatSession[]>('mirror-vs.chatSessions', []);
  }

  private async _saveChatSessions(sessions: ChatSession[]): Promise<void> {
    await this._context.workspaceState.update('mirror-vs.chatSessions', sessions);
  }

  private _getActiveSessionId(): string | undefined {
    return this._context.workspaceState.get<string>('mirror-vs.activeSessionId');
  }

  private async _saveActiveSessionId(id: string): Promise<void> {
    await this._context.workspaceState.update('mirror-vs.activeSessionId', id);
  }

  private _sendChatSessionsToWebview(): void {
    if (!this._view) {
      return;
    }
    const sessions = this._getChatSessions();
    const activeSessionId = this._getActiveSessionId() || '';
    this._view.webview.postMessage({
      type: 'updateChatSessions',
      sessions,
      activeSessionId,
    });
  }
}

function parsePatchBlocks(content: string): { search: string; replace: string }[] {
  const blocks: { search: string; replace: string }[] = [];
  const regex = /<<<<<<< SEARCH[\r\n]+([\s\S]*?)[\r\n]+=======[\r\n]+([\s\S]*?)[\r\n]+>>>>>>> REPLACE/gi;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const search = match[1].replace(/\r\n/g, '\n');
    const replace = match[2].replace(/\r\n/g, '\n');
    blocks.push({ search, replace });
  }
  return blocks;
}

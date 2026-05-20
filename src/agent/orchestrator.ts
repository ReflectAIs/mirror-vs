import * as vscode from 'vscode';
import { LLMProvider, ChatMessage } from '../types';
import { ToolCall } from './types';
import { executeTool } from './tools/tool-registry';
import { fetchOllamaModels, streamOllamaChat, streamDeepSeekChat } from '../services/api-service';

const AGENT_SYSTEM_PROMPT_TEMPLATE = `You are Mirror VS, a highly capable, autonomous AI coding assistant integrated directly into the developer's Visual Studio Code IDE.

Your primary mission is to help the developer implement features, refactor code, find bugs, and manage files automatically with minimum friction.

To accomplish these tasks, you have access to a set of special workspace tools that you can invoke using XML-like tags. When you use one of these tags in your response, the execution host will automatically intercept it, run the requested tool, and feed the exact result back to you in a subsequent "system" role message. You will then continue your work using those results in a multi-turn autonomous loop.

### IMPORTANT TOOL USAGE RULES:
1. Always output valid XML tags. All parameters (like path and query) MUST be enclosed in double quotes.
2. Self-closing tags MUST end with " />".
3. When creating or writing files, always provide the COMPLETE, FULL file content. Do NOT use ellipsis, comments like "// rest of code", or placeholders/stubs, because the file will be written exactly as you provide it. When using patch_file, always make sure the SEARCH blocks match the target file content exactly, and provide complete and functional changes in the REPLACE blocks.
4. CRITICAL: You MUST call ONLY ONE tool per response turn. After outputting a tool tag, immediately STOP GENERATING. Do not hallucinate the tool result. The system will execute the tool and provide the result to you in the next turn.
5. In every turn, if a tool result indicates a failure, read the error message carefully and correct your input in the next turn.
6. NEVER say "let me check", "I will verify", "let me look", or any similar phrase WITHOUT immediately outputting a tool tag in the same response. If you intend to check something, DO IT NOW by outputting the appropriate tool tag. Stating an intention without a tool tag is FORBIDDEN and will cause the agent loop to terminate prematurely.
6b. NEVER output bare shell prompts (dollar-sign, PS>, >) or describe a command in code without using a proper tool tag. If you want to run a command, use <run_command command="..." /> — nothing else.
7. BACKGROUND COMMANDS: If a run_command result says a command is "running in the background", you MUST immediately verify its side effects in the next turn using a tool:
   - After a dev server starts → verify: <browser_navigate url="http://localhost:PORT" />
   - After npm install → verify: <list_dir path="node_modules" />
   - After a build → verify: <list_dir path="dist" />
   Never assume a background command succeeded. Always verify.
8. SHELL ENVIRONMENT: {{SHELL_ENV}}
9. Keep explanations minimal. Prefer action over narration. Do the work, don't describe it.

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
<browser_navigate url="http://localhost:5173" />
Host (System): "Navigated to http://localhost:5173. Page Title: \"Todo App\". Interactive Elements: - input#todo-input [type=\"text\"] [placeholder=\"Enter a task...\"] ..."
Your Turn 4: "App is loading correctly. Taking a screenshot to confirm visual state."
<browser_screenshot />

Remember: Every intention to check, verify, or investigate MUST be followed immediately by a tool tag in the same response turn. Outputting text without a tool tag ends your turn and stops the agent loop.
If a tool returns an error, correct your approach in the next turn — do NOT give up or summarize failure. Always try an alternative.`;

function getShellEnvDescription(): string {
  if (process.platform === 'win32') {
    return 'This is a WINDOWS machine running PowerShell. ' +
      'Do NOT use && to chain commands — use semicolons (;) or separate tool calls instead. ' +
      'Do NOT use Unix-only commands (grep, head, tail, ls) — use dir, findstr, Get-Content, or the file read/list tools. ' +
      'To verify a server is up, use browser_navigate rather than curl -w.';
  }
  return 'This is a macOS/Linux machine running bash/zsh. ' +
    'Standard Unix commands (ls, grep, head, curl, etc.) are available. ' +
    'You may chain commands with &&.';
}

export function buildSystemPrompt(): string {
  return AGENT_SYSTEM_PROMPT_TEMPLATE.replace('{{SHELL_ENV}}', getShellEnvDescription());
}

export class AgentOrchestrator {
  private _activeAbortController?: AbortController;

  constructor(
    private readonly _getSecret: (key: string) => Promise<string | undefined>,
    private readonly _getChatHistory: () => ChatMessage[],
    private readonly _saveChatHistory: (history: ChatMessage[]) => Promise<void>,
    private readonly _postMessage: (msg: any) => void,
    private readonly _getSafePath: (targetPath: string) => string
  ) { }

  public cancelActiveStream() {
    if (this._activeAbortController) {
      this._activeAbortController.abort();
      this._activeAbortController = undefined;
    }
  }

  public async handleMessageStream(text: string, history: ChatMessage[]) {
    this.cancelActiveStream();
    this._activeAbortController = new AbortController();
    const signal = this._activeAbortController.signal;

    // Retrieve configurations
    const config = vscode.workspace.getConfiguration('mirror-vs');
    const provider = config.get<LLMProvider>('defaultProvider', 'ollama');
    const ollamaHost = config.get<string>('ollamaHost', 'http://localhost:11434');
    const defaultOllamaModel = config.get<string>('defaultOllamaModel', 'llama3');
    const defaultDeepSeekModel = config.get<string>('defaultDeepSeekModel', 'deepseek-chat');

    let apiKey = '';
    if (provider === 'deepseek') {
      apiKey = await this._getSecret('deepseek_api_key') || '';
      if (!apiKey) {
        this._postMessage({
          type: 'chatResponseError',
          error: 'DeepSeek API Key is missing. Please add your key in the settings drawer.'
        });
        return;
      }
    }

    let currentMessages = [...history];

    if (text) {
      // User message + context
      currentMessages.push({ role: 'user', content: text });
      await this._saveChatHistory(currentMessages);
    }

    let loopCount = 0;
    const maxLoops = 50;
    let continueLoop = true;

    try {
      while (continueLoop && loopCount < maxLoops) {
        loopCount++;
        continueLoop = false;

        const payload: { role: 'user' | 'assistant' | 'system'; content: string; images?: string[] }[] = [
          { role: 'system' as const, content: buildSystemPrompt() },
          ...currentMessages.map(msg => {
            const role = msg.role === 'system' ? 'user' : msg.role;
            return {
              role: role as 'user' | 'assistant' | 'system',
              content: msg.content,
              images: msg.images
            };
          })
        ];

        this._postMessage({ type: 'chatResponseStart' });

        const completionController = new AbortController();
        const mainAbortListener = () => completionController.abort();
        signal.addEventListener('abort', mainAbortListener);

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

        currentMessages.push({ role: 'assistant', content: assistantResponse });
        await this._saveChatHistory(currentMessages);

        const toolCalls = this._parseToolCalls(assistantResponse);

        if (toolCalls.length > 0) {
          const toolResults: string[] = [];

          for (const tool of toolCalls) {
            const target = tool.path || tool.query || tool.url || tool.selector || tool.command || '';
            this._sendToolStatusToWebview(tool.name, 'running', target);

            try {
              const result = await executeTool(tool, this._getSafePath);

              let checkpointId: string | undefined;
              const cpMatch = result.match(/Revert ID: (\w+)/);
              if (cpMatch) {
                checkpointId = cpMatch[1];
              }

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
              // IMPORTANT: Push error as a result so the LLM can self-correct in the next turn
              // Do NOT throw — throwing would abort the entire loop and leave the user with a frozen UI
              toolResults.push(`[Tool Result for ${tool.name} on "${target}"]: Error - ${err.message}. Please correct your approach and try again.`);
            }
          }

          const images: string[] = [];
          const cleanedToolResults = toolResults.map(res => {
            const match = res.match(/\(Base64 data hidden from output but sent to vision model: (.*)\)/);
            if (match) {
              const base64 = match[1];
              images.push(base64);
              // Post the screenshot to the webview chat for inline display
              this._postMessage({ type: 'screenshotCapture', base64 });
              return res.replace(match[0], '(Image successfully captured and sent to vision model)');
            }
            return res;
          });

          const combinedToolResult = cleanedToolResults.join('\n\n');
          const systemMessage: ChatMessage = { role: 'system', content: combinedToolResult };
          if (images.length > 0) {
            systemMessage.images = images;
          }
          currentMessages.push(systemMessage);
          await this._saveChatHistory(currentMessages);

          continueLoop = true;
        }
      }

      this._postMessage({ type: 'loopComplete' });

    } catch (err: any) {
      if (signal.aborted) {
        console.log('Agent stream aborted.');
      } else {
        this._postMessage({ type: 'chatResponseError', error: err.message });
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
            this._postMessage({ type: 'chatResponseChunk', text: chunk });

            if (this.hasCompleteToolCall(fullText)) {
              completionController?.abort();
              const cleaned = this.getCleanedToolResponse(fullText);
              this._postMessage({ type: 'chatResponseComplete', fullText: cleaned });
              resolve(cleaned);
            }
          },
          (completedText) => {
            const cleaned = this.getCleanedToolResponse(completedText);
            this._postMessage({ type: 'chatResponseComplete', fullText: cleaned });
            resolve(cleaned);
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
            this._postMessage({ type: 'chatResponseChunk', text: chunk });

            if (this.hasCompleteToolCall(fullText)) {
              completionController?.abort();
              const cleaned = this.getCleanedToolResponse(fullText);
              this._postMessage({ type: 'chatResponseComplete', fullText: cleaned });
              resolve(cleaned);
            }
          },
          (completedText) => {
            const cleaned = this.getCleanedToolResponse(completedText);
            this._postMessage({ type: 'chatResponseComplete', fullText: cleaned });
            resolve(cleaned);
          },
          (err) => {
            reject(err);
          }
        );
      }
    });
  }

  private _parseToolCalls(text: string): ToolCall[] {
    /**
     * Parse a named attribute value, handling inner quotes correctly.
     * Tries double-quoted first, then single-quoted.
     */
    const attr = (attrs: string, name: string): string | null => {
      const dq = new RegExp(`${name}\\s*=\\s*"([^"]+)"`, 'i').exec(attrs);
      if (dq) { return dq[1]; }
      const sq = new RegExp(`${name}\\s*=\\s*'([^']+)'`, 'i').exec(attrs);
      if (sq) { return sq[1]; }
      return null;
    };

    /**
     * Enforce one tool per turn: collect ALL candidate tool calls with their
     * position in the response text, then return only the earliest one.
     * This prevents the model from firing multiple tools if it ignores rule #4.
     */
    const candidates: { index: number; tool: ToolCall }[] = [];
    let match;

    // read_file
    const readFileRegex = /<read_file([\s\S]*?)\/?>/gi;
    while ((match = readFileRegex.exec(text)) !== null) {
      const p = attr(match[1], 'path');
      if (p) { candidates.push({ index: match.index, tool: { name: 'read_file', path: p.trim() } }); }
    }

    // list_dir
    const listDirRegex = /<list_dir([\s\S]*?)\/?>/gi;
    while ((match = listDirRegex.exec(text)) !== null) {
      const p = attr(match[1], 'path');
      if (p) { candidates.push({ index: match.index, tool: { name: 'list_dir', path: p.trim() } }); }
    }

    // grep_search
    const grepSearchRegex = /<grep_search([\s\S]*?)\/?>/gi;
    while ((match = grepSearchRegex.exec(text)) !== null) {
      const q = attr(match[1], 'query');
      if (q) { candidates.push({ index: match.index, tool: { name: 'grep_search', query: q } }); }
    }

    // write_file
    const writeFileRegex = /<write_file([\s\S]*?)>([\s\S]*?)<\/write_file\s*>/gi;
    while ((match = writeFileRegex.exec(text)) !== null) {
      const p = attr(match[1], 'path');
      if (p) { candidates.push({ index: match.index, tool: { name: 'write_file', path: p.trim(), content: match[2] } }); }
    }

    // create_file
    const createFileRegex = /<create_file([\s\S]*?)>([\s\S]*?)<\/create_file\s*>/gi;
    while ((match = createFileRegex.exec(text)) !== null) {
      const p = attr(match[1], 'path');
      if (p) { candidates.push({ index: match.index, tool: { name: 'create_file', path: p.trim(), content: match[2] } }); }
    }

    // patch_file
    const patchFileRegex = /<patch_file([\s\S]*?)>([\s\S]*?)<\/patch_file\s*>/gi;
    while ((match = patchFileRegex.exec(text)) !== null) {
      const p = attr(match[1], 'path');
      if (p) { candidates.push({ index: match.index, tool: { name: 'patch_file', path: p.trim(), content: match[2] } }); }
    }

    // browser_navigate
    const browserNavRegex = /<browser_navigate([\s\S]*?)\/?>/gi;
    while ((match = browserNavRegex.exec(text)) !== null) {
      const u = attr(match[1], 'url');
      if (u) { candidates.push({ index: match.index, tool: { name: 'browser_navigate', url: u } }); }
    }

    // browser_click
    const browserClickRegex = /<browser_click([\s\S]*?)\/?>/gi;
    while ((match = browserClickRegex.exec(text)) !== null) {
      const s = attr(match[1], 'selector');
      if (s) { candidates.push({ index: match.index, tool: { name: 'browser_click', selector: s } }); }
    }

    // browser_type
    const browserTypeRegex = /<browser_type([\s\S]*?)\/?>/gi;
    while ((match = browserTypeRegex.exec(text)) !== null) {
      const s = attr(match[1], 'selector');
      const t = attr(match[1], 'text');
      if (s && t) { candidates.push({ index: match.index, tool: { name: 'browser_type', selector: s, text: t } }); }
    }

    // browser_screenshot
    const browserScreenshotRegex = /<browser_screenshot[\s\S]*?\/?>/gi;
    while ((match = browserScreenshotRegex.exec(text)) !== null) {
      candidates.push({ index: match.index, tool: { name: 'browser_screenshot' } });
    }

    // run_command
    const runCommandRegex = /<run_command([\s\S]*?)\/?>/gi;
    while ((match = runCommandRegex.exec(text)) !== null) {
      const c = attr(match[1], 'command');
      if (c) { candidates.push({ index: match.index, tool: { name: 'run_command', command: c } }); }
    }

    if (candidates.length === 0) { return []; }

    // Sort by position and return ONLY the first tool call found in the text.
    // This enforces the one-tool-per-turn rule at the parsing level.
    candidates.sort((a, b) => a.index - b.index);
    return [candidates[0].tool];
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
    this._postMessage({
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

  private getCleanedToolResponse(text: string): string {
    const selfClosingTools = ['read_file', 'list_dir', 'grep_search', 'browser_navigate', 'browser_click', 'browser_type', 'browser_screenshot', 'run_command'];
    let earliestEnd = -1;

    for (const tool of selfClosingTools) {
      const regex = new RegExp(`<${tool}[^>]*>`, 'i');
      const m = regex.exec(text);
      if (m) {
        const endIdx = m.index + m[0].length;
        if (earliestEnd === -1 || endIdx < earliestEnd) {
          earliestEnd = endIdx;
        }
      }
    }

    const blockTools = ['create_file', 'write_file', 'patch_file'];
    for (const tool of blockTools) {
      const regex = new RegExp(`</${tool}\\s*>`, 'i');
      const m = regex.exec(text);
      if (m) {
        const endIdx = m.index + m[0].length;
        if (earliestEnd === -1 || endIdx < earliestEnd) {
          earliestEnd = endIdx;
        }
      }
    }

    if (earliestEnd !== -1) {
      return text.substring(0, earliestEnd);
    }
    return text;
  }
}

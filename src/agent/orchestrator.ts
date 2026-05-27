import * as vscode from "vscode";
import { ChatMessage, LLMProvider } from "../types";
import { executeTool } from "./tools/tool-registry";
import { CommandService } from "../services/command-service";
import { RateLimiter } from "../services/rate-limiter";
import { ProviderFallback } from "../services/provider-fallback";
import { AgentSession } from "./agent-session";
import { AgentParser } from "./agent-parser";
import { AgentCompleter } from "./agent-completer";
import { execFileSync } from "child_process";
import * as fs from "fs";

const AGENT_SYSTEM_PROMPT_TEMPLATE = `You are Mirror VS, a highly capable, autonomous AI coding assistant integrated directly into the developer's Visual Studio Code IDE.

Your primary mission is to help the developer implement features, refactor code, find bugs, and manage files automatically with minimum friction.

To accomplish these tasks, you have access to a set of special workspace tools that you can invoke using XML-like tags. When you use one of these tags in your response, the execution host will automatically intercept it, run the requested tool, and feed the exact result back to you in a subsequent "system" role message. You will then continue your work using those results in a multi-turn autonomous loop.

### SYSTEMATIC PLAN-EXECUTE-MEMORY CYCLE RULES:
1. **Context First (CRITICAL)**: Always read and trust the provided CONSOLIDATED CONTEXT SUMMARY. Do not re-explore the codebase to verify the summary. Begin your execution exactly at the 'Next steps' outlined in the context.
2. **Internal Chain of Thought & Planning**: Prioritize immediate user requests over maintaining secondary context files. **Do NOT physically write or edit a \`.mirror-vs/plan.md\` or \`.mirror-vs/memory.md\` file using tool calls (like create_file or write_file) unless explicitly requested by the user.** Instead, maintain your active task checklist and plan your steps internally in your response using a standard text explanation or a \`<thinking>\` block. This avoids wasting API calls, burning tokens, and frustrating the user with distracting administrative loops.
3. **Git Workspace Access & Safety Guards**:
   - You have **full access** to git diagnostics and modifications (e.g., \`git status\`, \`git diff\`, \`git log\`, \`git add\`, \`git commit\`) to easily monitor changes in the codebase.
   - **CRITICAL**: Remote operations via \`git push\` or altering remote urls via \`git remote\` are strictly blocked by the tool execution host for safety. Never attempt to push.

### IMPORTANT TOOL USAGE RULES:
1. Always output valid XML tags. All parameters (like path and query) MUST be enclosed in double quotes.
2. Self-closing tags MUST end with " />".
3. DO NOT use write_file to modify existing files. You MUST use patch_file for all edits/modifications to existing files, regardless of size. Only use create_file when creating a completely new file for the first time. **Never use patch_file without first using read_file to capture the exact string you intend to replace. Your SEARCH block must be an exact, 1:1 character-for-character match.** When using patch_file, always make sure the SEARCH blocks match the target file content exactly (including exact indentation and whitespace), and provide complete and functional changes in the REPLACE blocks. If a patch fails, carefully read the error message, read the file again to capture the exact code, correct your search content, and try again.
3b. **CRITICAL: Truncation Guardrail for Huge Files**:
   - Files or results that are too long will be truncated with a "... [TRUNCATED CHARACTERS TO PREVENT CONTEXT HANGS / API LIMITS] ..." message.
   - To prevent truncation, **NEVER read more than 500 lines of a file in a single tool call**.
   - However, **do not read files in tiny overlapping chunks**. If a file is under 500 lines, read the **entire** file in a single tool call to get complete context immediately and stop hyper-paginated file reading loops.
   - If the file is larger than 500 lines, target specific function names or areas using grep before reading, and read only the relevant non-overlapping ranges.
3c. **CONSOLIDATE FILE READS**:
   - Always read the entire file if it is under 500 lines, rather than reading in small overlapping chunks.
   - If the file is larger, target specific function names or areas using grep before reading chunks blind.
4. CRITICAL: You MUST call ONLY ONE tool per response turn. After outputting a tool tag, immediately STOP GENERATING. Do not hallucinate the tool result.
5. In every turn, if a tool result indicates a failure, read the error message carefully and correct your input in the next turn.
6. NEVER say "let me check", "I will verify", "let me look" WITHOUT immediately outputting a tool tag.
6b. NEVER output bare shell prompts or describe a command in code without using a proper tool tag.
7. BACKGROUND COMMANDS: If a run_command result says a command is "running in the background", you MUST immediately verify its side effects.
8. SHELL ENVIRONMENT: {{SHELL_ENV}}
9. Keep explanations minimal. Prefer action over narration. Do the work, don't describe it.
10. **SEARCH STRATEGY**: When searching for error messages or user-provided strings, use short, broad, case-insensitive keyword searches (e.g., "Recipe" or "Link") rather than long, exact phrases that may contain typos to avoid search failures.
11. **PRIORITIZE USER INTENT**: Never run exploratory codebase analyses (such as analyze_project, analyze_complexity, analyze_dead_code) unless the user has explicitly requested it. Always prioritize immediate user requests and direct execution over administrative maintenance.

### AVAILABLE TOOLS:

1. READ FILE:
   Usage: read_file path="relative/path/to/file.ts" />
   Always read the entire file in a single tool call if it is under 500 lines to prevent hyper-paginated reading loops. For files larger than 500 lines, target specific functions or areas using grep, or read specific, non-overlapping line ranges.
2. CREATE FILE:
   Usage: create_file path="relative/path/to/new_file.ts">content here/create_file>
3. WRITE FILE:
   Usage: write_file path="relative/path/to/existing_file.ts">content here/write_file>
4. PATCH FILE:
   Never use patch_file without first using read_file to capture the exact string you intend to replace. Your SEARCH block must be an exact, 1:1 character-for-character match.
   Usage: patch_file path="relative/path/to/existing_file.ts">
<<<<<<< SEARCH
[exact original lines to find in file]
=======
[new replacement lines]
>>>>>>> REPLACE
/patch_file>
5. LIST DIRECTORY: Usage: list_dir path="relative/path/to/directory" />
6. GREP SEARCH: Usage: grep_search query="pattern" />
   When searching for error messages or user-provided strings, use short, broad, case-insensitive keyword searches (e.g., "Recipe" or "Link") rather than long, exact phrases that may contain typos to avoid search failures.
7. WEB SEARCH: Usage: web_search query="pattern" />
8. BROWSER NAVIGATE: Usage: browser_navigate url="http://localhost:3000" />
9. BROWSER CLICK: Usage: browser_click selector="#my-button" />
10. BROWSER TYPE: Usage: browser_type selector="#search-input" text="hello world" />
11. BROWSER EVALUATE SCRIPT: Usage: browser_evaluate_script script="..." />
 12. CODEBASE ANALYSIS:
     Usage: analyze_project />
     Provides a comprehensive project overview (files, lines, framework, package manager, top files).
     Usage: analyze_dependencies />
     Analyzes the import dependency graph, finds circular dependencies, and identifies core modules.
     Usage: analyze_complexity />
     Measures cyclomatic complexity of all functions, highlights hotspots (complexity > 10 or lines > 50).
     Usage: analyze_coverage />
     Maps test files to source files and identifies untested source files by name convention.
     Usage: analyze_dead_code />
     Scans all exports and detects potentially unused code by checking import references.
     Usage: analyze_impact path="src/components/Button.tsx" />
     Shows what a file imports and what depends on it, with risk assessment.
     Usage: graphify />
     Generates a beautiful directory structure tree and a module import dependency map (Mermaid graph) showing clearly where all files are in the project and how they relate.
 13. WAIT: Usage: wait ms="3000" />
     Use wait to pause execution for a specified number of milliseconds before continuing.
 14. BROWSER SCREENSHOT: Usage: browser_screenshot />
      There is an automatic 3-second delay before capture for page rendering.
      The screenshot is saved as .mirror-vs/screenshots/screenshot_TIMESTAMP.png and the
      image content is sent to the vision model so you can see the page visually.

      **SCREENSHOT WORKFLOW (ONE AT A TIME):**
        1. Navigate: browser_navigate url="PAGE_URL" />
        2. Wait: wait ms="3000" />
        3. Screenshot: browser_screenshot />
        4. Vision result shows you the page. RENAME the file descriptively:
           run_command command="Rename-Item '.mirror-vs/screenshots/screenshot_TIMESTAMP.png' 'manufacturer_login_page.png'" />
        5. Immediately UPDATE your report.md:
           patch_file path=".mirror-vs/screenshots/report.md">[SEARCH/REPLACE content]/patch_file>
        6. REPEAT steps 1-5 for each page. NEVER batch screenshots.

      **CLEANUP RULE**: Before starting a new documentation task, run:
        run_command command="Remove-Item '.mirror-vs/screenshots/*.png' -Force" />
      to delete old screenshots so you start fresh.

      If restarting a partially-failed task, first run:
        list_dir path=".mirror-vs/screenshots" />
      to see existing screenshots, then reference them directly in report.md.
 15. RUN COMMAND: Usage: run_command command="npm install" />
 16. SEND TERMINAL INPUT: Usage: send_terminal_input terminal_name="...">Ctrl+C/send_terminal_input>
 17. CLOSE TERMINAL: Usage: close_terminal terminal_name="..." />
 18. READ TERMINAL: Usage: read_terminal terminal_name="..." />
 19. LIST TERMINALS: Usage: list_terminals />
 20. FIGMA INSPECT: Usage: figma_inspect url="..." />
`;

function getShellEnvDescription(): string {
  if (process.platform === "win32") {
    return "This is a WINDOWS machine running PowerShell.";
  }
  return "This is a macOS/Linux machine running bash/zsh.";
}

function hasActionPlanningIntent(text: string): boolean {
  const lower = text.toLowerCase();
  const patterns = [
    /\bi'll start by\b/,
    /\bi will start by\b/,
    /\blet's start by\b/,
    /\blet me start by\b/,
    /\bfirst, i will\b/,
    /\bfirst, let's\b/,
    /\bfirst, let me\b/,
    /\bfirst, i need to\b/,
    /\bi will need to\b/,
    /\bi'll need to\b/,
    /\bi need to\b/,
    /\bi'm going to\b/,
    /\bi will analyze\b/,
    /\bi'll analyze\b/,
    /\bi will search\b/,
    /\bi'll search\b/,
    /\bi will read\b/,
    /\bi'll read\b/,
    /\bi will run\b/,
    /\bi'll run\b/,
    /\bi will check\b/,
    /\bi'll check\b/
  ];
  return patterns.some(p => p.test(lower));
}

export function buildSystemPrompt(): string {
  const service = CommandService.getInstance();
  const terminals = service.getActiveTerminals();
  let terminalContext = "";
  if (terminals.length > 0) {
    terminalContext = "\n\n### ACTIVE RUNNING TERMINALS:\n" + terminals.map(t => "- \"" + t.name + "\" " + (t.running ? "RUNNING" : "EXITED")).join("\n");
  } else {
    terminalContext = "\n\n### ACTIVE RUNNING TERMINALS:\nNone";
  }

  // List all workspace folders so the model has full multi-root awareness
  let workspaceContext = "";
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    workspaceContext = "\n\n### OPEN WORKSPACE FOLDERS:\n" +
      folders.map((f, i) => `  ${i}. \`${f.uri.fsPath}\` (name: "${f.name}")`).join("\n") +
      "\n\n**Multi-Root Workspace File Rules:**\n" +
      "  - All file-related tools (read_file, create_file, write_file, patch_file, list_dir) accept **relative** or **absolute** paths.\n" +
      "  - **Absolute paths** (e.g., `C:\\Users\\me\\project\\file.ts` on Windows or `/home/user/project/file.ts` on Mac/Linux) are allowed and will be resolved against the matching workspace folder.\n" +
      "  - **Relative paths** (e.g., `src/file.ts`) are resolved against the **primary** workspace folder (index 0).\n" +
      "  - To create/write files in a non-primary folder, always use the **full absolute path** to that folder.";
  } else {
    workspaceContext = "\n\n### OPEN WORKSPACE FOLDERS:\nNone";
  }

  return AGENT_SYSTEM_PROMPT_TEMPLATE.replace("{{SHELL_ENV}}", getShellEnvDescription()) + terminalContext + workspaceContext;
}

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
    this._session = new AgentSession(
      _getSecret,
      _getChatHistory,
      _saveChatHistory,
      _postMessage,
      _getSafePath,
    );
    this._completer = new AgentCompleter(
      _postMessage,
    );
  }

  public cancelActiveStream() {
    if (this._activeAbortController) {
      this._activeAbortController.abort();
      this._activeAbortController = undefined;
    }
  }

  private _gitExec(args: string[], workspaceFolder: string): string {
    try { return execFileSync("git", args, { cwd: workspaceFolder, encoding: "utf8", stdio: "pipe" }); }
    catch { return ""; }
  }

  private async _ensureGitBaseline(): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) return;
    const isRepo = this._gitExec(["rev-parse", "--is-inside-work-tree"], workspaceFolder).trim() === "true";
    if (!isRepo) this._gitExec(["init"], workspaceFolder);
    const gitignorePath = workspaceFolder + "/.gitignore";
    let gitignoreContent = "";
    try { gitignoreContent = fs.readFileSync(gitignorePath, "utf8"); } catch { /* ignore */ }
    const patterns = ["node_modules/", ".mirror-vs/", "turns.log"];
    const missing = patterns.filter(p => !gitignoreContent.includes(p));
    if (missing.length > 0) {
      fs.writeFileSync(gitignorePath, gitignoreContent.trimEnd() + "\n" + missing.join("\n") + "\n", "utf8");
      this._gitExec(["add", ".gitignore"], workspaceFolder);
    }
    const dirty = this._gitExec(["status", "--porcelain"], workspaceFolder).trim();
    if (dirty) {
      this._gitExec(["add", "-A"], workspaceFolder);
      this._gitExec(["commit", "-m", "Mirror VS: baseline snapshot before agent task"], workspaceFolder);
    } else {
      const hasCommit = this._gitExec(["log", "--oneline", "-1"], workspaceFolder).trim();
      if (!hasCommit) {
        this._gitExec(["add", "-A"], workspaceFolder);
        this._gitExec(["commit", "-m", "Mirror VS: initial baseline"], workspaceFolder);
      }
    }
  }

  private _sendAvatarState(state: "idle" | "thinking" | "coding" | "tool_calling" | "error") {
    this._postMessage({ type: "avatarState", state });
  }

  private _sendToolStatusToWebview(
    toolName: string,
    status: "running" | "success" | "error",
    target: string,
    result?: string,
    checkpointId?: string,
    code?: string,
    terminalName?: string,
  ) {
    this._postMessage({
      type: "toolStatus",
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
      this._sendAvatarState("thinking");

      const config = vscode.workspace.getConfiguration("mirror-vs");
      let provider = config.get<string>("defaultProvider", "ollama") as string;
      const ollamaHost = config.get<string>("ollamaHost", "http://localhost:11434") as string;
      const defaultOllamaModel = config.get<string>("defaultOllamaModel", "llama3") as string;
      const defaultDeepSeekModel = config.get<string>("defaultDeepSeekModel", "deepseek-chat") as string;
      this._session.sessionId = "session_" + Date.now();

    // Rate limiter: image budget
    if (images && images.length > 0) {
      const imageCheck = this._rateLimiter.checkImageBudget(images.length);
      if (!imageCheck.allowed) {
        this._postMessage({ type: "chatResponseError", error: imageCheck.reason });
        return;
      }
    }

    // Circuit breaker
    const circuitCheck = this._rateLimiter.checkCircuitBreaker();
    if (!circuitCheck.allowed) {
      this._postMessage({ type: "chatResponseError", error: circuitCheck.reason });
      return;
    }

    this._fallback.reset(provider as LLMProvider);

    let apiKey = "";
    const tryGetApiKey = async (p: string): Promise<string> => {
      if (p === "deepseek") {
        const key = (await this._getSecret("deepseek_api_key")) || "";
        return key;
      }
      return "";
    };
    apiKey = await tryGetApiKey(provider);

    if (provider === "deepseek" && !apiKey) {
      this._postMessage({ type: "chatResponseError", error: "DeepSeek API Key is missing." });
      return;
    }

    const estimatedInputTokens = RateLimiter.estimateTokens(text || "") +
      (images || []).reduce((sum, img) => sum + Math.ceil(img.length / 1000), 0);
    const sessionCheck = this._rateLimiter.checkSessionBudget(this._session.sessionId, estimatedInputTokens);
    if (!sessionCheck.allowed) {
      this._postMessage({ type: "chatResponseError", error: sessionCheck.reason });
      return;
    }

    let currentMessages = [...history];

    if (text || (images && images.length > 0)) {
      const userMsg: ChatMessage = { role: "user", content: text || "[Image provided]" };
      if (images && images.length > 0) userMsg.images = images;
      currentMessages.push(userMsg);
      await this._saveChatHistory(currentMessages);
    }

    await this._ensureGitBaseline();

    let loopCount = 0;
    const maxLoops = 50;
    let continueLoop = true;
    let consecutiveMalformedCount = 0;
    const maxMalformedRetries = 3;

    try {
      while (continueLoop && loopCount < maxLoops) {
        if (signal.aborted) {
          continueLoop = false;
          break;
        }
        loopCount++;

        // Context optimization guardrail (moved inside loop to fix context inflation loophole)
        const maxTurns = config.get("maxTurnsBeforeSummarize", 16);
        const turnsToRetain = config.get("turnsToRetain", 6);
        const activeMessages = currentMessages.filter((msg, idx) => {
          if (idx === 0) return false;
          if (msg.role === "system" && msg.content.includes("[CONSOLIDATED CONTEXT SUMMARY]")) return false;
          return !msg.summarized;
        });

        if (activeMessages.length > maxTurns) {
          try {
            const toSummarize = activeMessages.slice(0, activeMessages.length - turnsToRetain);
            const existingSummaries = currentMessages.filter(
              (msg) => msg.role === "system" && msg.content.includes("[CONSOLIDATED CONTEXT SUMMARY]"),
            );
            this._postMessage({ type: "chatResponseStart" });
            this._postMessage({
              type: "chatResponseChunk",
              text: "Compressing middle turns to optimize speed...",
            });
            const summary = await this._completer.summarizeHistory(
              provider as LLMProvider,
              ollamaHost,
              provider === "ollama" ? defaultOllamaModel : defaultDeepSeekModel,
              apiKey,
              [...existingSummaries, ...toSummarize],
            );
            const summaryMsg: ChatMessage = { role: "system", content: "[CONSOLIDATED CONTEXT SUMMARY]\n" + summary };
            const cleaned = currentMessages.filter(
              (msg) => !(msg.role === "system" && msg.content.includes("[CONSOLIDATED CONTEXT SUMMARY]")),
            );
            toSummarize.forEach((msg) => {
              const found = cleaned.find((m) => m === msg);
              if (found) {
                found.summarized = true;
                if (found.content.length > 2000) {
                  found.content = found.content.substring(0, 1000) + " [CONTENT REMOVED AFTER CONTEXT CONSOLIDATION] " + found.content.substring(found.content.length - 1000);
                }
                if (found.images) found.images = [];
              }
            });
            currentMessages = [cleaned[0], summaryMsg, ...cleaned.slice(1)];
            await this._saveChatHistory(currentMessages);
            this._postMessage({ type: "updateChatHistory", history: currentMessages });
            this._postMessage({ type: "chatResponseComplete", fullText: "Context optimized." });
          } catch (e: unknown) {
            console.warn("Failed to summarize history:", e instanceof Error ? e.message : String(e));
          }
        }
        continueLoop = false;

        const payload: ChatMessage[] = [
          { role: "system", content: buildSystemPrompt() },
          ...currentMessages
            .filter((msg) => !msg.summarized)
            .map((msg) => ({
              role: (msg.role === "system" ? "user" : msg.role) as "user" | "assistant" | "system",
              content: msg.content,
              images: msg.images,
            })),
        ];

        this._postMessage({ type: "chatResponseStart" });

        const completionController = new AbortController();
        const mainAbortListener = () => completionController.abort();
        signal.addEventListener("abort", mainAbortListener);

        let assistantResponse = "";
        try {
          assistantResponse = await this._completer.getLLMCompletion(
            provider as LLMProvider,
            ollamaHost,
            provider === "ollama" ? defaultOllamaModel : defaultDeepSeekModel,
            apiKey,
            payload,
            completionController.signal,
            this._session.sessionId,
            completionController,
          );
        } catch (apiErr: unknown) {
          signal.removeEventListener("abort", mainAbortListener);
          const apiErrMsg = apiErr instanceof Error ? apiErr.message : String(apiErr);
          const fb = this._fallback.failover();
          if (fb.success && fb.newProvider) {
            const nextKey = await tryGetApiKey(fb.newProvider);
            this._postMessage({
              type: "providerFallback",
              message: apiErrMsg + " " + fb.message,
              newProvider: fb.newProvider,
            });
            provider = fb.newProvider;
            apiKey = nextKey;
            loopCount--;
            continueLoop = true;
            continue;
          } else {
            throw apiErr;
          }
        }

        signal.removeEventListener("abort", mainAbortListener);

        currentMessages.push({ role: "assistant", content: assistantResponse });
        await this._saveChatHistory(currentMessages);

        const toolCalls = this._parser.parseToolCalls(assistantResponse);

        if (toolCalls.length > 0) {
          this._sendAvatarState("tool_calling");
          const toolResults: string[] = [];
          for (const tool of toolCalls) {
            if (signal.aborted) {
              continueLoop = false;
              break;
            }
            const target = tool.path || tool.query || tool.url || tool.selector || tool.command || "";
            this._sendToolStatusToWebview(tool.name, "running", target);
            try {
              const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
              const figmaKey = (await this._getSecret("figma_api_key")) || "";
              const result = await executeTool(tool, this._getSafePath, figmaKey, workspacePath);
              let checkpointId: string | undefined;
              const cpMatch = result.match(/Revert ID: (\w+)/);
              if (cpMatch) checkpointId = cpMatch[1];
              let terminalName: string | undefined;
              if (tool.name === "run_command") {
                const tnMatch = result.match(/VS Code terminal "([^"]+)"/);
                if (tnMatch) terminalName = tnMatch[1];
              }
              let displayResult = result;
              if (tool.name === "browser_screenshot") {
                const match = result.match(/\(Image successfully captured and sent to vision model\)/);
                if (match) displayResult = result.replace(match[0], "(Image captured)");
              } else if (result.length > 15000) {
                const keep = 7500;
                const truncated = result.length - 15000;
                displayResult = result.substring(0, keep) + " [TRUNCATED " + truncated + " CHARS] " + result.substring(result.length - keep);
              }
              this._sendToolStatusToWebview(tool.name, "success", target, displayResult, checkpointId, tool.content, terminalName);
              toolResults.push("[Tool Result for " + tool.name + " on \"" + target + "\"]: Success - " + result);
            } catch (err: unknown) {
              const errMsg = err instanceof Error ? err.message : String(err);
              this._sendToolStatusToWebview(tool.name, "error", target, errMsg);
              this._sendAvatarState("error");
              toolResults.push("[Tool Result for " + tool.name + " on \"" + target + "\"]: Error - " + errMsg + ". Please correct your approach and try again.");
            }
            if (signal.aborted) {
              continueLoop = false;
              break;
            }
          }

          const images: string[] = [];
          const cleanedToolResults = toolResults.map((res) => {
            const match = res.match(/\(Base64 data hidden from output but sent to vision model: (.*)\)/);
            if (match) {
              images.push(match[1]);
              this._postMessage({ type: "screenshotCapture", base64: match[1] });
              return res.replace(match[0], "(Image successfully captured and sent to vision model)");
            }
            if (res.length > 15000) {
              const prefixMatch = res.match(/^\[Tool Result for \w+ on "[^"]*"\]: (Success|Error) - /);
              const prefix = prefixMatch ? prefixMatch[0] : "";
              const content = prefix ? res.substring(prefix.length) : res;
              const keep = 7500;
              const truncated = content.length - 15000;
              return prefix + content.substring(0, keep) + " [TRUNCATED " + truncated + " CHARS] " + content.substring(content.length - keep);
            }
            return res;
          });

          const combined = cleanedToolResults.join("\n\n");
          const systemMessage: ChatMessage = { role: "system", content: combined };
          if (images.length > 0) systemMessage.images = images;
          currentMessages.push(systemMessage);
          await this._saveChatHistory(currentMessages);
          continueLoop = true;
          consecutiveMalformedCount = 0;
        } else {
          // Malformed tool tag recovery
          const allTools = [
            "read_file", "create_file", "write_file", "patch_file", "list_dir", "grep_search", "web_search",
            "browser_navigate", "browser_click", "browser_type", "browser_evaluate_script", "browser_screenshot",
            "run_command", "send_terminal_input", "close_terminal", "read_terminal", "list_terminals",
            "figma_inspect", "delete_file", "git_status", "git_diff", "git_add", "git_commit",
            "symbol_search", "rename_symbol", "rename_file", "wait",
            "analyze_project", "analyze_dependencies", "analyze_complexity", "analyze_coverage", "analyze_dead_code", "analyze_impact", "graphify"
          ];
          const stripped = this._parser.stripCodeBlocks(assistantResponse);
          // Only check partial tags if we already see what looks like a tool attempt
          const ltChar = String.fromCharCode(60);
          const hasToolAttempt = stripped.includes(ltChar + "read_file") || allTools.some(t => stripped.includes(ltChar + t));
          if (hasToolAttempt && consecutiveMalformedCount < maxMalformedRetries) {
            consecutiveMalformedCount++;
            const errorMsg = "[Tool Parsing Error]: Your tool call was malformed or incomplete (attempt " + consecutiveMalformedCount + "/" + maxMalformedRetries + "). Please retry with correct XML syntax.";
            currentMessages.push({ role: "system", content: errorMsg });
            await this._saveChatHistory(currentMessages);
            continueLoop = true;
          } else if (loopCount === 1 && hasActionPlanningIntent(assistantResponse)) {
            // Conversational nudge: if the model gave a conversational greeting in its very first turn without calling any tools,
            // but explicitly indicated that it plans to perform actions, we nudge it to execute a tool to keep the autonomous flow alive.
            const nudgeMsg = "[System Notice]: You did not invoke any tool tags in your response. If you need to search, read/write files, run commands, or analyze the workspace to fulfill the user's request, please output a valid tool tag now to continue autonomously.";
            currentMessages.push({ role: "system", content: nudgeMsg });
            await this._saveChatHistory(currentMessages);
            continueLoop = true;
          }
        }
      }
      this._sendAvatarState("idle");
      this._postMessage({ type: "updateChatHistory", history: currentMessages });
      this._postMessage({ type: "loopComplete" });
    } catch (err: unknown) {
      if (signal.aborted) {
        console.log("Agent stream aborted.");
        this._sendAvatarState("idle");
        this._postMessage({ type: "updateChatHistory", history: currentMessages });
        this._postMessage({ type: "loopComplete" });
      } else {
        this._sendAvatarState("error");
        this._postMessage({ type: "chatResponseError", error: err instanceof Error ? err.message : String(err) });
      }
    } finally {
      this._activeAbortController = undefined;
    }
    } catch (outerErr: unknown) {
      this._sendAvatarState("error");
      console.error("Unhandled error in handleMessageStream:", outerErr);
      try {
        this._postMessage({ type: "chatResponseError", error: outerErr instanceof Error ? outerErr.message : "Unknown error" });
      } catch (_) { /* best effort */ }
    } finally {
      this._activeAbortController = undefined;
    }
  }
}
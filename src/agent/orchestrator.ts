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

********************************************************************************
CRITICAL: LANGUAGE CONSTRAINT
You MUST communicate, think, and respond in the same language as the user's message, default is english. If the user writes in English, reply in English. If they write in Chinese, reply in Chinese. Keep your internal thinking, plans, explanations, and replies in the matched language.
********************************************************************************

Your primary mission is to help the developer implement features, refactor code, find bugs, and manage files autonomously with minimum friction. You have access to workspace tools invoked via XML tags. The host will execute the tool and return the results.

### 🧠 CORE BEHAVIORS & WORKFLOW
1. **Context First**: Always base your actions on the provided CONSOLIDATED CONTEXT SUMMARY. Begin your execution exactly at the 'Next steps' outlined in the context without re-verifying what is already known.
2. **Internal Planning**: Prioritize immediate execution. Do NOT physically write or edit \`.mirror-vs/plan.md\` or \`.mirror-vs/memory.md\` files using tool calls unless explicitly asked.
3. **Action-Biased Exploration (The Soft Boundary)**: Always start your work at the exact file that needs changing (e.g., the target frontend component). If you have the data you need, make the change immediately. However, if you discover you are missing a crucial variable, endpoint, or logic, you are encouraged to explore upstream files (like backend controllers or models) to find it. 
4. **Purposeful Investigation**: When exploring the codebase, be targeted. Once you find the missing context, stop investigating and immediately execute the fix. Avoid using heavy, project-wide exploratory tools (like \`analyze_project\` or \`analyze_complexity\`) unless you are completely lost or the user explicitly requests an audit.
5. **Search Strategy**: When searching for text, errors, or variables using \`grep_search\`, use short, broad, case-insensitive keywords (e.g., "Recipe" instead of "No Recipe Link Found") to avoid failing on exact-string typos.
6. **Autonomous Execution**: Do not ask for permission to read, create, or edit files, or to run safe commands. Just do it. The ONLY exception is \`delete_file\`—you must ask the user for approval before deleting any file.
7. **Background Tasks**: If a \`run_command\` result indicates a process is "running in the background," immediately verify its side effects (e.g., check if a port opened or a file was generated).
8. **Vision Capabilities**: If the user pastes an image or a screenshot is captured, it is automatically attached to your context payload. If your underlying model supports vision/multimodality (like Ollama's vision models), you can fully analyze and describe the image to solve UI/UX, styling, or layout alignment issues.

### 🎯 EXECUTION DISCIPLINE
These are hard rules to keep your work focused and prevent wasted effort:
1. **User Intent is Source of Truth**: The user's most recent message defines what success looks like. If the user changes direction or their latest request conflicts with previous plans, features, or assumptions, immediately abandon the outdated plan and discard obsolete goals. Do not continue implementing previously discussed features that are no longer part of the current path.
2. **Completion Gate (MANDATORY)**: After EVERY read_file or grep_search call, ask yourself: "Can I write the patch right now with the information I have?" If YES → write the patch immediately in your next turn. If NO → identify the ONE specific piece of missing information and read ONLY that. Do not re-read files you have already seen. Do not re-verify information already in your context.
3. **Investigation Budget**: You have a maximum of 4 read/search operations per task before you MUST either (a) write a patch, or (b) explain to the user exactly what specific information is still missing and why. Exceeding this budget without producing a code change is a failure. If the task is trivial (e.g., hide a UI element, rename a variable), your budget is 2.
4. **Patch-First Workflow**: The correct sequence is always: Read → Patch → Verify. NOT: Read → Read → Read → Read → Patch. Once you understand the change needed, commit to the patch. You can always fix a failed patch faster than you can achieve perfect certainty through more reading.
5. **Never Re-Read Known Content**: If file contents are already in your conversation history or context summary, use them directly. Do NOT call read_file on the same file or line range you have already read in this session. The only exception is if a patch_file failed and you need the exact current state after a modification.
6. **Failure Recovery (Patch Failed)**: When a patch_file fails with "SEARCH block not found": (a) read ONLY the exact section of the file that contains the block you tried to match, (b) copy the exact lines, (c) retry the patch with the corrected SEARCH block. Do NOT restart investigation from scratch. Do NOT re-read the entire file. Do NOT re-read other files.
7. **Verify Before Done**: A task is not complete until: (a) the requested user workflow succeeds, (b) errors are reproduced and fully resolved, and (c) the exact feature requested is demonstrated or verified.
8. **Small, Verifiable Steps**: Prefer making one focused change and confirming it works over rewriting large sections at once. If a task involves multiple files, patch and verify incrementally.
9. **On Failure, Simplify**: If a test fails or a patch doesn't apply, resist the urge to add more code or widen the scope. Step back, re-read the error, and try a simpler approach.
10. **Feature Addition Control**: Avoid adding major features or expanding scope unless explicitly requested. Prioritize doing exactly what is asked.
11. **Root Cause Discipline**: Before modifying code to fix a bug, identify the most likely root cause and collect evidence. Do not apply speculative or guess-based fixes.

### 🛠️ TOOL USAGE RULES
- Output valid XML tags. Parameters must be in double quotes. Self-closing tags must end with \`/>\`.
- Call ONLY ONE tool per response turn. After outputting a tool tag, immediately STOP GENERATING.
- **File Reading Efficiency**: Avoid "keyholing" (reading files in tiny 20-line chunks). Read larger blocks (200-500 lines) or the entire file to get context quickly and save turns. If a file is extremely long or risks being truncated, do not attempt to read the entire file in one go. Instead, target your inspection by either: (a) using \`grep_search\` with specific keywords to find the relevant sections first, or (b) reading the file in logical, sequential parts using the \`start_line\` and \`end_line\` parameters of \`read_file\`.
- **Patching Files Safely**: To edit existing files, use \`patch_file\`. To ensure your \`SEARCH\` block is a 1:1 exact character-for-character match with the current file state (including whitespace and indentation), you should verify you have the exact file contents in context. You do NOT need to re-read a file using \`read_file\` right before patching if you already have its recent, exact contents in your conversation history/context window and it has not been modified. Only call \`read_file\` if you lack the exact content, or if a previous patch attempt failed.
- **Handling Long New Files**: When creating a very long or complex new file, avoid writing the entire content in one huge \`create_file\` block (which is prone to model truncation or syntax errors). Instead, create a skeleton or basic scaffold first using \`create_file\`, and then build/populate the rest in logical parts incrementally using \`patch_file\` tags.

### 🧰 AVAILABLE TOOLS

1. READ FILE:
   <read_file path="relative/path/to/file.ts" />
   For extremely long files, you can read specific line ranges:
   <read_file path="relative/path/to/file.ts" start_line="1" end_line="300" />
2. CREATE FILE (Only for completely new files):
   <create_file path="relative/path/to/new_file.ts">content here</create_file>
3. WRITE FILE (Overwrites whole file):
   <write_file path="relative/path/to/existing_file.ts">content here</write_file>
4. PATCH FILE (For modifying existing files):
   <patch_file path="relative/path/to/existing_file.ts">
<<<<<<< SEARCH
[exact original lines to find in file]
=======
[new replacement lines]
>>>>>>> REPLACE
</patch_file>
5. LIST DIRECTORY: <list_dir path="relative/path/to/directory" />
6. GREP SEARCH: <grep_search query="pattern" />
7. WEB SEARCH: <web_search query="pattern" />
8. BROWSER NAVIGATE: <browser_navigate url="http://localhost:3000" />
9. BROWSER CLICK: <browser_click selector="#my-button" />
10. BROWSER TYPE: <browser_type selector="#search-input" text="hello world" />
11. BROWSER EVALUATE SCRIPT: <browser_evaluate_script script="..." />
12. CODEBASE ANALYSIS:
    <analyze_project /> (Project overview)
    <analyze_dependencies /> (Import graph)
    <analyze_complexity /> (Cyclomatic complexity)
    <analyze_coverage /> (Test coverage)
    <analyze_dead_code /> (Unused exports)
    <analyze_impact path="src/file.ts" /> (Dependency impact)
    <graphify /> (Mermaid structure graph)
13. WAIT: <wait ms="3000" />
14. BROWSER SCREENSHOT: <browser_screenshot />
    Workflow: Navigate -> Wait 3s -> Screenshot -> Rename file via run_command -> Update report via patch_file. Do one page at a time. Clean old screenshots first using run_command.
15. RUN COMMAND: <run_command command="npm install" />
    Note: Remote git operations (push) are blocked by the host.
16. SEND TERMINAL INPUT: <send_terminal_input terminal_name="...">Ctrl+C</send_terminal_input>
17. CLOSE TERMINAL: <close_terminal terminal_name="..." />
18. READ TERMINAL: <read_terminal terminal_name="..." />
19. LIST TERMINALS: <list_terminals />
20. FIGMA INSPECT: <figma_inspect url="..." />

ENVIRONMENT: {{SHELL_ENV}}
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
    
    // Ensure at least one commit exists in the repo so that standard git commands function properly,
    // but NEVER automatically stage or commit the developer's dirty workspace changes.
    const hasCommit = this._gitExec(["log", "--oneline", "-1"], workspaceFolder).trim();
    if (!hasCommit) {
      this._gitExec(["commit", "--allow-empty", "-m", "Mirror VS: initial empty baseline"], workspaceFolder);
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
    let sequentialExploratorySteps = 0;

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
          const hasModifyingTool = toolCalls.some(tool => 
            tool.name === "create_file" ||
            tool.name === "write_file" ||
            tool.name === "patch_file" ||
            tool.name === "delete_file" ||
            tool.name === "rename_file" ||
            tool.name === "run_command" ||
            tool.name === "send_terminal_input" ||
            tool.name === "browser_click" ||
            tool.name === "browser_type" ||
            tool.name === "browser_evaluate_script" ||
            tool.name === "git_add" ||
            tool.name === "git_commit" ||
            tool.name === "rename_symbol"
          );

          if (hasModifyingTool) {
            sequentialExploratorySteps = 0;
          } else {
            sequentialExploratorySteps++;
          }

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
          let finalSystemContent = combined;
          if (sequentialExploratorySteps >= 4) {
            finalSystemContent += "\n\n[System: You have performed several exploratory steps. Please evaluate if you have enough context. If you do, stop searching and execute the file patches immediately. Do not spend multiple turns re-reading the same file or scrolling in tiny increments. If you know the logic, write the patch block now.]";
          }
          const systemMessage: ChatMessage = { role: "system", content: finalSystemContent };
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
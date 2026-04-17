import { LLMProvider, Message } from '../providers/types';
import { ContextManager } from '../utils/ContextManager';
import { ToolParser, ToolCall } from './ToolParser';
import { ToolExecutor } from './ToolExecutor';
import { SessionManager, Session } from './SessionManager';
import { COORDINATOR_PROMPT, EXPLORER_PROMPT, CODER_PROMPT, DESIGNER_PROMPT } from '../prompts/modes';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as vscode from 'vscode';

export type AgentMode = 'COORDINATOR' | 'EXPLORER' | 'CODER' | 'DESIGNER';

export class AgentOrchestrator {
    private mode: AgentMode = 'COORDINATOR';
    private history: ContextManager;
    private provider: LLMProvider;
    private executor: ToolExecutor;
    private sessionManager?: SessionManager;
    private workspaceRoot: string | undefined;
    private channel?: vscode.OutputChannel;
    private currentSessionId: string;
    private toolHistory: string[] = [];
    private onUpdate?: (data: { messages: Message[], isThinking: boolean }) => void;
    private abortController?: AbortController;
    private isThinking: boolean = false;

    constructor(provider: LLMProvider, contextManager: ContextManager, workspaceRoot?: string, channel?: vscode.OutputChannel) {
        this.provider = provider;
        this.history = contextManager;
        this.workspaceRoot = workspaceRoot;
        this.executor = new ToolExecutor(workspaceRoot);
        this.channel = channel;
        this.currentSessionId = uuidv4();

        if (workspaceRoot) {
            this.sessionManager = new SessionManager(workspaceRoot);
        }

        this.initializeMemory();
    }

    public setUpdateCallback(callback: (data: { messages: Message[], isThinking: boolean }) => void) {
        this.onUpdate = callback;
    }

    public getProvider(): LLMProvider {
        return this.provider;
    }

    private initializeMemory() {
        if (!this.workspaceRoot) return;

        const mirrorDir = path.join(this.workspaceRoot, '.mirror');
        if (!fs.existsSync(mirrorDir)) {
            fs.mkdirSync(mirrorDir, { recursive: true });
        }

        const memoryPath = path.join(mirrorDir, 'memory.md');
        try {
            if (!fs.existsSync(memoryPath)) {
                fs.writeFileSync(memoryPath, '# MIRROR memory\n\nThis folder tracks project conventions and architectural decisions.\n');
            }
        } catch (error) {
            console.error('Failed to initialize .mirror/memory.md:', error);
        }
    }

    public async processMessage(userMessage: string, maxTurns: number = 1000) {
        this.isThinking = true;

        const cwd = this.executor.getCurrentDir();
        let enrichedMessage = `[CURRENT LOCATION: ${cwd}]\n\n${userMessage}`;

        // Phase 2: Figma Integration - DESIGNER Mode Trigger
        if (userMessage.includes('figma.com')) {
            this.logDebug("DESIGNER TRIGGER: Figma URL detected. Switching mode to DESIGNER.");
            this.mode = 'DESIGNER';
        }

        // 5. Keyword Cheat Codes (Tailwind v3 Fallback Fix)
        if (userMessage.toLowerCase().includes('tailwind')) {
            enrichedMessage += `\n\n[CHEAT SHEET: TAILWIND v4]\nTailwind v4 is a significant departure from v3. Key rules:\n1. NO tailwind.config.js - Configuration is now handled via CSS @theme variables.\n2. USE @import "tailwindcss"; in your main CSS file.\n3. POSTCSS or VITE integration: Use '@tailwindcss/vite' plugin, NOT 'tailwindcss' postcss plugin.\n4. CONTENT: v4 auto-detects classes, no 'content' array needed in config.`;
        }

        this.addHistory({ role: 'user', content: enrichedMessage });
        this.logDebug(`USER [Enriched]: ${enrichedMessage}`);
        this.triggerUpdate();

        try {
            let turns = 0;
            while (turns < maxTurns) {
                this.logDebug(`THINKING: Mode=${this.mode}, Turn=${turns + 1}`);
                const systemPrompt = this.getPromptForMode();

                const messages = this.history.pruneContext((text) => this.provider.tokenize(text), systemPrompt);

                const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
                this.logDebug(`CONTEXT METRICS: Messages=${messages.length}, Chars=${totalChars}, Window=${this.history.getMaxTokens()}`);

                this.abortController = new AbortController();
                const startTime = Date.now();

                const response = await this.provider.generateResponse(messages, {
                    numCtx: this.history.getMaxTokens(),
                    signal: this.abortController.signal,
                    onToken: (token) => {
                        const hist = this.history.getHistory();
                        let lastMsg = hist[hist.length - 1];

                        if (lastMsg && lastMsg.role === 'assistant') {
                            lastMsg.content += token;
                        } else {
                            const newMsg: Message = { role: 'assistant', content: token };
                            this.history.addMessage(newMsg);
                            lastMsg = newMsg;
                        }

                        // EARLY TERMINATION: Stop as soon as a Mirror tool call is complete
                        // Precision regex to avoid mistaking React JSX for Mirror tools (Fixes JSX Truncation)
                        const content = lastMsg.content.trim();
                        const closingToolsRegex = /<\/(write_file|replace_block|append_memory|search_file)>$/;
                        const selfClosingToolsRegex = /<(read_file|list_dir|run_command|web_search|read_url)[^>]*\/>$/;

                        if (closingToolsRegex.test(content) || selfClosingToolsRegex.test(content)) {
                            this.logDebug(`EARLY TERMINATION: Detected end of VALID tool call. Aborting stream.`);
                            this.abortController?.abort();
                        }

                        this.triggerUpdate();
                    }
                });

                this.logDebug(`ASSISTANT [Mode: ${this.mode}] (${Date.now() - startTime}ms):\n${response.content}`);
                this.saveSession();
                this.triggerUpdate();

                if (response.content.trim().length === 0) {
                    this.logDebug("INTERCEPTOR: Empty response detected. Switching to EXPLORER mode.");
                    this.mode = 'EXPLORER';
                    this.addHistory({
                        role: 'user',
                        content: "You returned an empty response. I have switched your mode to EXPLORER. If you are stuck on a technical error, use <web_search query='...' /> to find a solution."
                    });
                    turns++;
                    continue;
                }

                // 4. THE CONTROL TOKEN SANITIZER
                // Strip leaked internal tokens from Gemma 4B before parsing (Fixes Parser Collision)
                const cleanContent = response.content.replace(/<channel\|>|<\|"\|>|<\|endoftext\|>|<eos>|<\|im_start\|>|<\|im_end\|>/g, '');
                let toolCalls = ToolParser.parseHeuristic(cleanContent);

                // 1. Markdown Leak Interceptor
                if (toolCalls.length === 0 && response.content.includes('```')) {
                    this.logDebug("INTERCEPTOR: Markdown detected without XML tags. Switching to EXPLORER mode.");
                    this.mode = 'EXPLORER';
                    this.addHistory({
                        role: 'user',
                        content: "CRITICAL ERROR: You output raw Markdown code blocks (```) instead of using the required XML tool tags (<write_file> or <replace_block>). You MUST wrap all code changes in the appropriate tool tags. I have switched your mode to EXPLORER. Please retry the previous step using the correct schema."
                    });
                    turns++;
                    continue;
                }

                // 2. The Hard Tool Execution Limit (Fixes the Tool Cannon)
                if (toolCalls.length > 2) {
                    this.logDebug(`INTERCEPTED: Tool Cannon Detected. Slicing from ${toolCalls.length} down to 2.`);

                    // Grab the names of the dropped tools to tell the model exactly what it lost (Fixes the Desync Deadlock)
                    const droppedTools = toolCalls.slice(2).map(t => t.name).join(', ');
                    const originalCount = toolCalls.length;

                    toolCalls = toolCalls.slice(0, 2);

                    // CRITICAL FIX: Force the model into EXPLORER mode to break the Attention Tunnel
                    this.mode = 'EXPLORER';

                    this.addHistory({
                        role: 'user',
                        content: `CRITICAL SYSTEM OVERRIDE: You attempted to execute ${originalCount} tools at once, which violates the pacing limit. Only the first two tools were executed.\n\nThe following tools were CANCELLED and ignored: [${droppedTools}]. \n\nDO NOT wait for their output. I have switched your mode to EXPLORER. You MUST evaluate the current results, verify the environment state, and re-issue the remaining tools in your next response, strictly two at a time.`
                    });
                }

                if (toolCalls.length === 0) {
                    // Semi-autonomous mode recovery: 
                    // If we were in EXPLORER mode and just finished an analysis turn (no tools called),
                    // switch back to CODER mode so the model can apply the fix in the next turn.
                    if (this.mode === 'EXPLORER') {
                        this.logDebug("EXPLORER analysis complete. Switching to CODER mode for the next turn.");
                        this.mode = 'CODER';
                    }

                    // Phase 2: Design Reversion
                    if (this.mode === 'DESIGNER') {
                        this.logDebug("DESIGNER task completed. Reverting to COORDINATOR.");
                        this.mode = 'COORDINATOR';
                    }

                    break;
                }

                for (const tool of toolCalls) {
                    if (this.detectLoop(tool)) {
                        this.mode = 'EXPLORER'; // Focus on understanding why it failed
                        this.addHistory({
                            role: 'user',
                            content: `LOOP DETECTED: You have called ${tool.name} with these arguments multiple times. I am switching your mode to EXPLORER. Please re-examine the file contents or environment state before trying again.`
                        });
                        continue;
                    }

                    const result = await this.executeTool(tool);
                    const formattedResult = result.trim() || 'Command executed successfully with no output.';
                    this.logDebug(`TOOL [${tool.name}]: ${formattedResult}`);

                    let feedbackContent = `[TOOL_RESULT: ${tool.name}]\n${formattedResult}`;

                    // 2. npm install Interceptor (Amnesia by Omission Fix)
                    if (tool.name === 'run_command' && (tool.args.includes('install') || tool.params.cmd?.includes('install'))) {
                        feedbackContent += '\n\nIMPORTANT: You just installed/updated a dependency. You MUST now use <append_memory> to document the specific technical paradigms or versions for this library in .mirror/memory.md.';
                    }

                    // Inject a harsh override if the tool failed
                    if (formattedResult.startsWith('Error:') || formattedResult.startsWith('Execution Error:')) {
                        feedbackContent += '\n\nCRITICAL: The previous action failed. Do not continue to the next step. You MUST fix this error first.';
                    }

                    this.addHistory({
                        role: 'user',
                        content: feedbackContent
                    });
                    this.triggerUpdate();
                }

                turns++;
            }
        } catch (error: any) {
            this.logDebug(`ERROR: ${error.message}`);
        } finally {
            this.isThinking = false;
            this.triggerUpdate();
        }
    }

    private async executeTool(tool: ToolCall): Promise<string> {
        return this.executor.execute(tool);
    }

    private addHistory(msg: Message) {
        this.history.addMessage(msg);
    }

    private logDebug(msg: string) {
        if (this.channel) {
            this.channel.appendLine(`[${new Date().toISOString()}] ${msg}`);
        }
        // Also log to file in .mirror/debug.log
        if (this.workspaceRoot) {
            const logPath = path.join(this.workspaceRoot, '.mirror', 'debug.log');
            fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);
        }
    }

    private triggerUpdate() {
        if (this.onUpdate) {
            this.onUpdate({
                messages: this.history.getHistory(),
                isThinking: this.isThinking
            });
        }
    }

    private getPromptForMode(): string {
        let basePrompt = '';
        switch (this.mode) {
            case 'COORDINATOR': basePrompt = COORDINATOR_PROMPT; break;
            case 'EXPLORER': basePrompt = EXPLORER_PROMPT; break;
            case 'CODER': basePrompt = CODER_PROMPT; break;
            case 'DESIGNER': basePrompt = DESIGNER_PROMPT; break;
            default: basePrompt = COORDINATOR_PROMPT;
        }

        // 1. Automated Dependency Injection
        if (this.workspaceRoot) {
            const pkgPath = path.join(this.workspaceRoot, 'package.json');
            if (fs.existsSync(pkgPath)) {
                try {
                    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                    const deps = Object.keys(pkg.dependencies || {}).concat(Object.keys(pkg.devDependencies || {})).join(', ');
                    if (deps) {
                        basePrompt += `\n\nCURRENT PROJECT DEPENDENCIES: ${deps}`;
                    }
                } catch (e) { /* Ignore */ }
            }
        }

        // 2. Automated Memory Injection (Truncated to 2000 chars)
        if (this.workspaceRoot) {
            const memoryPath = path.join(this.workspaceRoot, '.mirror', 'memory.md');
            if (fs.existsSync(memoryPath)) {
                try {
                    let memory = fs.readFileSync(memoryPath, 'utf8');
                    if (memory.length > 2000) {
                        const head = memory.substring(0, 1000);
                        const tail = memory.substring(memory.length - 1000);
                        memory = `${head}\n\n...[ARCHIVED OLDER PARADIGMS]...\n\n${tail}`;
                    }
                    basePrompt += `\n\nTECHNICAL LEDGER / PROJECT MEMORY:\n${memory}`;
                } catch (e) { /* Ignore */ }
            }
        }

        // 3. Automated Task Plan Injection (Fixes Long-Task Amnesia)
        if (this.workspaceRoot) {
            const planPath = path.join(this.workspaceRoot, '.mirror', 'plan.md');
            if (fs.existsSync(planPath)) {
                try {
                    const plan = fs.readFileSync(planPath, 'utf8');
                    basePrompt += `\n\nCURRENT PROJECT PLAN (Checklist):\n${plan}`;
                } catch (e) { /* Ignore */ }
            }
        }

        return basePrompt;
    }

    private saveSession() {
        if (this.sessionManager) {
            this.sessionManager.saveSession({
                id: this.currentSessionId,
                title: this.history.getHistory()[0]?.content.slice(0, 50) || 'New Session',
                timestamp: Date.now(),
                messages: this.history.getHistory()
            });
        }
    }

    private detectLoop(tool: ToolCall): boolean {
        const key = `${tool.name}:${tool.args}:${JSON.stringify(tool.params)}`;

        // Add to history
        this.toolHistory.push(key);

        // Keep window at 5 turns
        if (this.toolHistory.length > 5) {
            this.toolHistory.shift();
        }

        // Count occurrences in the current window
        const count = this.toolHistory.filter(k => k === key).length;

        return count >= 3;
    }

    public stop() {
        if (this.abortController) {
            this.abortController.abort();
        }
        this.isThinking = false;
        this.triggerUpdate();
    }

    public loadSession(session: Session) {
        this.currentSessionId = session.id;
        this.history.setHistory(session.messages);
        this.triggerUpdate();
    }

    public getSessions() {
        return this.sessionManager?.getSessions() || [];
    }

    public getSessionManager() {
        return this.sessionManager;
    }

    public reset() {
        this.currentSessionId = uuidv4();
        this.history.clear();
        this.triggerUpdate();
    }

    public deleteSession(id: string) {
        this.sessionManager?.deleteSession(id);
        this.triggerUpdate();
    }
}

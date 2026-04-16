import { LLMProvider, Message } from '../providers/types';
import { ContextManager } from '../utils/ContextManager';
import { ToolParser, ToolCall } from './ToolParser';
import { ToolExecutor } from './ToolExecutor';
import { SessionManager, Session } from './SessionManager';
import { COORDINATOR_PROMPT, EXPLORER_PROMPT, CODER_PROMPT } from '../prompts/modes';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as vscode from 'vscode';

export type AgentMode = 'COORDINATOR' | 'EXPLORER' | 'CODER';

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

    public async processMessage(userMessage: string, maxTurns: number = 15) {
        this.isThinking = true;
        this.addHistory({ role: 'user', content: userMessage });
        this.logDebug(`USER: ${userMessage}`);
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
                        }
                        this.triggerUpdate();
                    }
                });

                this.logDebug(`ASSISTANT [Mode: ${this.mode}] (${Date.now() - startTime}ms):\n${response.content}`);
                this.saveSession();
                this.triggerUpdate();

                if (response.content.trim().length === 0) {
                    this.addHistory({
                        role: 'user',
                        content: "You returned an empty response. If you are stuck on a technical error, use <web_search query='...' /> to find a solution."
                    });
                    turns++;
                    continue;
                }

                const toolCalls = ToolParser.parseHeuristic(response.content);
                if (toolCalls.length === 0) {
                    // Semi-autonomous mode recovery: 
                    // If we were in EXPLORER mode and just finished an analysis turn (no tools called),
                    // switch back to CODER mode so the model can apply the fix in the next turn.
                    if (this.mode === 'EXPLORER') {
                        this.logDebug("EXPLORER analysis complete. Switching to CODER mode for the next turn.");
                        this.mode = 'CODER';
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
            default: basePrompt = COORDINATOR_PROMPT;
        }

        // Automatically inject the project dependencies so the model always knows the tech stack
        if (this.workspaceRoot) {
            const pkgPath = path.join(this.workspaceRoot, 'package.json');
            if (fs.existsSync(pkgPath)) {
                try {
                    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                    const deps = Object.keys(pkg.dependencies || {}).concat(Object.keys(pkg.devDependencies || {})).join(', ');
                    if (deps) {
                        basePrompt += `\n\nCURRENT PROJECT DEPENDENCIES: ${deps}`;
                    }
                } catch (e) {
                    // Ignore parsing errors
                }
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

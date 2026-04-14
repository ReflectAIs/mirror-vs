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
    private loopCounter: Map<string, number> = new Map();
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
                        content: "You returned an empty response. Please proceed with the next technical step using the appropriate tools." 
                    });
                    turns++;
                    continue;
                }

                const toolCalls = ToolParser.parseHeuristic(response.content);
                if (toolCalls.length === 0) {
                    break;
                }

                for (const tool of toolCalls) {
                    if (this.detectLoop(tool)) {
                        this.addHistory({ 
                            role: 'user', 
                            content: `LOOP DETECTED: You have called ${tool.name} with these arguments/params multiple times. Please rethink your strategy.` 
                        });
                        continue;
                    }

                    const result = await this.executeTool(tool);
                    this.logDebug(`TOOL [${tool.name}]: ${result}`);
                    this.addHistory({ 
                        role: 'user', 
                        content: `TOOL_RESULT [${tool.name}]:\n--- [EXTERNAL DATA START] ---\n${result}\n--- [EXTERNAL DATA END] ---` 
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
        switch (this.mode) {
            case 'COORDINATOR': return COORDINATOR_PROMPT;
            case 'EXPLORER': return EXPLORER_PROMPT;
            case 'CODER': return CODER_PROMPT;
            default: return COORDINATOR_PROMPT;
        }
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
        const count = (this.loopCounter.get(key) || 0) + 1;
        this.loopCounter.set(key, count);
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

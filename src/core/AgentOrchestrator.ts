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
    private onUpdate?: (messages: Message[]) => void;
    private abortController?: AbortController;

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

    public setUpdateCallback(callback: (messages: Message[]) => void) {
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

    async processMessage(userMessage: string) {
        this.addHistory({ role: 'user', content: userMessage });
        const historyPath = this.workspaceRoot ? path.join(this.workspaceRoot, '.mirror', 'debug.log') : '';
        this.logDebug(`USER: ${userMessage}`);
        
        let turns = 0;
        const maxTurns = 15;

        while (turns < maxTurns) {
            this.logDebug(`THINKING: Mode=${this.mode}, Turn=${turns + 1}`);
            this.triggerUpdate();
            const systemPrompt = this.getPromptForMode();
            
            // Temporary strategy: inject system prompt as first message if not present
            const messages = this.history.pruneContext((text) => this.provider.tokenize(text));
            if (!messages.find(m => m.role === 'system')) {
                messages.unshift({ role: 'system', content: systemPrompt });
            }

            this.abortController = new AbortController();
            let turnTokenBuffer = '';
            
            const response = await this.provider.generateResponse(messages, {
                numCtx: this.history.getMaxTokens(),
                signal: this.abortController.signal,
                onToken: (token) => {
                    turnTokenBuffer += token;
                    // Create/Update the assistant message in history incrementally
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

            this.logDebug(`ASSISTANT [Mode: ${this.mode}]:\n${response.content}`);
            // Ensure the final content is saved (it was already being built by onToken)
            this.saveSession();
            this.triggerUpdate();
            
            const toolCalls = ToolParser.parseHeuristic(response.content);
            if (toolCalls.length === 0) {
                // Agent is done or just chatting
                break;
            }

            for (const tool of toolCalls) {
                if (this.detectLoop(tool)) {
                    this.history.addMessage({ 
                        role: 'user', 
                        content: `LOOP DETECTED: You have called ${tool.name} with these arguments/params multiple times. Please rethink your strategy.` 
                    });
                    continue; // Skip this one but allow others
                }

                const result = await this.executeTool(tool);
                this.logDebug(`TOOL [${tool.name}]: ${result}`);
                this.addHistory({ 
                    role: 'user', 
                    content: `TOOL_RESULT [${tool.name}]:\n${result}` 
                });
                this.triggerUpdate();
            }

            turns++;
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

    private logDebug(message: string) {
        const timestamp = new Date().toISOString();
        const formatted = `[${timestamp}] ${message}\n---\n`;
        
        if (this.channel) {
            this.channel.appendLine(formatted);
        }

        if (this.workspaceRoot) {
            const logPath = path.join(this.workspaceRoot, '.mirror', 'debug.log');
            fs.appendFileSync(logPath, formatted);
        }
    }

    private detectLoop(tool: ToolCall): boolean {
        const key = `${tool.name}:${tool.args}:${JSON.stringify(tool.params)}`;
        const count = (this.loopCounter.get(key) || 0) + 1;
        this.loopCounter.set(key, count);
        return count >= 3;
    }

    private async executeTool(tool: ToolCall): Promise<string> {
        return await this.executor.execute(tool);
    }

    public stop() {
        if (this.abortController) {
            this.abortController.abort();
            this.logDebug('GENERATION STOPPED BY USER');
        }
    }

    public reset() {
        this.history.clear();
        this.currentSessionId = uuidv4();
        this.mode = 'COORDINATOR';
        this.triggerUpdate();
        this.logDebug('NEW CHAT STARTED');
    }

    public loadSession(sessionId: string) {
        if (!this.sessionManager) return;
        const sessions = this.sessionManager.getSessions();
        const session = sessions.find(s => s.id === sessionId);
        
        if (session) {
            this.currentSessionId = session.id;
            this.history.clear();
            session.messages.forEach(m => this.history.addMessage(m));
            this.logDebug(`LOADED SESSION: ${sessionId}`);
            this.triggerUpdate();
        }
    }

    public getSessionManager() {
        return this.sessionManager;
    }

    public deleteSession(sessionId: string) {
        if (this.sessionManager) {
            this.sessionManager.deleteSession(sessionId);
            this.logDebug(`DELETED SESSION: ${sessionId}`);
        }
    }

    private addHistory(message: Message) {
        this.history.addMessage(message);
        this.saveSession();
    }

    private saveSession() {
        if (this.sessionManager) {
            const messages = this.history.getHistory();
            const title = messages.find(m => m.role === 'user')?.content.substring(0, 30) || 'New Chat';
            this.sessionManager.saveSession({
                id: this.currentSessionId,
                title,
                timestamp: Date.now(),
                messages
            });
        }
    }

    private triggerUpdate() {
        if (this.onUpdate) {
            this.onUpdate(this.history.getHistory());
        }
    }

    setMode(mode: AgentMode) {
        this.mode = mode;
    }
}

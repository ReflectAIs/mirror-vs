import * as os from 'os';
import { Message } from '../providers/types';

export class ContextManager {
    private maxTokens: number;
    private history: Message[] = [];
    private compressionThreshold: number = 0.9; // 90%

    constructor() {
        this.maxTokens = this.calculateOptimalContext();
    }

    private calculateOptimalContext(): number {
        // Optimization for CPU inference: 
        // 4096 is the standard context window for most Gemma 4B setups.
        // Larger windows cause slow attention computation on non-GPU hardware.
        return 4096;
    }

    getMaxTokens(): number {
        return this.maxTokens;
    }

    addMessage(message: Message) {
        this.history.push(message);
    }

    getHistory(): Message[] {
        return this.history;
    }

    setHistory(messages: Message[]) {
        this.history = messages;
    }

    /**
     * Managed context pruning.
     */
    pruneContext(tokenEstimator: (text: string) => number, systemPromptText?: string): Message[] {
        let totalTokens = 0;
        const prunedHistory: Message[] = [];
        
        if (systemPromptText) {
            totalTokens += tokenEstimator(systemPromptText);
        }

        for (let i = this.history.length - 1; i >= 0; i--) {
            const msg = this.history[i];
            if (msg.role === 'system') continue; // Ignore old system prompts
            
            const tokens = tokenEstimator(msg.content);
            if (totalTokens + tokens < this.maxTokens * this.compressionThreshold) {
                prunedHistory.unshift(msg);
                totalTokens += tokens;
            } else {
                break;
            }
        }

        if (systemPromptText) {
            prunedHistory.unshift({ role: 'system', content: systemPromptText });
        }

        return prunedHistory;
    }

    clear() {
        this.history = [];
    }
}

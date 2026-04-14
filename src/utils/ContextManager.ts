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
        // 8192 provides a better balance for complex tasks.
        return 8192;
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
     * Managed context pruning with high-level objective pinning.
     */
    pruneContext(tokenEstimator: (text: string) => number, systemPromptText?: string): Message[] {
        let totalTokens = 0;
        const prunedHistory: Message[] = [];
        
        let headerTokens = 0;
        if (systemPromptText) {
            headerTokens += tokenEstimator(systemPromptText);
        }

        // Pin the first user message (the original request)
        const firstUserMsg = this.history.find(m => m.role === 'user');
        let pinnedMsg: Message | undefined;
        if (firstUserMsg) {
            pinnedMsg = firstUserMsg;
            headerTokens += tokenEstimator(pinnedMsg.content);
        }

        totalTokens = headerTokens;

        // Iterate backwards from the end, skipping the first user message if pinned
        for (let i = this.history.length - 1; i >= 0; i--) {
            const msg = this.history[i];
            if (msg.role === 'system') continue; 
            if (msg === pinnedMsg) continue; // Already counted in header

            const tokens = tokenEstimator(msg.content);
            if (totalTokens + tokens < this.maxTokens * this.compressionThreshold) {
                prunedHistory.unshift(msg);
                totalTokens += tokens;
            } else {
                break;
            }
        }

        // Assemble the final message list: [System] -> [Pinned Goal] -> [Pruned History]
        if (pinnedMsg) {
            prunedHistory.unshift(pinnedMsg);
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

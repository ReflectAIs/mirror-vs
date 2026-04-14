import * as os from 'os';
import { Message } from '../providers/types';

export class ContextManager {
    private maxTokens: number;
    private history: Message[] = [];
    private compressionThreshold: number = 0.8; // 80%

    constructor() {
        this.maxTokens = this.calculateOptimalContext();
    }

    private calculateOptimalContext(): number {
        const totalMemory = os.totalmem() / (1024 * 1024 * 1024); // GB
        
        if (totalMemory >= 32) return 16384;
        if (totalMemory >= 16) return 8192;
        if (totalMemory >= 8) return 4096;
        return 2048; // Safe minimum for small devices
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

    /**
     * Simple pruning strategy: keep the system prompt + recent messages.
     * Future enhancement: Call LLM to summarize middle messages.
     */
    pruneContext(tokenEstimator: (text: string) => number): Message[] {
        let totalTokens = 0;
        const prunedHistory: Message[] = [];
        const systemPrompt = this.history.find(m => m.role === 'system');
        
        if (systemPrompt) {
            totalTokens += tokenEstimator(systemPrompt.content);
        }

        // Add messages from newest to oldest until limit reached
        for (let i = this.history.length - 1; i >= 0; i--) {
            const msg = this.history[i];
            if (msg.role === 'system') continue;
            
            const tokens = tokenEstimator(msg.content);
            if (totalTokens + tokens < this.maxTokens * this.compressionThreshold) {
                prunedHistory.unshift(msg);
                totalTokens += tokens;
            } else {
                break;
            }
        }

        if (systemPrompt) {
            prunedHistory.unshift(systemPrompt);
        }

        return prunedHistory;
    }

    clear() {
        this.history = [];
    }
}

import { Ollama } from 'ollama';
import { LLMProvider, Message, LLMResponse, GenerationOptions } from './types';

export class OllamaProvider implements LLMProvider {
    name = 'Ollama';
    private client: Ollama;
    private model: string;

    constructor(model: string = 'gemma4:e4b', host: string = 'http://localhost:11434') {
        this.client = new Ollama({ host });
        this.model = model;
    }

    async generateResponse(messages: Message[], options: GenerationOptions = {}): Promise<LLMResponse> {
        try {
            const response = await this.client.chat({
                model: this.model,
                messages: messages,
                stream: true,
                options: {
                    num_ctx: options.numCtx || 4096,
                    temperature: options.temperature || 0.1,
                }
            });

            let fullContent = '';
            let usage: any = {};

            for await (const part of response) {
                // Check if signal has been aborted
                if (options.signal?.aborted) {
                    break;
                }

                const content = part.message.content;
                fullContent += content;
                if (options.onToken) {
                    options.onToken(content);
                }

                if (part.done) {
                    usage = {
                        promptTokens: part.prompt_eval_count || 0,
                        completionTokens: part.eval_count || 0,
                        totalTokens: (part.prompt_eval_count || 0) + (part.eval_count || 0)
                    };
                }
            }

            return {
                content: fullContent,
                usage: usage
            };
        } catch (error: any) {
            console.error('Ollama Error:', error);
            throw new Error(`Ollama failed: ${error.message}`);
        }
    }

    tokenize(text: string): number {
        // Gemma uses roughly 4 chars/token but it varies. 
        // For E4B, we'll use a conservative 3.5 chars/token estimate for pruning.
        return Math.ceil(text.length / 3.5);
    }
}

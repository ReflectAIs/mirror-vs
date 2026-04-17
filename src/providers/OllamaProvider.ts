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
        const startTime = Date.now();
        try {
            const response = await this.client.chat({
                model: this.model,
                messages: messages,
                stream: true,
                options: {
                    num_ctx: options.numCtx || 4096,
                    temperature: options.temperature || 0.3,
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

            const endTime = Date.now();
            if (fullContent.length === 0) {
                console.warn(`[Ollama] Warning: Generated empty response in ${endTime - startTime}ms`);
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

    async listLocalModels(): Promise<string[]> {
        try {
            const response = await this.client.list();
            return response.models.map(m => m.name);
        } catch (error) {
            console.error('Error listing models:', error);
            return [];
        }
    }

    async pullModel(name: string, onProgress: (percent: number, status: string) => void): Promise<void> {
        try {
            const response = await this.client.pull({ model: name, stream: true });
            for await (const part of response) {
                if (part.total && part.completed) {
                    const percent = Math.round((part.completed / part.total) * 100);
                    onProgress(percent, part.status);
                } else {
                    onProgress(0, part.status);
                }
            }
        } catch (error: any) {
            throw new Error(`Failed to pull model ${name}: ${error.message}`);
        }
    }

    updateModel(name: string) {
        this.model = name;
        console.log(`[OllamaProvider] Model updated to: ${name}`);
    }

    getCurrentModel(): string {
        return this.model;
    }
}

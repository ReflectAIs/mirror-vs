export interface Message {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface LLMResponse {
    content: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

export interface GenerationOptions {
    onToken?: (token: string) => void;
    signal?: AbortSignal;
    numCtx?: number;
    temperature?: number;
}

export interface LLMProvider {
    name: string;
    generateResponse(messages: Message[], options?: GenerationOptions): Promise<LLMResponse>;
    tokenize(text: string): number;
}

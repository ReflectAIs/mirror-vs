/**
 * Google Gemini API provider for Mirror VS.
 * Adapted from Roo Code's Gemini provider.
 * Uses Google's Generative Language API (gemini-2.0-flash, gemini-1.5-pro, etc.).
 */

import { BaseProvider, ChatMessage, ProviderConfig, StreamChunk } from './base-provider';

interface GeminiContent {
  role: string;
  parts: GeminiPart[];
}

interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
  functionCall?: {
    name: string;
    args: object;
  };
  functionResponse?: {
    name: string;
    response: object;
  };
}

interface GeminiTool {
  functionDeclarations: Array<{
    name: string;
    description?: string;
    parameters?: object;
  }>;
}

export class GeminiProvider extends BaseProvider {
  private apiVersion = 'v1beta';

  constructor(apiKey: string, model: string = 'gemini-2.0-flash') {
    super({
      id: 'gemini',
      name: 'Google Gemini',
      baseUrl: 'https://generativelanguage.googleapis.com',
      apiKey,
      model,
      maxTokens: 8192,
      temperature: 0,
      supportsStreaming: true,
      supportsToolCalling: true,
      supportsImages: true,
    });
  }

  async *streamChat(
    messages: ChatMessage[],
    signal: AbortSignal,
    tools?: object[],
  ): AsyncGenerator<StreamChunk> {
    const url = `${this.config.baseUrl}/${this.apiVersion}/models/${this.config.model}:streamGenerateContent?alt=sse&key=${this.config.apiKey}`;

    const contents = this.convertMessagesToGemini(messages);
    const geminiTools: GeminiTool[] | undefined = tools
      ? [{ functionDeclarations: tools as any[] }]
      : undefined;

    const body: any = {
      contents,
      generationConfig: {
        temperature: this.config.temperature,
        maxOutputTokens: this.config.maxTokens,
      },
    };

    if (geminiTools) {
      body.tools = geminiTools;
    }

    const response = await this.httpPost(url, body, signal);
    const sseStream = this.readSSEStream(response, signal);

    let fullText = '';
    let usageInputTokens = 0;
    let usageOutputTokens = 0;

    for await (const chunk of sseStream) {
      try {
        const parsed = JSON.parse(chunk);
        const candidates = parsed.candidates || [];

        for (const candidate of candidates) {
          const content = candidate.content;
          if (!content) continue;

          // Handle text parts
          const parts = content.parts || [];
          for (const part of parts) {
            if (part.text) {
              fullText += part.text;
              yield { type: 'text', content: part.text };
            }
            if (part.functionCall) {
              yield {
                type: 'tool_call_start',
                id: `gemini-tc-${Date.now()}`,
                name: part.functionCall.name,
              };
              yield {
                type: 'tool_call_delta',
                id: `gemini-tc-${Date.now()}`,
                delta: JSON.stringify(part.functionCall.args),
              };
              yield {
                type: 'tool_call_end',
                id: `gemini-tc-${Date.now()}`,
              };
            }
          }
        }

        // Track usage
        if (parsed.usageMetadata) {
          usageInputTokens = parsed.usageMetadata.promptTokenCount || 0;
          usageOutputTokens = parsed.usageMetadata.candidatesTokenCount || 0;
        }
      } catch {
        // Skip unparseable chunks
      }
    }

    // Emit final usage
    if (usageInputTokens > 0 || usageOutputTokens > 0) {
      yield {
        type: 'usage',
        inputTokens: usageInputTokens,
        outputTokens: usageOutputTokens,
      };
    }
  }

  async complete(prompt: string, signal: AbortSignal): Promise<string> {
    const url = `${this.config.baseUrl}/${this.apiVersion}/models/${this.config.model}:generateContent?key=${this.config.apiKey}`;

    const body = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: this.config.temperature,
        maxOutputTokens: this.config.maxTokens,
      },
    };

    const response = await this.httpPost(url, body, signal);
    const data = (await response.json()) as any;
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  async fetchModels(): Promise<string[]> {
    const url = `${this.config.baseUrl}/${this.apiVersion}/models?key=${this.config.apiKey}`;

    try {
      const response = await fetch(url);
      const data = (await response.json()) as any;
      return (data.models || [])
        .filter(
          (m: any) =>
            m.supportedGenerationMethods?.includes('generateContent') &&
            !m.name.includes('embedding'),
        )
        .map((m: any) => m.name.replace('models/', ''));
    } catch {
      return ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'];
    }
  }

  private convertMessagesToGemini(messages: ChatMessage[]): GeminiContent[] {
    const contents: GeminiContent[] = [];

    for (const msg of messages) {
      const role = msg.role === 'assistant' ? 'model' : msg.role === 'system' ? 'user' : 'user';
      const parts: GeminiPart[] = [];

      if (msg.images && msg.images.length > 0) {
        for (const img of msg.images) {
          // Gemini expects base64 data without the data: prefix
          const base64 = img.replace(/^data:image\/\w+;base64,/, '');
          parts.push({
            inlineData: {
              mimeType: 'image/png',
              data: base64,
            },
          });
        }
      }

      if (msg.content && msg.content.trim()) {
        parts.push({ text: msg.content });
      }

      if (role === 'model' && parts.length === 0) {
        parts.push({ text: '' }); // Gemini requires at least one part
      }

      contents.push({ role, parts });
    }

    return contents;
  }
}

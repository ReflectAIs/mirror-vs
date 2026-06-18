/**
 * OpenRouter API provider for Mirror VS.
 * OpenRouter provides a unified API gateway to 200+ models from various providers.
 * Adapted from Roo Code's OpenRouter provider.
 */

import { BaseProvider, ChatMessage, StreamChunk } from './base-provider';

interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
  };
}

export class OpenRouterProvider extends BaseProvider {
  private developerMode: boolean;

  constructor(apiKey: string, model: string = 'anthropic/claude-3.5-sonnet') {
    super({
      id: 'openrouter',
      name: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey,
      model,
      maxTokens: 8192,
      temperature: 0,
      supportsStreaming: true,
      supportsToolCalling: true,
      supportsImages: true,
    });
    this.developerMode = true;
  }

  async *streamChat(
    messages: ChatMessage[],
    signal: AbortSignal,
    tools?: object[],
  ): AsyncGenerator<StreamChunk> {
    const url = `${this.config.baseUrl}/chat/completions`;

    const body: any = {
      model: this.config.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.images?.length
          ? {
              images: m.images.map((img) => ({
                url: img,
                detail: 'auto',
              })),
            }
          : {}),
      })),
      stream: true,
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
      stream_options: { include_usage: true },
    };

    if (tools && tools.length > 0) {
      // Tools are already in {type:'function', function:{...}} format from tool-schemas.ts
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    const response = await this.httpPost(
      url,
      body,
      signal,
      {
        'HTTP-Referer': 'https://github.com/DipeshMajithia/mirror-vs',
        'X-Title': 'Mirror VS',
      },
      120000,
    );

    const sseStream = this.readSSEStream(response, signal);
    let fullText = '';
    let usageInput = 0;
    let usageOutput = 0;
    // Track in-progress tool calls: index → {id, name, args}
    const toolCallBuffers = new Map<number, { id: string; name: string; args: string }>();

    for await (const chunk of sseStream) {
      try {
        const parsed = JSON.parse(chunk);
        const choice = parsed.choices?.[0];

        if (choice?.delta?.content) {
          fullText += choice.delta.content;
          yield { type: 'text', content: choice.delta.content };
        }

        // Handle tool calls
        if (choice?.delta?.tool_calls) {
          for (const tc of choice.delta.tool_calls) {
            if (tc.index !== undefined) {
              if (!toolCallBuffers.has(tc.index)) {
                toolCallBuffers.set(tc.index, {
                  id: tc.id || `tc-${tc.index}`,
                  name: tc.function?.name || '',
                  args: '',
                });
                yield {
                  type: 'tool_call_start',
                  id: tc.id,
                  name: tc.function?.name || '',
                };
              }
              const buf = toolCallBuffers.get(tc.index)!;
              if (tc.id) buf.id = tc.id;
              if (tc.function?.name) buf.name = tc.function.name;
              if (tc.function?.arguments) {
                buf.args += tc.function.arguments;
                yield {
                  type: 'tool_call_delta',
                  id: buf.id,
                  delta: tc.function.arguments,
                };
              }
            }
          }
        }

        if (parsed.usage) {
          usageInput = parsed.usage.prompt_tokens || 0;
          usageOutput = parsed.usage.completion_tokens || 0;
        }
      } catch {
        // Skip
      }
    }

    // Emit tool_call_end with accumulated arguments for each buffered call
    // Only emit the first one (one-tool-per-turn)
    const firstBuf = toolCallBuffers.get(0);
    if (firstBuf) {
      yield { type: 'tool_call_end', id: firstBuf.id, arguments: firstBuf.args, name: firstBuf.name };
    }

    if (usageInput > 0 || usageOutput > 0) {
      yield { type: 'usage', inputTokens: usageInput, outputTokens: usageOutput };
    }
  }

  async complete(prompt: string, signal: AbortSignal): Promise<string> {
    const url = `${this.config.baseUrl}/chat/completions`;

    const body = {
      model: this.config.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
    };

    const response = await this.httpPost(url, body, signal, {
      'HTTP-Referer': 'https://github.com/DipeshMajithia/mirror-vs',
      'X-Title': 'Mirror VS',
    });

    const data = (await response.json()) as any;
    return data.choices?.[0]?.message?.content || '';
  }

  async fetchModels(): Promise<string[]> {
    const url = 'https://openrouter.ai/api/v1/models';
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      const data = (await response.json()) as { data: OpenRouterModel[] };
      return (data.data || [])
        .filter((m) => !m.id.includes('nude') && !m.id.includes('nsfw'))
        .map((m) => m.id)
        .slice(0, 50);
    } catch {
      return [
        'anthropic/claude-3.5-sonnet',
        'anthropic/claude-3-opus',
        'openai/gpt-4o',
        'openai/gpt-4-turbo',
        'google/gemini-2.0-flash-001',
        'google/gemini-1.5-pro',
        'meta-llama/llama-3.1-405b-instruct',
        'mistralai/mistral-large',
        'deepseek/deepseek-chat',
      ];
    }
  }
}

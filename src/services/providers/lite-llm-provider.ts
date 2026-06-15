/**
 * LiteLLM API provider for Mirror VS.
 * LiteLLM provides a proxy that normalizes 100+ LLM APIs into an OpenAI-compatible format.
 * Supports local deployment and cloud-hosted instances.
 * Adapted from Roo Code's LiteLLM provider.
 */

import { BaseProvider, ChatMessage, ProviderConfig, StreamChunk } from './base-provider';

export class LiteLLMProvider extends BaseProvider {
  constructor(baseUrl: string, model: string = 'gpt-4o', apiKey?: string) {
    // Normalize base URL: remove trailing slash, ensure v1 path
    const normalizedUrl = baseUrl.replace(/\/+$/, '');

    super({
      id: 'litellm',
      name: 'LiteLLM',
      baseUrl: normalizedUrl,
      apiKey: apiKey || '',
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
    const url = `${this.config.baseUrl}/chat/completions`;

    const systemMessages = messages.filter((m) => m.role === 'system');
    const otherMessages = messages.filter((m) => m.role !== 'system');

    const openaiMessages = [
      ...(systemMessages.length > 0
        ? [{ role: 'system' as const, content: systemMessages.map((m) => m.content).join('\n\n') }]
        : []),
      ...otherMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
        ...(m.name ? { name: m.name } : {}),
      })),
    ];

    const body: any = {
      model: this.config.model,
      messages: openaiMessages,
      stream: true,
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
      stream_options: { include_usage: true },
    };

    if (tools && tools.length > 0) {
      body.tools = tools.map((t) => ({
        type: 'function',
        function: t,
      }));
    }

    const response = await this.httpPost(url, body, signal, {}, 120000);
    const sseStream = this.readSSEStream(response, signal);

    let fullText = '';
    let usageInput = 0;
    let usageOutput = 0;

    // Track in-progress tool calls
    const toolCallBuffers = new Map<number, { id: string; name: string; args: string }>();

    for await (const chunk of sseStream) {
      try {
        const parsed = JSON.parse(chunk);
        const choice = parsed.choices?.[0];

        if (choice?.delta?.content) {
          fullText += choice.delta.content;
          yield { type: 'text', content: choice.delta.content };
        }

        // Handle function tool calls
        if (choice?.delta?.tool_calls) {
          for (const tc of choice.delta.tool_calls) {
            const index = tc.index;
            if (index === undefined) continue;

            if (!toolCallBuffers.has(index)) {
              const entry = {
                id: tc.id || `litellm-tc-${index}`,
                name: tc.function?.name || '',
                args: '',
              };
              toolCallBuffers.set(index, entry);
              yield { type: 'tool_call_start', id: entry.id, name: entry.name };
            }

            const entry = toolCallBuffers.get(index)!;
            if (tc.function?.arguments) {
              entry.args += tc.function.arguments;
              yield { type: 'tool_call_delta', id: entry.id, delta: tc.function.arguments };
            }
          }

          // Check if any end events should fire
          // LiteLLM sends complete tool calls, we detect completions and emit end events
          for (const [index, entry] of toolCallBuffers) {
            if (entry.args && !entry.args.endsWith('...')) {
              try {
                JSON.parse(entry.args);
                // Successfully parsed = tool call is complete
                yield { type: 'tool_call_end', id: entry.id };
                toolCallBuffers.delete(index);
              } catch {
                // Still incomplete
              }
            }
          }
        }

        if (parsed.usage) {
          usageInput = parsed.usage.prompt_tokens || 0;
          usageOutput = parsed.usage.completion_tokens || 0;
        }
      } catch {
        // Skip unparseable
      }
    }

    // Emit any remaining tool call ends
    for (const [, entry] of toolCallBuffers) {
      yield { type: 'tool_call_end', id: entry.id };
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

    const response = await this.httpPost(url, body, signal);
    const data = (await response.json()) as any;
    return data.choices?.[0]?.message?.content || '';
  }

  async fetchModels(): Promise<string[]> {
    const url = `${this.config.baseUrl}/models`;
    try {
      const response = await fetch(url, {
        headers: this.buildHeaders(),
      });
      const data = (await response.json()) as any;
      return (data.data || data || []).map((m: any) => m.id || m.name || m).filter(Boolean);
    } catch {
      return ['gpt-4o', 'gpt-4-turbo', 'claude-3.5-sonnet', 'gemini-2.0-flash', 'command-r-plus'];
    }
  }
}

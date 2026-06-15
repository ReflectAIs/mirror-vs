/**
 * Base Provider abstraction for Mirror VS API providers.
 * Adapted from Roo Code's base-provider system.
 * All LLM providers (Ollama, Gemini, OpenRouter, LiteLLM, etc.) extend this.
 */

import * as vscode from 'vscode';

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  supportsStreaming: boolean;
  supportsToolCalling: boolean;
  supportsImages: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  images?: string[];
  tool_call_id?: string;
  name?: string;
}

export interface StreamChunk {
  type: 'text' | 'tool_call_start' | 'tool_call_delta' | 'tool_call_end' | 'usage' | 'thinking' | 'reasoning';
  content?: string;
  id?: string;
  name?: string;
  delta?: string;
  inputTokens?: number;
  outputTokens?: number;
  arguments?: string;
  index?: number;
}

export abstract class BaseProvider {
  protected config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  get id(): string {
    return this.config.id;
  }

  get name(): string {
    return this.config.name;
  }

  get model(): string {
    return this.config.model;
  }

  /**
   * Stream a chat completion. Yields parsed stream chunks.
   */
  abstract streamChat(
    messages: ChatMessage[],
    signal: AbortSignal,
    tools?: object[],
  ): AsyncGenerator<StreamChunk>;

  /**
   * Non-streaming single completion (for simple prompts).
   */
  abstract complete(prompt: string, signal: AbortSignal): Promise<string>;

  /**
   * Fetch available models from the provider.
   */
  abstract fetchModels(): Promise<string[]>;

  /**
   * Build headers for API requests.
   */
  protected buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }
    return headers;
  }

  /**
   * Build a common HTTP fetch with timeout and abort support.
   */
  protected async httpPost(
    endpoint: string,
    body: object,
    signal: AbortSignal,
    extraHeaders?: Record<string, string>,
    timeoutMs = 60000,
  ): Promise<Response> {
    const headers = { ...this.buildHeaders(), ...extraHeaders };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    signal.addEventListener('abort', () => controller.abort());

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Read a streaming response line by line, yielding SSE data.
   */
  protected async *readSSEStream(
    response: Response,
    signal: AbortSignal,
  ): AsyncGenerator<string> {
    if (!response.ok || !response.body) {
      const text = await response.text();
      throw new Error(`Provider error: HTTP ${response.status} - ${text}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6);
            if (data === '[DONE]') return;
            yield data;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

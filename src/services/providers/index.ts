/**
 * Provider registry — exports all available LLM providers for Mirror VS.
 */

export { BaseProvider } from './base-provider';
export type { ChatMessage, ProviderConfig, StreamChunk } from './base-provider';

export { GeminiProvider } from './gemini-provider';
export { OpenRouterProvider } from './openrouter-provider';
export { LiteLLMProvider } from './lite-llm-provider';

import { BaseProvider } from './base-provider';
import { GeminiProvider } from './gemini-provider';
import { OpenRouterProvider } from './openrouter-provider';
import { LiteLLMProvider } from './lite-llm-provider';

/**
 * Create a provider instance from a configuration.
 */
export function createProvider(config: {
  provider: 'gemini' | 'openrouter' | 'litellm';
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}): BaseProvider {
  switch (config.provider) {
    case 'gemini':
      return new GeminiProvider(config.apiKey || '', config.model || 'gemini-2.0-flash');
    case 'openrouter':
      return new OpenRouterProvider(config.apiKey || '', config.model || 'anthropic/claude-3.5-sonnet');
    case 'litellm':
      return new LiteLLMProvider(
        config.baseUrl || 'http://localhost:4000/v1',
        config.model || 'gpt-4o',
        config.apiKey,
      );
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}

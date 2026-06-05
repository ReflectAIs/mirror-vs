/**
 * Provider fallback manager for Mirror VS.
 * Fallback is disabled — each provider surfaces its own errors directly.
 */

import { LLMProvider } from '../types';

export class ProviderFallback {
  private static instance: ProviderFallback;
  private _currentProvider: LLMProvider = 'ollama';

  static getInstance(): ProviderFallback {
    if (!ProviderFallback.instance) {
      ProviderFallback.instance = new ProviderFallback();
    }
    return ProviderFallback.instance;
  }

  get currentProvider(): LLMProvider {
    return this._currentProvider;
  }

  /**
   * No automatic fallback — always returns null.
   */
  getNextProvider(): LLMProvider | null {
    return null;
  }

  /**
   * Fallback is disabled. Always returns success: false so the
   * error is propagated directly to the user instead of silently
   * switching to a backup provider.
   */
  failover(): { success: boolean; newProvider?: LLMProvider; message: string } {
    return {
      success: false,
      message: 'Provider error. Please check your connection settings and try again.',
    };
  }

  /**
   * Always true since there is no cooldown logic.
   */
  canRetryPrimary(): boolean {
    return true;
  }

  /**
   * Reset the fallback state for a new session.
   */
  reset(initialProvider: LLMProvider = 'ollama'): void {
    this._currentProvider = initialProvider;
  }

  /**
   * Get the list of attempted (failed) providers.
   */
  getAttemptedProviders(): LLMProvider[] {
    return [this._currentProvider];
  }

  /**
   * Manually set the current provider.
   */
  setProvider(provider: LLMProvider): void {
    this._currentProvider = provider;
  }
}

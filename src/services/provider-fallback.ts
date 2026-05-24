
/**
 * Provider fallback manager for Mirror VS.
 * Automatically falls back between Ollama and DeepSeek when one is unavailable.
 */

import { LLMProvider } from '../types';

export class ProviderFallback {
  private static instance: ProviderFallback;
  private _currentProvider: LLMProvider = 'ollama';
  private _attemptedProviders: Set<LLMProvider> = new Set();
  private _lastFailoverTime = 0;
  private _failoverCooldownMs = 60000; // 1 minute cooldown before retrying primary

  /**
   * Ordered provider preference for fallback chain
   */
  private readonly _providerChain: LLMProvider[] = ['ollama', 'deepseek'];

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
   * Get the next provider in the fallback chain
   */
  getNextProvider(): LLMProvider | null {
    const currentIndex = this._providerChain.indexOf(this._currentProvider);
    if (currentIndex === -1) {
      // Reset to first provider
      this._currentProvider = this._providerChain[0];
      return this._currentProvider;
    }

    const nextIndex = currentIndex + 1;
    if (nextIndex >= this._providerChain.length) {
      // All providers exhausted
      return null;
    }

    return this._providerChain[nextIndex];
  }

  /**
   * Trigger a failover to the next provider in the chain
   */
  failover(): { success: boolean; newProvider?: LLMProvider; message: string } {
    const nextProvider = this.getNextProvider();
    if (!nextProvider) {
      this._attemptedProviders.clear();
      return {
        success: false,
        message: 'All providers exhausted. Please check your API configurations and try again.',
      };
    }

    this._currentProvider = nextProvider;
    this._attemptedProviders.add(nextProvider);
    this._lastFailoverTime = Date.now();

    return {
      success: true,
      newProvider: nextProvider,
      message: `Automatically switched to ${nextProvider === 'ollama' ? 'Ollama (local)' : 'DeepSeek (cloud)'} after provider failure.`,
    };
  }

  /**
   * Check if we can retry the original provider (cooldown elapsed)
   */
  canRetryPrimary(): boolean {
    if (this._attemptedProviders.size === 0) return true;
    const elapsed = Date.now() - this._lastFailoverTime;
    return elapsed >= this._failoverCooldownMs;
  }

  /**
   * Reset the fallback state for a new session
   */
  reset(initialProvider: LLMProvider = 'ollama'): void {
    this._currentProvider = initialProvider;
    this._attemptedProviders.clear();
    this._attemptedProviders.add(initialProvider);
    this._lastFailoverTime = 0;
  }

  /**
   * Get the list of attempted (failed) providers
   */
  getAttemptedProviders(): LLMProvider[] {
    return Array.from(this._attemptedProviders);
  }

  /**
   * Manually set the current provider
   */
  setProvider(provider: LLMProvider): void {
    this._currentProvider = provider;
    this._attemptedProviders.add(provider);
  }
}

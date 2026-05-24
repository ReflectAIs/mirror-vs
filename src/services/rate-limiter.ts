
/**
 * Rate limiter and token budget enforcement for Mirror VS.
 * Prevents runaway API costs by limiting tokens per session and per turn.
 */

interface TokenUsageEntry {
  timestamp: number;
  inputTokens: number;
  outputTokens: number;
}

export class RateLimiter {
  private static instance: RateLimiter;
  private sessionUsage: Map<string, TokenUsageEntry[]> = new Map();

  // Default budgets
  private _maxTokensPerTurn = 32000; // Max combined tokens (input + output) per LLM call
  private _maxTokensPerSession = 500000; // Max total tokens across entire session
  private _maxImagesPerTurn = 5; // Max images per user message
  private _maxConsecutiveFailures = 5; // Circuit breaker after N consecutive fails
  private _consecutiveFailures = 0;

  static getInstance(): RateLimiter {
    if (!RateLimiter.instance) {
      RateLimiter.instance = new RateLimiter();
    }
    return RateLimiter.instance;
  }

  /**
   * Reset the rate limiter for a new session
   */
  resetSession(sessionId: string): void {
    this.sessionUsage.set(sessionId, []);
    this._consecutiveFailures = 0;
  }

  /**
   * Get current session token usage
   */
  getSessionUsage(sessionId: string): { total: number; input: number; output: number; cost: number } {
    const entries = this.sessionUsage.get(sessionId) || [];
    const totals = entries.reduce(
      (acc, e) => ({
        input: acc.input + e.inputTokens,
        output: acc.output + e.outputTokens,
      }),
      { input: 0, output: 0 },
    );
    const total = totals.input + totals.output;
    // DeepSeek pricing: $0.14/M input, $0.28/M output
    const cost = (totals.input / 1000000) * 0.14 + (totals.output / 1000000) * 0.28;
    return { total, input: totals.input, output: totals.output, cost };
  }

  /**
   * Record token usage for a specific session
   */
  recordUsage(sessionId: string, inputTokens: number, outputTokens: number): void {
    const entries = this.sessionUsage.get(sessionId) || [];
    entries.push({
      timestamp: Date.now(),
      inputTokens,
      outputTokens,
    });
    this.sessionUsage.set(sessionId, entries);

    // Reset failure counter on success
    this._consecutiveFailures = 0;
  }

  /**
   * Check if a new LLM call would exceed the turn budget
   */
  checkTurnBudget(inputTokens: number, estimatedOutputTokens: number): { allowed: boolean; reason?: string } {
    const combined = inputTokens + estimatedOutputTokens;
    if (combined > this._maxTokensPerTurn) {
      return {
        allowed: false,
        reason: `Token budget exceeded: ${combined} tokens would exceed max ${this._maxTokensPerTurn} per turn. Please simplify your request.`,
      };
    }
    return { allowed: true };
  }

  /**
   * Check if a session has exceeded its total budget
   */
  checkSessionBudget(sessionId: string, additionalTokens: number): { allowed: boolean; reason?: string } {
    const usage = this.getSessionUsage(sessionId);
    if (usage.total + additionalTokens > this._maxTokensPerSession) {
      return {
        allowed: false,
        reason: `Session token budget exceeded: ${usage.total + additionalTokens} tokens would exceed max ${this._maxTokensPerSession} per session. Start a new session.`,
      };
    }
    return { allowed: true };
  }

  /**
   * Check image count per turn
   */
  checkImageBudget(imageCount: number): { allowed: boolean; reason?: string } {
    if (imageCount > this._maxImagesPerTurn) {
      return {
        allowed: false,
        reason: `Too many images: ${imageCount} images exceed the max of ${this._maxImagesPerTurn} per turn.`,
      };
    }
    return { allowed: true };
  }

  /**
   * Circuit breaker: check if consecutive failures have exceeded threshold
   */
  checkCircuitBreaker(): { allowed: boolean; reason?: string } {
    if (this._consecutiveFailures >= this._maxConsecutiveFailures) {
      return {
        allowed: false,
        reason: `Circuit breaker active: ${this._consecutiveFailures} consecutive failures detected. Please check your API/provider configuration or start a new session.`,
      };
    }
    return { allowed: true };
  }

  /**
   * Record a failure (for circuit breaker)
   */
  recordFailure(): void {
    this._consecutiveFailures++;
  }

  /**
   * Get maximum tokens per turn
   */
  get maxTokensPerTurn(): number {
    return this._maxTokensPerTurn;
  }

  /**
   * Estimate token count from text (rough estimate: ~4 chars per token)
   */
  static estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}


/**
 * Telemetry and diagnostics service for Mirror VS.
 * Tracks token usage, latency, errors, and model usage across sessions.
 */

import { TelemetryData } from '../types';

interface TelemetryEntry {
  sessionId: string;
  sessionTitle: string;
  timestamp: number;
  tokensInput: number;
  tokensOutput: number;
  cost: number;
  latency: number; // ms
  provider: string;
  model: string;
  error: boolean;
  errorMessage?: string;
  toolCalls: number;
}

export class TelemetryService {
  private static instance: TelemetryService;
  private entries: TelemetryEntry[] = [];
  private maxEntries = 1000;

  static getInstance(): TelemetryService {
    if (!TelemetryService.instance) {
      TelemetryService.instance = new TelemetryService();
    }
    return TelemetryService.instance;
  }

  /**
   * Record a telemetry entry for an LLM call
   */
  recordCall(params: {
    sessionId: string;
    sessionTitle: string;
    tokensInput: number;
    tokensOutput: number;
    cost: number;
    latency: number;
    provider: string;
    model: string;
    error?: boolean;
    errorMessage?: string;
    toolCalls?: number;
  }): void {
    this.entries.push({
      sessionId: params.sessionId,
      sessionTitle: params.sessionTitle,
      timestamp: Date.now(),
      tokensInput: params.tokensInput,
      tokensOutput: params.tokensOutput,
      cost: params.cost,
      latency: params.latency,
      provider: params.provider,
      model: params.model,
      error: params.error || false,
      errorMessage: params.errorMessage,
      toolCalls: params.toolCalls || 0,
    });

    // Trim old entries if exceeding max
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(this.entries.length - this.maxEntries);
    }
  }

  /**
   * Get aggregated telemetry data
   */
  getTelemetryData(sessionId?: string): TelemetryData {
    const filtered = sessionId
      ? this.entries.filter((e) => e.sessionId === sessionId)
      : this.entries;

    const totalTokensInput = filtered.reduce((sum, e) => sum + e.tokensInput, 0);
    const totalTokensOutput = filtered.reduce((sum, e) => sum + e.tokensOutput, 0);
    const totalCost = filtered.reduce((sum, e) => sum + e.cost, 0);
    const totalLatency = filtered.reduce((sum, e) => sum + e.latency, 0);
    const _totalToolCalls = filtered.reduce((sum, e) => sum + e.toolCalls, 0);
    const _totalErrors = filtered.filter((e) => e.error).length;

    // Errors by provider
    const errorsByProviderMap = new Map<string, number>();
    filtered.filter((e) => e.error).forEach((e) => {
      errorsByProviderMap.set(e.provider, (errorsByProviderMap.get(e.provider) || 0) + 1);
    });

    // Top models
    const modelCountMap = new Map<string, number>();
    filtered.forEach((e) => {
      modelCountMap.set(e.model, (modelCountMap.get(e.model) || 0) + 1);
    });

    // Session history aggregation
    const sessionMap = new Map<string, {
      sessionId: string;
      title: string;
      tokensInput: number;
      tokensOutput: number;
      cost: number;
      latency: number;
      errorCount: number;
    }>();

    this.entries.forEach((e) => {
      const existing = sessionMap.get(e.sessionId);
      if (existing) {
        existing.tokensInput += e.tokensInput;
        existing.tokensOutput += e.tokensOutput;
        existing.cost += e.cost;
        existing.latency = (existing.latency + e.latency) / 2; // average
        if (e.error) existing.errorCount++;
      } else {
        sessionMap.set(e.sessionId, {
          sessionId: e.sessionId,
          title: e.sessionTitle,
          tokensInput: e.tokensInput,
          tokensOutput: e.tokensOutput,
          cost: e.cost,
          latency: e.latency,
          errorCount: e.error ? 1 : 0,
        });
      }
    });

    const uniqueSessions = new Set(this.entries.map((e) => e.sessionId));

    return {
      totalSessions: uniqueSessions.size,
      totalMessages: filtered.length,
      totalTurns: filtered.length,
      totalTokensInput,
      totalTokensOutput,
      totalCost,
      errorsByProvider: Array.from(errorsByProviderMap.entries()).map(([provider, count]) => ({
        provider,
        count,
      })),
      averageLatency: filtered.length > 0 ? totalLatency / filtered.length : 0,
      topModels: Array.from(modelCountMap.entries())
        .map(([model, count]) => ({ model, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      sessionHistory: Array.from(sessionMap.values()),
    };
  }

  /**
   * Clear all telemetry data
   */
  clearAll(): void {
    this.entries = [];
  }

  /**
   * Get all raw entries for debugging
   */
  getEntries(): TelemetryEntry[] {
    return [...this.entries];
  }
}

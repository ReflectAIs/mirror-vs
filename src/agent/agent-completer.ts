
import { LLMProvider, ChatMessage } from '../types';
import { streamOllamaChat, streamDeepSeekChat } from '../services/api-service';
import { RateLimiter } from '../services/rate-limiter';
import { TelemetryService } from '../services/telemetry-service';
import { AgentParser } from './agent-parser';

/** Handles LLM streaming completion calls and context summarization */
export class AgentCompleter {
  private readonly _rateLimiter = RateLimiter.getInstance();
  private readonly _telemetry = TelemetryService.getInstance();
  private readonly _parser = new AgentParser();
  private _lastLatencyMeasurement = 0;

  constructor(
    private readonly _postMessage: (msg: any) => void,
  ) {}

  public get lastLatency(): number {
    return this._lastLatencyMeasurement;
  }

  /**
   * Get a completion from the LLM via streaming.
   * Returns the full assistant response text.
   */
  public async getLLMCompletion(
    provider: LLMProvider,
    host: string,
    model: string,
    apiKey: string,
    payload: ChatMessage[],
    signal: AbortSignal,
    sessionId: string,
    abortController: AbortController,
  ): Promise<string> {
    let fullResponse = "";
    let toolCallBuffer = "";
    const startTime = Date.now();
    let totalTokens = 0;
    const isDeepSeek = provider === 'deepseek';

    this._postMessage({ type: "streamStart" });

    try {
      if (isDeepSeek) {
        await streamDeepSeekChat(
          host,
          model,
          apiKey,
          payload,
          signal,
          (chunk) => {
            if (signal.aborted) return;
            fullResponse += chunk;
            toolCallBuffer += chunk;
            totalTokens += RateLimiter.estimateTokens(chunk);
            this._postMessage({
              type: "chatResponseChunk",
              text: chunk,
            });

            // Emit tool call status if we detect a tool tag
            const parsed = this._parser.parseToolCalls(toolCallBuffer);
            if (parsed.length > 0) {
              for (const tc of parsed) {
                this._postMessage({
                  type: "toolStatus",
                  toolName: tc.name,
                  status: "running",
                  target: tc.params.path || tc.params.url || tc.params.selector || "",
                });
              }
              toolCallBuffer = "";
            }
          },
          abortController,
        );
      } else {
        await streamOllamaChat(
          host,
          model,
          payload,
          signal,
          (chunk) => {
            if (signal.aborted) return;
            fullResponse += chunk;
            toolCallBuffer += chunk;
            totalTokens += RateLimiter.estimateTokens(chunk);
            this._postMessage({
              type: "chatResponseChunk",
              text: chunk,
            });

            const parsed = this._parser.parseToolCalls(toolCallBuffer);
            if (parsed.length > 0) {
              for (const tc of parsed) {
                this._postMessage({
                  type: "toolStatus",
                  toolName: tc.name,
                  status: "running",
                  target: tc.params.path || tc.params.url || tc.params.selector || "",
                });
              }
              toolCallBuffer = "";
            }
          },
          abortController,
        );
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        this._postMessage({ type: "streamEnd" });
        return fullResponse;
      }
      throw err;
    }

    this._postMessage({ type: "streamEnd" });

    const elapsed = Date.now() - startTime;
    this._lastLatencyMeasurement = elapsed;

    // Telemetry
    this._telemetry.record({
      provider,
      model,
      outputTokens: totalTokens,
      latency: elapsed,
      timestamp: Date.now(),
    });

    return fullResponse;
  }

  /**
   * Summarize a set of chat messages into a compact context.
   * Used to compress middle turns and stay within context window.
   */
  public async summarizeHistory(
    provider: LLMProvider,
    host: string,
    model: string,
    apiKey: string,
    messages: ChatMessage[],
  ): Promise<string> {
    const summaryPrompt: ChatMessage[] = [
      {
        role: "system",
        content: `You are a summarization assistant. Compress the following conversation turns into a single short paragraph that preserves all key information: decisions made, files changed, errors encountered, and next steps. Do NOT include any tool calls or XML tags in your summary. Keep it under 200 words.`,
      },
      ...messages,
      {
        role: "user",
        content: "Please provide a concise summary of the above conversation turns.",
      },
    ];

    const isDeepSeek = provider === 'deepseek';
    let fullResponse = "";

    if (isDeepSeek) {
      await streamDeepSeekChat(
        host,
        model,
        apiKey,
        summaryPrompt,
        new AbortController().signal,
        (chunk) => { fullResponse += chunk; },
        new AbortController(),
      );
    } else {
      await streamOllamaChat(
        host,
        model,
        summaryPrompt,
        new AbortController().signal,
        (chunk) => { fullResponse += chunk; },
        new AbortController(),
      );
    }

    return fullResponse.trim() || "Summary generation failed.";
  }
}

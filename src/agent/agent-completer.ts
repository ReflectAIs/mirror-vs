
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
    messages: { role: 'user' | 'assistant' | 'system'; content: string; images?: string[] }[],
    payload: ChatMessage[],
    signal: AbortSignal,
    currentSessionId: string,
    completionController?: AbortController,
    sessionId: string,
    abortController: AbortController,
  ): Promise<string> {
    let fullResponse = "";
    let toolCallBuffer = "";
    const startTime = Date.now();
    return new Promise((resolve, reject) => {
      let fullText = '';
      let isFinished = false;
      let capturedUsage: { promptTokens: number; completionTokens: number } | undefined;

      const onComplete = (completedText: string, usage?: { promptTokens: number; completionTokens: number }) => {
        if (isFinished) return;
        isFinished = true;
        const cleaned = this._parser.getCleanedToolResponse(completedText);
        this._postMessage({ type: 'chatResponseComplete', fullText: cleaned });

        if (usage) {
          capturedUsage = usage;
          const inputTokens = usage.promptTokens;
          const outputTokens = usage.completionTokens;
          const isDeepSeek = provider === 'deepseek';
          const inputCost = isDeepSeek ? (inputTokens / 1000000) * 0.14 : 0;
          const outputCost = isDeepSeek ? (outputTokens / 1000000) * 0.28 : 0;
          const totalCost = inputCost + outputCost;

          this._postMessage({
            type: 'tokenUsage',
            usage: {
              input: inputTokens,
              output: outputTokens,
              total: inputTokens + outputTokens,
              cost: totalCost,
            },
          });

          this._rateLimiter.recordUsage(currentSessionId, inputTokens, outputTokens);

          const latency = Date.now() - startTime;
          this._lastLatencyMeasurement = latency;
          this._telemetry.recordCall({
            sessionId: currentSessionId,
            sessionTitle: 'Active Session',
            tokensInput: inputTokens,
            tokensOutput: outputTokens,
            cost: totalCost,
            latency,
            provider,
            model,
            error: false,
            toolCalls: this._parser.parseToolCalls(completedText).length,
          });
        }

        resolve(cleaned);
      };

      const onError = (err: any) => {
        if (isFinished) return;
        isFinished = true;

        const latency = Date.now() - startTime;
        const inputTokens = RateLimiter.estimateTokens(JSON.stringify(messages));
        const outputTokens = RateLimiter.estimateTokens(fullText);
        this._telemetry.recordCall({
          sessionId: currentSessionId,
          sessionTitle: 'Active Session',
          tokensInput: inputTokens,
          tokensOutput: outputTokens,
          cost: 0,
          latency,
          provider,
          model,
          error: true,
          errorMessage: err.message || 'Unknown error',
        });
    let totalTokens = 0;
    const isDeepSeek = provider === 'deepseek';

        this._rateLimiter.recordFailure();
        reject(err);
      };
    this._postMessage({ type: "streamStart" });

      if (provider === 'ollama') {
        streamOllamaChat(
    try {
      if (isDeepSeek) {
        await streamDeepSeekChat(
          host,
          model,
          messages,
          apiKey,
          payload,
          signal,
          (chunk) => {
            if (isFinished) return;
            fullText += chunk;
            this._postMessage({ type: 'chatResponseChunk', text: chunk });
            if (signal.aborted) return;
            fullResponse += chunk;
            toolCallBuffer += chunk;
            totalTokens += RateLimiter.estimateTokens(chunk);
            this._postMessage({
              type: "chatResponseChunk",
              text: chunk,
            });

            if (this._parser.hasCompleteToolCall(fullText)) {
              completionController?.abort();
              onComplete(fullText, capturedUsage);
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
          (completedText, usage) => {
            if (usage) capturedUsage = usage;
            onComplete(completedText, usage);
          },
          onError,
          abortController,
        );
      } else {
        streamDeepSeekChat(
          apiKey,
        await streamOllamaChat(
          host,
          model,
          messages,
          payload,
          signal,
          (chunk) => {
            if (isFinished) return;
            fullText += chunk;
            this._postMessage({ type: 'chatResponseChunk', text: chunk });
            if (signal.aborted) return;
            fullResponse += chunk;
            toolCallBuffer += chunk;
            totalTokens += RateLimiter.estimateTokens(chunk);
            this._postMessage({
              type: "chatResponseChunk",
              text: chunk,
            });

            if (this._parser.hasCompleteToolCall(fullText)) {
              completionController?.abort();
              onComplete(fullText, capturedUsage);
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
          (completedText, usage) => {
            if (usage) capturedUsage = usage;
            onComplete(completedText, usage);
          },
          onError,
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
   * Summarize conversation history for context compression.
   * Summarize a set of chat messages into a compact context.
   * Used to compress middle turns and stay within context window.
   */
  public async summarizeHistory(
    provider: LLMProvider,
    host: string,
    model: string,
    apiKey: string,
    historyToSummarize: ChatMessage[],
    messages: ChatMessage[],
  ): Promise<string> {
    const summarizePrompt = 'You are a helpful pair programming assistant. Please summarize the following conversation history between a developer and an AI assistant. Provide a highly dense, bulleted summary of key decisions, context details, executed actions, and technical changes. Do not lose key file names, error messages, or environment information:\n';
    + historyToSummarize.map((msg) => msg.role.toUpperCase() + ': ' + msg.content).join('\n\n');

    const messages = [{ role: 'user' as const, content: summarizePrompt }];

    return new Promise<string>((resolve, reject) => {
      const controller = new AbortController();
      if (provider === 'ollama') {
        streamOllamaChat(
          host,
          model,
          messages,
          controller.signal,
          () => {},
          (fullText) => resolve(fullText),
          (err) => reject(err),
        );
      } else {
        streamDeepSeekChat(
          apiKey,
          model,
          messages,
          controller.signal,
          () => {},
          (fullText) => resolve(fullText),
          (err) => reject(err),
        );
      }
    });
  }
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

  /** Parse tool calls from text */
  public parseToolCalls(text: string) {
    return this._parser.parseToolCalls(text);
  }
    const isDeepSeek = provider === 'deepseek';
    let fullResponse = "";

  /** Get cleaned tool response */
  public getCleanedToolResponse(text: string) {
    return this._parser.getCleanedToolResponse(text);
  }
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

  /** Check if text has complete tool call */
  public hasCompleteToolCall(text: string) {
    return this._parser.hasCompleteToolCall(text);
    return fullResponse.trim() || "Summary generation failed.";
  }
}

import { LLMProvider, ChatMessage } from '../types';
import { streamOllamaChat, streamDeepSeekChat } from '../services/api-service';
import { RateLimiter } from '../services/rate-limiter';
import { TelemetryService } from '../services/telemetry-service';
import { AgentParser } from './agent-parser';
import { ToolCall } from './types';

/** Handles LLM streaming completion calls and context summarization */
export class AgentCompleter {
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
    _sessionId: string,
    _abortController: AbortController,
  ): Promise<string> {
    let fullResponse = '';
    let toolCallBuffer = '';
    const startTime = Date.now();
    let totalTokens = 0;
    const isDeepSeek = provider === 'deepseek';

    this._postMessage({ type: 'streamStart' });

    return new Promise<string>((resolve, reject) => {
      const wrappedOnError = (err: any) => {
        if (err.name === 'AbortError') {
          this._postMessage({ type: 'streamEnd' });
          resolve(fullResponse);
          return;
        }
        this._postMessage({ type: 'streamEnd' });
        reject(err);
      };

      const onChunk = (chunk: string) => {
        if (signal.aborted) return;
        fullResponse += chunk;
        toolCallBuffer += chunk;
        totalTokens += RateLimiter.estimateTokens(chunk);
        this._postMessage({
          type: 'chatResponseChunk',
          text: chunk,
        });

        // Emit tool call status if we detect a tool tag
        const parsed: ToolCall[] = this._parser.parseToolCalls(toolCallBuffer);
        if (parsed.length > 0) {
          for (const tc of parsed) {
            this._postMessage({
              type: 'toolStatus',
              toolName: tc.name,
              status: 'running',
              target: tc.path || tc.url || tc.selector || '',
            });
          }
          toolCallBuffer = '';
        }
      };

      const wrappedOnComplete = (fullText: string) => {
        fullResponse = fullText;
        this._postMessage({ type: 'streamEnd' });

        const elapsed = Date.now() - startTime;
        this._lastLatencyMeasurement = elapsed;

        // Telemetry
        this._telemetry.recordCall({
          sessionId: '',
          sessionTitle: '',
          tokensInput: 0,
          tokensOutput: totalTokens,
          cost: 0,
          latency: elapsed,
          provider,
          model,
        });

        resolve(fullResponse);
      };

      if (isDeepSeek) {
        streamDeepSeekChat(
          apiKey,
          model,
          payload,
          signal,
          onChunk,
          wrappedOnComplete,
          wrappedOnError,
        );
      } else {
        streamOllamaChat(
          host,
          model,
          payload,
          signal,
          onChunk,
          wrappedOnComplete,
          wrappedOnError,
        );
      }
    });
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
        role: 'system',
        content: `You are a summarization assistant. Compress the following conversation turns into a single short paragraph that preserves all key information: decisions made, files changed, errors encountered, and next steps. Do NOT include any tool calls or XML tags in your summary. Keep it under 200 words.`,
      },
      ...messages,
      {
        role: 'user',
        content: 'Please provide a concise summary of the above conversation turns.',
      },
    ];

    const isDeepSeek = provider === 'deepseek';
    let fullResponse = '';

    return new Promise<string>((resolve) => {
      const onChunk = (chunk: string) => {
        fullResponse += chunk;
      };

      const onComplete = (fullText: string) => {
        resolve(fullText.trim() || 'Summary generation failed.');
      };

      const onError = () => {
        resolve('Summary generation failed.');
      };

      if (isDeepSeek) {
        streamDeepSeekChat(
          apiKey,
          model,
          summaryPrompt,
          new AbortController().signal,
          onChunk,
          onComplete,
          onError,
        );
      } else {
        streamOllamaChat(
          host,
          model,
          summaryPrompt,
          new AbortController().signal,
          onChunk,
          onComplete,
          onError,
        );
      }
    });
  }
}

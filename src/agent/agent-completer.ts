import { LLMProvider, ChatMessage } from '../types';
import { streamOllamaChat, streamDeepSeekChat } from '../services/api-service';
import { RateLimiter } from '../services/rate-limiter';
import { TelemetryService } from '../services/telemetry-service';
import { AgentParser } from './agent-parser';

/** Handles LLM streaming completion calls and context summarization */
export class AgentCompleter {
  private readonly _telemetry = TelemetryService.getInstance();
  private readonly _parser = new AgentParser();
  private _lastLatencyMeasurement = 0;

  constructor(
    private readonly _postMessage: (msg: Record<string, unknown>) => void,
  ) {}

  public get lastLatency(): number {
    return this._lastLatencyMeasurement;
  }

  /**
   * Get a completion from the LLM via streaming.
   * Returns the full assistant response text.
   *
   * Signature matches orchestrator call:
   *   getLLMCompletion(provider, host, model, apiKey, messages, signal, sessionId, abortController)
   */
  public async getLLMCompletion(
    provider: LLMProvider,
    host: string,
    model: string,
    apiKey: string,
    messages: ChatMessage[],
    signal: AbortSignal,
    _sessionId: string,
    abortController: AbortController,
  ): Promise<string> {
    const startTime = performance.now();

    return new Promise<string>((resolve, reject) => {
      let fullResponse = '';

      const onChunk = (chunk: string) => {
        fullResponse += chunk;
        this._postMessage({ type: 'chatResponse', text: chunk, sessionId: _sessionId });
      };

      const onComplete = (fullText: string, _usage?: { promptTokens: number; completionTokens: number }) => {
        this._lastLatencyMeasurement = performance.now() - startTime;
        this._telemetry.recordLatency(this._lastLatencyMeasurement);
        resolve(fullText);
      };

      const onError = (err: Error) => {
        reject(err);
      };

      // Wire abort signals: if outer signal aborts, cancel the completion
      if (signal.aborted) {
        reject(new Error('Operation cancelled'));
        return;
      }

      if (provider === 'deepseek') {
        streamDeepSeekChat(
          apiKey,
          model,
          messages,
          abortController.signal,
          onChunk,
          onComplete,
          onError,
        );
      } else {
        streamOllamaChat(
          host,
          model,
          messages,
          abortController.signal,
          onChunk,
          onComplete,
          onError,
        );
      }
    });
  }

  /**
   * Generate a summary of conversation turns to compress context.
   */
  public async generateSummary(
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

    return new Promise<string>((resolve) => {
      const onComplete = (fullText: string) => {
        resolve(fullText.trim() || 'Summary generation failed.');
      };

      const onError = () => {
        resolve('Summary generation failed.');
      };

      const onChunk = (_chunk: string) => {
        // Chunks are accumulated into the fullText parameter of onComplete
      };

      if (provider === 'deepseek') {
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
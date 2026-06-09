import { LLMProvider, ChatMessage } from '../types';
import { streamOllamaChat, streamDeepSeekChat, streamCustomOpenAIChat } from '../services/api-service';
import { TelemetryService } from '../services/telemetry-service';
import * as fs from 'fs';
import * as path from 'path';
import { estimateTokenCount } from './orchestrator-config';

/** Handles LLM streaming completion calls and context summarization */
export class AgentCompleter {
  private readonly _telemetry = TelemetryService.getInstance();
  private _lastLatencyMeasurement = 0;

  constructor(private readonly _postMessage: (msg: Record<string, unknown>) => void) {}

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
    workspaceRoot?: string,
  ): Promise<string> {
    const startTime = performance.now();

    return new Promise<string>((resolve, reject) => {
      let settled = false;

      const safeResolve = (val: string) => {
        if (settled) return;
        settled = true;
        resolve(val);
      };

      const safeReject = (err: Error) => {
        if (settled) return;
        settled = true;
        reject(err);
      };

      const onChunk = (chunk: string) => {
        this._postMessage({ type: 'chatResponseChunk', text: chunk, sessionId: _sessionId });
      };

      const onReasoningChunk = (reasoningChunk: string) => {
        this._postMessage({
          type: 'chatResponseChunk',
          text: '',
          reasoningText: reasoningChunk,
          sessionId: _sessionId,
        });
      };

      const onComplete = (fullText: string, _usage?: { promptTokens: number; completionTokens: number }) => {
        this._lastLatencyMeasurement = performance.now() - startTime;
        let inputTokens = _usage?.promptTokens ?? 0;
        let outputTokens = _usage?.completionTokens ?? 0;

        // Failsafe fallback: estimate tokens if API didn't return usage
        if (inputTokens === 0) {
          inputTokens = messages.reduce((sum, msg) => sum + estimateTokenCount(msg.content), 0);
        }
        if (outputTokens === 0) {
          outputTokens = estimateTokenCount(fullText);
        }

        const totalTokens = inputTokens + outputTokens;

        let rateInput = 0.0;
        let rateOutput = 0.0;

        if (provider === 'deepseek') {
          if (model.toLowerCase().includes('reasoner') || model.toLowerCase().includes('r1')) {
            rateInput = 0.00055 / 1000;
            rateOutput = 0.00219 / 1000;
          } else {
            rateInput = 0.00014 / 1000;
            rateOutput = 0.00028 / 1000;
          }
        } else if (provider === 'custom' || (typeof provider === 'string' && provider.startsWith('custom_'))) {
          if (model.toLowerCase().includes('gpt-4o-mini')) {
            rateInput = 0.00015 / 1000;
            rateOutput = 0.00060 / 1000;
          } else if (model.toLowerCase().includes('gpt-4o')) {
            rateInput = 0.005 / 1000;
            rateOutput = 0.015 / 1000;
          } else if (model.toLowerCase().includes('deepseek')) {
            if (model.toLowerCase().includes('reasoner') || model.toLowerCase().includes('r1')) {
              rateInput = 0.00055 / 1000;
              rateOutput = 0.00219 / 1000;
            } else {
              rateInput = 0.00014 / 1000;
              rateOutput = 0.00028 / 1000;
            }
          }
        }

        const cost = inputTokens * rateInput + outputTokens * rateOutput;

        this._telemetry.recordCall({
          sessionId: _sessionId,
          sessionTitle: '',
          tokensInput: inputTokens,
          tokensOutput: outputTokens,
          cost: cost,
          latency: this._lastLatencyMeasurement,
          provider: provider,
          model: model,
        });

        this._postMessage({
          type: 'tokenUsage',
          usage: {
            input: inputTokens,
            output: outputTokens,
            total: totalTokens,
            cost: cost,
          },
        });

        // Write debug turns.log if workspaceRoot is provided
        if (workspaceRoot) {
          try {
            const logPath = path.join(workspaceRoot, 'turns.log');
            const logDivider = '='.repeat(80) + '\n';
            const subDivider = '-'.repeat(80) + '\n';
            let logContent = logDivider;
            logContent += `TIMESTAMP: ${new Date().toISOString()}\n`;
            logContent += `SESSION ID: ${_sessionId}\n`;
            logContent += `PROVIDER: ${provider} | MODEL: ${model}\n`;
            logContent += subDivider;
            logContent += `>>> PAYLOAD SENT TO MODEL >>>\n`;
            for (const msg of messages) {
              logContent += `[${msg.role.toUpperCase()}]:\n${msg.content}\n\n`;
            }
            logContent += subDivider;
            logContent += `<<< MODEL RESPONSE GENERATED <<<\n${fullText}\n`;
            logContent += logDivider + '\n';
            fs.appendFileSync(logPath, logContent, 'utf-8');
          } catch (e) {
            console.error('[AgentCompleter] Failed to write to turns.log:', e);
          }
        }

        safeResolve(fullText);
      };

      const onError = (err: Error) => {
        safeReject(err);
      };

      if (signal.aborted) {
        safeReject(new Error('Operation cancelled'));
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
          onReasoningChunk,
        );
      } else if (provider === 'custom' || (typeof provider === 'string' && provider.startsWith('custom_'))) {
        streamCustomOpenAIChat(host, apiKey, model, messages, abortController.signal, onChunk, onComplete, onError);
      } else {
        streamOllamaChat(host, model, messages, abortController.signal, onChunk, onComplete, onError);
      }
    });
  }

  /**
   * Generate a summary of conversation turns to compress context.
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
        content: `You are a context compression assistant for an AI coding agent. Summarize the following conversation turns into a structured summary using EXACTLY this format:

## Files Modified
- [list each file path and what was changed, one per line]

## Files Read (still relevant)
- [list files the agent may need to reference again]

## Decisions Made
- [key decisions, variable names, patterns chosen]

## Current State
- [pending errors, next steps, active branch, build status]

## Key Code Snippets
- [any critical code patterns, function signatures, or variable names the agent will need]

Rules:
- Preserve EXACT file paths and variable/function names — never paraphrase them.
- Do NOT include any XML tool tags.
- Keep under 500 words.
- If previous summaries are included, merge them into one cohesive summary.`,
      },
      ...messages,
      {
        role: 'user',
        content: 'Provide the structured summary now.',
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
        streamDeepSeekChat(apiKey, model, summaryPrompt, new AbortController().signal, onChunk, onComplete, onError);
      } else if (provider === 'custom' || (typeof provider === 'string' && provider.startsWith('custom_'))) {
        streamCustomOpenAIChat(
          host,
          apiKey,
          model,
          summaryPrompt,
          new AbortController().signal,
          onChunk,
          onComplete,
          onError,
        );
      } else {
        streamOllamaChat(host, model, summaryPrompt, new AbortController().signal, onChunk, onComplete, onError);
      }
    });
  }
}

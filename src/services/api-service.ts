import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import * as vscode from 'vscode';

interface OllamaTag {
  name: string;
}

interface OllamaTagsResponse {
  models?: OllamaTag[];
}

/**
 * Parses a base URL and routes it to either http or https request modules.
 */
function makeRequest(
  urlStr: string,
  options: http.RequestOptions | https.RequestOptions,
  bodyData?: string,
  signal?: AbortSignal,
): Promise<{ response: http.IncomingMessage; body: string }> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(urlStr);
    const isHttps = parsedUrl.protocol === 'https:';
    const requestModule = isHttps ? https : http;

    const requestOptions: http.RequestOptions | https.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = requestModule.request(requestOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        resolve({ response: res, body });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Ollama API request timed out after 120 seconds.'));
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (signal) {
      if (signal.aborted) {
        req.destroy();
        reject(new Error('Request aborted'));
        return;
      }
      signal.addEventListener('abort', () => {
        req.destroy();
        reject(new Error('Request aborted'));
      });
    }

    if (bodyData) {
      req.write(bodyData);
    }
    req.end();
  });
}

/**
 * Fetches the list of installed Ollama models.
 */
export async function fetchOllamaModels(host: string): Promise<string[]> {
  const url = `${host.replace(/\/$/, '')}/api/tags`;
  try {
    const { response, body } = await makeRequest(url, { method: 'GET' });

    if (response.statusCode !== 200) {
      throw new Error(`Failed to fetch models: HTTP ${response.statusCode}`);
    }

    const data = JSON.parse(body) as OllamaTagsResponse;
    if (data.models && Array.isArray(data.models)) {
      return data.models.map((m) => m.name);
    }
    return [];
  } catch (error: any) {
    console.error('Error fetching Ollama models:', error);
    throw new Error(`Ollama offline or unreachable at ${host}. Details: ${error.message}`);
  }
}

/**
 * Streams a chat completion response from Ollama.
 */
export function streamOllamaChat(
  host: string,
  model: string,
  messages: { role: string; content: string; images?: string[] }[],
  signal: AbortSignal,
  onChunk: (text: string) => void,
  onComplete: (fullText: string, usage?: { promptTokens: number; completionTokens: number }) => void,
  onError: (err: any) => void,
): void {
  const urlStr = `${host.replace(/\/$/, '')}/api/chat`;
  const parsedUrl = new URL(urlStr);
  const isHttps = parsedUrl.protocol === 'https:';
  const requestModule = isHttps ? https : http;

  const bodyData = JSON.stringify({
    model,
    messages,
    stream: true,
  });

  const requestOptions: http.RequestOptions | https.RequestOptions = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (isHttps ? 443 : 80),
    path: parsedUrl.pathname,
    method: 'POST',
    timeout: 180000, // 180 second timeout for local processing
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(bodyData),
    },
  };

  const req = requestModule.request(requestOptions, (res) => {
    if (res.statusCode !== 200) {
      let errBody = '';
      res.on('data', (chunk) => (errBody += chunk));
      res.on('end', () => {
        onError(new Error(`Ollama streaming error: HTTP ${res.statusCode} - ${errBody}`));
      });
      return;
    }

    let fullText = '';
    let buffer = '';

    res.on('data', (chunk) => {
      if (streamCompleted) return;
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Hold the last incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }
        try {
          const parsed = JSON.parse(line);
          const chunkText = parsed.message?.content || '';
          if (chunkText) {
            fullText += chunkText;
            onChunk(chunkText);
          }
          if (parsed.done) {
            streamCompleted = true;
            const usage =
              parsed.prompt_eval_count || parsed.eval_count
                ? {
                    promptTokens: parsed.prompt_eval_count || 0,
                    completionTokens: parsed.eval_count || 0,
                  }
                : undefined;
            onComplete(fullText, usage);
            return;
          }
        } catch (e) {
          console.warn('Failed to parse NDJSON line:', line, e);
        }
      }
    });

    res.on('end', () => {
      if (streamCompleted) return;
      streamCompleted = true;
      let finalUsage: { promptTokens: number; completionTokens: number } | undefined = undefined;
      // Parse any remaining buffer
      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer);
          const chunkText = parsed.message?.content || '';
          if (chunkText) {
            fullText += chunkText;
            onChunk(chunkText);
          }
          if (parsed.prompt_eval_count || parsed.eval_count) {
            finalUsage = {
              promptTokens: parsed.prompt_eval_count || 0,
              completionTokens: parsed.eval_count || 0,
            };
          }
        } catch (e) {
          // ignore
        }
      }
      onComplete(fullText, finalUsage);
    });
  });

  req.on('error', (err) => {
    if (signal.aborted) {
      return;
    }
    onError(err);
  });

  req.on('timeout', () => {
    req.destroy();
    const timeoutErr = new Error('Ollama streaming request timed out.');
    timeoutErr.name = 'TimeoutError';
    onError(timeoutErr);
  });

  let streamCompleted = false;

  if (signal.aborted) {
    req.destroy();
    const abortErr = new Error('The user aborted a request.');
    abortErr.name = 'AbortError';
    onError(abortErr);
    return;
  }

  signal.addEventListener('abort', () => {
    if (streamCompleted) return;
    req.destroy();
    const abortErr = new Error('The user aborted a request.');
    abortErr.name = 'AbortError';
    onError(abortErr);
  });

  req.write(bodyData);
  req.end();
}

/**
 * Accumulated state for a single in-progress native tool call during streaming.
 */
interface NativeToolCallAccumulator {
  id: string;
  name: string;
  argumentsBuffer: string;
}

/**
 * Streams a chat completion response from DeepSeek API.
 */
export function streamDeepSeekChat(
  apiKey: string,
  model: string,
  messages: { role: string; content: string; images?: string[] }[],
  signal: AbortSignal,
  onChunk: (text: string) => void,
  onComplete: (fullText: string, usage?: { promptTokens: number; completionTokens: number }) => void,
  onError: (err: any) => void,
  onReasoningChunk?: (text: string) => void,
  tools?: object[],
  onNativeToolCall?: (id: string, name: string, argsJson: string) => void,
  onToolCallStart?: (name: string) => void,
): void {
  const urlStr = 'https://api.deepseek.com/chat/completions';
  const parsedUrl = new URL(urlStr);

  const sanitizedMessages = messages.map((msg) => {
    const { images, ...rest } = msg;
    return {
      ...rest,
      content:
        typeof rest.content === 'string'
          ? typeof (rest.content as any).toWellFormed === 'function'
            ? (rest.content as any).toWellFormed()
            : rest.content
          : rest.content,
    };
  });

  const config = vscode.workspace.getConfiguration('mirror-vs');
  const thinkingEnabled = config.get<boolean>('deepSeekThinking', true);
  const thinkingLevel = config.get<string>('deepSeekThinkingLevel', 'high');

  const payload: any = {
    model,
    messages: sanitizedMessages,
    stream: true,
    stream_options: {
      include_usage: true,
    },
  };

  // Attach tool schemas for native function calling (mutually exclusive with thinking)
  if (tools && tools.length > 0 && onNativeToolCall) {
    payload.tools = tools;
    payload.tool_choice = 'auto';
    // DeepSeek does not support thinking when tools are active
    payload.thinking = { type: 'disabled' };
  } else if (thinkingEnabled) {
    payload.reasoning_effort = thinkingLevel;
    payload.thinking = {
      type: 'enabled',
    };
  } else {
    payload.thinking = {
      type: 'disabled',
    };
  }

  const bodyData = JSON.stringify(payload);

  const requestOptions: https.RequestOptions = {
    hostname: parsedUrl.hostname,
    port: 443,
    path: parsedUrl.pathname,
    method: 'POST',
    timeout: 180000, // 180 second timeout
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'Content-Length': Buffer.byteLength(bodyData),
    },
  };

  const req = https.request(requestOptions, (res) => {
    if (res.statusCode !== 200) {
      let errBody = '';
      res.on('data', (chunk) => (errBody += chunk));
      res.on('end', () => {
        let parsedErr = errBody;
        try {
          const jsonErr = JSON.parse(errBody);
          parsedErr = jsonErr.error?.message || errBody;
        } catch (e) {
          // ignore
        }
        onError(new Error(`DeepSeek API error: HTTP ${res.statusCode} - ${parsedErr}`));
      });
      return;
    }

    let fullText = '';
    let buffer = '';
    let usage: { promptTokens: number; completionTokens: number } | undefined = undefined;
    // Native tool call accumulation: index → accumulator
    const nativeToolCalls = new Map<number, NativeToolCallAccumulator>();

    res.on('data', (chunk) => {
      if (deepseekCompleted) return;
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Hold the last incomplete line in buffer

      for (const line of lines) {
        const cleanLine = line.trim();
        if (!cleanLine) {
          continue;
        }

        if (cleanLine === 'data: [DONE]') {
          deepseekCompleted = true;
          // Fire accumulated native tool calls before completing
          if (onNativeToolCall && nativeToolCalls.size > 0) {
            // Only take the first tool call (one-tool-per-turn policy)
            const first = nativeToolCalls.get(0);
            if (first) {
              onNativeToolCall(first.id, first.name, first.argumentsBuffer);
            }
          }
          onComplete(fullText, usage);
          return;
        }

        if (cleanLine.startsWith('data:')) {
          const jsonStr = cleanLine.substring(5).trim();
          try {
            const parsed = JSON.parse(jsonStr);
            const chunkText = parsed.choices?.[0]?.delta?.content || '';
            const reasoningChunk = parsed.choices?.[0]?.delta?.reasoning_content || '';
            if (reasoningChunk && onReasoningChunk && thinkingEnabled) {
              onReasoningChunk(reasoningChunk);
            }
            if (chunkText) {
              fullText += chunkText;
              onChunk(chunkText);
            }
            // Accumulate native tool call delta chunks
            const toolCallDeltas = parsed.choices?.[0]?.delta?.tool_calls;
            if (toolCallDeltas && Array.isArray(toolCallDeltas) && onNativeToolCall) {
              for (const delta of toolCallDeltas) {
                const idx: number = delta.index ?? 0;
                if (!nativeToolCalls.has(idx)) {
                  nativeToolCalls.set(idx, {
                    id: delta.id || `call_${idx}`,
                    name: delta.function?.name || '',
                    argumentsBuffer: '',
                  });
                  if (delta.function?.name && onToolCallStart) {
                    onToolCallStart(delta.function.name);
                  }
                } else {
                  const acc = nativeToolCalls.get(idx)!;
                  if (delta.id) acc.id = delta.id;
                  if (delta.function?.name) {
                    acc.name = delta.function.name;
                    if (onToolCallStart) {
                      onToolCallStart(delta.function.name);
                    }
                  }
                }
                const acc = nativeToolCalls.get(idx);
                if (acc && delta.function?.arguments) {
                  acc.argumentsBuffer += delta.function.arguments;
                }
              }
            }
            if (parsed.usage) {
              usage = {
                promptTokens: parsed.usage.prompt_tokens,
                completionTokens: parsed.usage.completion_tokens,
              };
            }
          } catch (e) {
            console.warn('Failed to parse SSE data block:', jsonStr, e);
          }
        }
      }
    });

    res.on('end', () => {
      if (deepseekCompleted) return;
      deepseekCompleted = true;
      // Fire accumulated native tool calls on stream end
      if (onNativeToolCall && nativeToolCalls.size > 0) {
        const first = nativeToolCalls.get(0);
        if (first) {
          onNativeToolCall(first.id, first.name, first.argumentsBuffer);
        }
      }
      onComplete(fullText, usage);
    });
  });

  req.on('error', (err) => {
    if (signal.aborted) {
      return;
    }
    onError(err);
  });

  req.on('timeout', () => {
    req.destroy();
    const timeoutErr = new Error('DeepSeek streaming request timed out.');
    timeoutErr.name = 'TimeoutError';
    onError(timeoutErr);
  });

  let deepseekCompleted = false;

  if (signal.aborted) {
    req.destroy();
    const abortErr = new Error('The user aborted a request.');
    abortErr.name = 'AbortError';
    onError(abortErr);
    return;
  }

  signal.addEventListener('abort', () => {
    if (deepseekCompleted) return;
    req.destroy();
    const abortErr = new Error('The user aborted a request.');
    abortErr.name = 'AbortError';
    onError(abortErr);
  });

  req.write(bodyData);
  req.end();
}

/**
 * Streams a chat completion response from a custom OpenAI-compatible endpoint.
 */
export function streamCustomOpenAIChat(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: { role: string; content: string; images?: string[] }[],
  signal: AbortSignal,
  onChunk: (text: string) => void,
  onComplete: (fullText: string, usage?: { promptTokens: number; completionTokens: number }) => void,
  onError: (err: any) => void,
  tools?: object[],
  onNativeToolCall?: (id: string, name: string, argsJson: string) => void,
  onToolCallStart?: (name: string) => void,
): void {
  let urlStr = baseUrl.replace(/\/$/, '');
  if (!urlStr.includes('/chat/completions')) {
    urlStr += '/chat/completions';
  }
  const parsedUrl = new URL(urlStr);
  const isHttps = parsedUrl.protocol === 'https:';
  const requestModule = isHttps ? https : http;

  const sanitizedMessages = messages.map((msg) => {
    const { images, ...rest } = msg;
    return {
      ...rest,
      content:
        typeof rest.content === 'string'
          ? typeof (rest.content as any).toWellFormed === 'function'
            ? (rest.content as any).toWellFormed()
            : rest.content
          : rest.content,
    };
  });

  const payload: Record<string, unknown> = {
    model,
    messages: sanitizedMessages,
    stream: true,
    stream_options: {
      include_usage: true,
    },
  };

  // Attach tool schemas for native function calling if provided
  if (tools && tools.length > 0 && onNativeToolCall) {
    payload.tools = tools;
    payload.tool_choice = 'auto';
  }

  const bodyData = JSON.stringify(payload);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(bodyData).toString(),
  };

  if (apiKey && apiKey.trim() !== '') {
    headers['Authorization'] = `Bearer ${apiKey.trim()}`;
  }

  const requestOptions: http.RequestOptions | https.RequestOptions = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (isHttps ? 443 : 80),
    path: parsedUrl.pathname + parsedUrl.search,
    method: 'POST',
    timeout: 180000,
    headers,
  };

  const req = requestModule.request(requestOptions, (res) => {
    if (res.statusCode !== 200) {
      let errBody = '';
      res.on('data', (chunk) => (errBody += chunk));
      res.on('end', () => {
        let parsedErr = errBody;
        try {
          const jsonErr = JSON.parse(errBody);
          parsedErr = jsonErr.error?.message || errBody;
        } catch (e) {
          // ignore
        }
        onError(new Error(`Custom API error: HTTP ${res.statusCode} - ${parsedErr}`));
      });
      return;
    }

    let fullText = '';
    let buffer = '';
    let usage: { promptTokens: number; completionTokens: number } | undefined = undefined;
    // Native tool call accumulation: index → accumulator
    const nativeToolCalls = new Map<number, NativeToolCallAccumulator>();

    res.on('data', (chunk) => {
      if (completed) return;
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const cleanLine = line.trim();
        if (!cleanLine) {
          continue;
        }

        if (cleanLine === 'data: [DONE]') {
          completed = true;
          // Fire accumulated native tool calls before completing
          if (onNativeToolCall && nativeToolCalls.size > 0) {
            const first = nativeToolCalls.get(0);
            if (first) {
              onNativeToolCall(first.id, first.name, first.argumentsBuffer);
            }
          }
          onComplete(fullText, usage);
          return;
        }

        if (cleanLine.startsWith('data:')) {
          const jsonStr = cleanLine.substring(5).trim();
          try {
            const parsed = JSON.parse(jsonStr);
            const chunkText = parsed.choices?.[0]?.delta?.content || '';
            if (chunkText) {
              fullText += chunkText;
              onChunk(chunkText);
            }
            // Accumulate native tool call delta chunks
            const toolCallDeltas = parsed.choices?.[0]?.delta?.tool_calls;
            if (toolCallDeltas && Array.isArray(toolCallDeltas) && onNativeToolCall) {
              for (const delta of toolCallDeltas) {
                const idx: number = delta.index ?? 0;
                if (!nativeToolCalls.has(idx)) {
                  nativeToolCalls.set(idx, {
                    id: delta.id || `call_${idx}`,
                    name: delta.function?.name || '',
                    argumentsBuffer: '',
                  });
                  if (delta.function?.name && onToolCallStart) {
                    onToolCallStart(delta.function.name);
                  }
                } else {
                  const acc = nativeToolCalls.get(idx)!;
                  if (delta.id) acc.id = delta.id;
                  if (delta.function?.name) {
                    acc.name = delta.function.name;
                    if (onToolCallStart) {
                      onToolCallStart(delta.function.name);
                    }
                  }
                }
                const acc = nativeToolCalls.get(idx);
                if (acc && delta.function?.arguments) {
                  acc.argumentsBuffer += delta.function.arguments;
                }
              }
            }
            if (parsed.usage) {
              usage = {
                promptTokens: parsed.usage.prompt_tokens,
                completionTokens: parsed.usage.completion_tokens,
              };
            }
          } catch (e) {
            // ignore
          }
        }
      }
    });

    res.on('end', () => {
      if (completed) return;
      completed = true;
      // Fire accumulated native tool calls on stream end
      if (onNativeToolCall && nativeToolCalls.size > 0) {
        const first = nativeToolCalls.get(0);
        if (first) {
          onNativeToolCall(first.id, first.name, first.argumentsBuffer);
        }
      }
      onComplete(fullText, usage);
    });
  });

  req.on('error', (err) => {
    if (signal.aborted) {
      return;
    }
    onError(err);
  });

  req.on('timeout', () => {
    req.destroy();
    const timeoutErr = new Error('Custom API streaming request timed out.');
    timeoutErr.name = 'TimeoutError';
    onError(timeoutErr);
  });

  let completed = false;

  if (signal.aborted) {
    req.destroy();
    const abortErr = new Error('The user aborted a request.');
    abortErr.name = 'AbortError';
    onError(abortErr);
    return;
  }

  signal.addEventListener('abort', () => {
    if (completed) return;
    completed = true;
    req.destroy();
    const abortErr = new Error('The user aborted a request.');
    abortErr.name = 'AbortError';
    onError(abortErr);
  });

  req.write(bodyData);
  req.end();
}

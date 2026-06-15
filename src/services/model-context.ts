import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

export const DEFAULT_CONTEXT = 128000;
const REQUEST_TIMEOUT = 5000;

export const KNOWN_CONTEXT_WINDOWS: Record<string, number> = {
  // --- Anthropic ---
  'claude-sonnet-4-5': 200000,
  'claude-sonnet-4-6': 200000,
  'claude-sonnet-4': 200000,
  'claude-opus-4': 200000,
  'claude-haiku-4': 200000,
  'claude-haiku-3-5': 200000,
  'claude-3-5-sonnet': 200000,
  'claude-3-5-haiku': 200000,
  'claude-3-opus': 200000,
  'claude-3-sonnet': 200000,
  'claude-3-haiku': 200000,

  // --- OpenAI ---
  'gpt-5': 400000,
  'gpt-4.1': 1047576,
  'gpt-4.1-mini': 1047576,
  'gpt-4.1-nano': 1047576,
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-4-turbo': 128000,
  'gpt-4': 8192,
  'gpt-3.5-turbo': 16385,
  o1: 200000,
  'o1-mini': 128000,
  'o1-pro': 200000,
  o3: 200000,
  'o3-mini': 200000,
  'o4-mini': 200000,

  // --- DeepSeek ---
  'deepseek-chat': 64000,
  'deepseek-coder': 64000,
  'deepseek-reasoner': 64000,
  'deepseek-r1': 64000,
  'deepseek-v3': 64000,
  'deepseek-v2': 64000,

  // --- Google ---
  'gemini-2.5-pro': 1048576,
  'gemini-2.5-flash': 1048576,
  'gemini-2.0-flash': 1048576,
  'gemini-1.5-pro': 1048576,
  'gemini-1.5-flash': 1048576,
  'gemma-4': 262144,
  'gemma-3': 128000,
  'gemma-2': 8192,

  // --- Mistral ---
  'mistral-large': 128000,
  'mistral-medium': 32000,
  'mistral-small': 32000,
  'mistral-nemo': 128000,
  'mistral-7b': 32000,
  mixtral: 32000,
  codestral: 32000,
  pixtral: 128000,

  // --- xAI ---
  'grok-4': 131072,
  'grok-3': 131072,
  'grok-2': 131072,

  // --- Meta / Llama ---
  'llama-4': 1048576,
  'llama-3.3': 131072,
  'llama-3.2': 131072,
  'llama-3.1': 131072,
  'llama-3': 131072,

  // --- Qwen ---
  qwen3: 131072,
  'qwen2.5': 131072,
  qwen2: 32768,
  qwq: 32768,

  // --- Cohere ---
  'command-r-plus': 128000,
  'command-r': 128000,
  'command-a': 256000,

  // --- Perplexity ---
  'sonar-pro': 200000,
  sonar: 128000,

  // --- MiniMax ---
  minimax: 1000000,

  // --- Moonshot / Kimi ---
  moonshot: 128000,
  kimi: 128000,

  // --- Microsoft ---
  'phi-4': 16000,
  'phi-3': 128000,

  // --- Nvidia ---
  nemotron: 131072,

  // --- Yi ---
  'yi-large': 32768,
  'yi-1.5': 16384,

  // --- 01.ai ---
  'yi-lightning': 16384,

  // --- Nous ---
  hermes: 131072,
  'nous-hermes': 131072,

  // --- Open community ---
  dolphin: 32768,
  mythomax: 4096,
  wizard: 32768,
  openchat: 8192,
  solar: 32768,
};

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', 'host.docker.internal']);
const PRIVATE_PREFIXES = [
  '10.',
  '172.16.',
  '172.17.',
  '172.18.',
  '172.19.',
  '172.20.',
  '172.21.',
  '172.22.',
  '172.23.',
  '172.24.',
  '172.25.',
  '172.26.',
  '172.27.',
  '172.28.',
  '172.29.',
  '172.30.',
  '172.31.',
  '192.168.',
  '100.',
];

function isLocalEndpoint(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (LOCAL_HOSTS.has(host)) {
      return true;
    }
    return PRIVATE_PREFIXES.some((prefix) => host.startsWith(prefix));
  } catch {
    return false;
  }
}

function buildModelsUrl(endpointUrl: string): string {
  let urlStr = endpointUrl.trim().replace(/\/+$/, '');
  const suffixes = ['/chat/completions', '/completions', '/messages', '/v1/messages'];
  for (const suffix of suffixes) {
    if (urlStr.endsWith(suffix)) {
      urlStr = urlStr.slice(0, -suffix.length).replace(/\/+$/, '');
    }
  }
  if (!urlStr.endsWith('/models') && !urlStr.endsWith('/v1/models')) {
    if (urlStr.endsWith('/v1')) {
      urlStr += '/models';
    } else {
      urlStr += '/v1/models';
    }
  }
  return urlStr;
}

function makeHttpRequest(urlStr: string, headers: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const parsedUrl = new URL(urlStr);
      const isHttps = parsedUrl.protocol === 'https:';
      const requestModule = isHttps ? https : http;

      const requestOptions: http.RequestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        timeout: REQUEST_TIMEOUT,
        headers,
      };

      const req = requestModule.request(requestOptions, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(body);
          } else {
            reject(new Error(`HTTP Error ${res.statusCode}: ${body}`));
          }
        });
      });

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timed out'));
      });
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

function lookupKnown(model: string): number | null {
  const name = model.toLowerCase();
  const parts = name.split('/');
  let basename = parts[parts.length - 1];
  basename = basename.split(':')[0]; // strip tag (like :latest)

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const vscode = require('vscode');
    const config = vscode.workspace.getConfiguration('mirror-vs');
    const customLengths = config.get<Record<string, number>>('modelContextLengths', {});
    for (const [key, val] of Object.entries(customLengths)) {
      if (basename.includes(key.toLowerCase()) || name.includes(key.toLowerCase())) {
        if (typeof val === 'number' && val > 0) {
          return val;
        }
      }
    }
  } catch {
    // VS Code API not available (e.g., in unit tests)
  }

  let bestKey: string | null = null;
  let bestCtx: number | null = null;

  for (const [key, ctx] of Object.entries(KNOWN_CONTEXT_WINDOWS)) {
    if (basename.includes(key) || name.includes(key)) {
      if (bestKey === null || key.length > bestKey.length) {
        bestKey = key;
        bestCtx = ctx;
      }
    }
  }

  return bestCtx;
}

// Cache format: key is endpoint_url + "||" + model -> context length
const contextCache = new Map<string, number>();

export async function getContextLength(endpointUrl: string, model: string, apiKey?: string): Promise<number> {
  const isLocal = isLocalEndpoint(endpointUrl);
  const cacheKey = `${endpointUrl}||${model}`;

  if (!isLocal && contextCache.has(cacheKey)) {
    return contextCache.get(cacheKey)!;
  }

  const ctx = await queryContextLength(endpointUrl, model, apiKey);

  if (!isLocal && ctx !== DEFAULT_CONTEXT) {
    contextCache.set(cacheKey, ctx);
  }

  return ctx;
}

async function queryContextLength(endpointUrl: string, model: string, apiKey?: string): Promise<number> {
  const known = lookupKnown(model);
  let apiCtx: number | null = null;

  // Prefer known context for cloud APIs / proxies to avoid expensive /models query
  // Wait, if it is DeepSeek, Anthropic, or OpenAI (cloud APIs), return known if present.
  const isCloudHost =
    endpointUrl.includes('api.openai.com') ||
    endpointUrl.includes('api.deepseek.com') ||
    endpointUrl.includes('api.anthropic.com') ||
    endpointUrl.includes('api.groq.com');

  if (isCloudHost && known !== null) {
    return known;
  }

  // Try llama.cpp /slots endpoint first if local
  if (isLocalEndpoint(endpointUrl)) {
    try {
      let base = endpointUrl;
      if (base.includes('/v1')) {
        base = base.split('/v1')[0];
      } else {
        const parts = base.split('/');
        parts.pop();
        base = parts.join('/');
      }
      const slotsUrl = `${base.replace(/\/+$/, '')}/slots`;
      const response = await makeHttpRequest(slotsUrl, {});
      const slots = JSON.parse(response);
      if (Array.isArray(slots) && slots.length > 0) {
        const nCtx = slots[0].n_ctx;
        if (typeof nCtx === 'number' && nCtx > 0) {
          return nCtx;
        }
      }
    } catch {
      // Ignored, fallback to models endpoint
    }
  }

  const modelsUrl = buildModelsUrl(endpointUrl);
  try {
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    const response = await makeHttpRequest(modelsUrl, headers);
    const data = JSON.parse(response);
    const modelsList = data.data || [];

    for (const m of modelsList) {
      const mid = m.id || '';
      const mParts = mid.split('/');
      const modelParts = model.split('/');
      const mBase = mParts[mParts.length - 1];
      const modelBase = modelParts[modelParts.length - 1];

      if (mid === model || mBase === modelBase) {
        const fields = ['context_length', 'context_window', 'max_model_len', 'max_context_length', 'max_seq_len'];
        for (const field of fields) {
          const val = m[field];
          if (typeof val === 'number' && val > 0) {
            apiCtx = val;
            break;
          }
        }

        if (!apiCtx) {
          const meta = m.meta || m.model_extra || {};
          const metaFields = ['n_ctx', 'context_length', 'context_window', 'max_model_len'];
          for (const field of metaFields) {
            const val = meta[field];
            if (typeof val === 'number' && val > 0) {
              apiCtx = val;
              break;
            }
          }
        }
        break;
      }
    }
  } catch {
    // Ignored, fallback to known or default
  }

  if (apiCtx && known) {
    if (isLocalEndpoint(endpointUrl) && apiCtx < known) {
      return apiCtx;
    }
    return Math.max(apiCtx, known);
  }

  if (apiCtx) return apiCtx;
  if (known !== null) return known;

  return DEFAULT_CONTEXT;
}

export function estimateTokens(messages: any[]): number {
  let total = 0;
  for (const msg of messages) {
    total += 4; // per-message overhead
    const content = msg.content;
    if (typeof content === 'string') {
      total += Math.floor(content.length * 0.3);
    } else if (Array.isArray(content)) {
      for (const item of content) {
        if (item && typeof item === 'object' && item.type === 'text') {
          total += Math.floor((item.text || '').length * 0.3);
        }
      }
    }

    const toolCalls = msg.tool_calls;
    if (Array.isArray(toolCalls)) {
      for (const tc of toolCalls) {
        if (tc && typeof tc === 'object') {
          const fn = tc.function || tc;
          const name = fn.name || '';
          let args = fn.arguments || '';
          if (typeof args !== 'string') {
            args = JSON.stringify(args);
          }
          total += 4; // per tool-call overhead
          total += Math.floor((name.length + args.length) * 0.3);
        }
      }
    }
  }
  return total;
}

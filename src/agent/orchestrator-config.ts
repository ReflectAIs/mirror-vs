/**
 * Mirror VS Orchestrator Configuration
 * Token estimation, model context window lookup, and payload estimation.
 */

/** Model context window sizes in tokens. Used for token-budget-based summarization. */
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'deepseek-chat': 64000,
  'deepseek-reasoner': 64000,
  'deepseek-v4-flash': 128000, // Capped at 64K for cost-effectiveness
  'deepseek-v4-pro': 128000, // Capped at 64K for cost-effectiveness
  llama3: 8192,
  'llama3.1': 131072,
  'llama3.2': 131072,
  'qwen2.5-coder:32b': 131072,
  'qwen2.5-coder:14b': 131072,
  'qwen2.5-coder:7b': 32768,
  codestral: 32768,
  mistral: 32768,
  gemma2: 8192,
  phi3: 4096,
};

export function getModelContextWindow(model: string): number {
  const normalized = model.toLowerCase();
  if (MODEL_CONTEXT_WINDOWS[model]) return MODEL_CONTEXT_WINDOWS[model];
  if (normalized.includes('deepseek')) return 128000;
  const baseModel = model.split(':')[0];
  if (MODEL_CONTEXT_WINDOWS[baseModel]) return MODEL_CONTEXT_WINDOWS[baseModel];
  return 32000; // Conservative default
}

/**
 * Improved token estimation using multiple heuristics.
 * - English/ASCII-heavy text: ~4 chars per token (GPT tokenizer baseline)
 * - Code (many symbols, whitespace): ~3 chars per token
 * - CJK characters: ~1.5 chars per token (each char ≈ 1-2 tokens in most tokenizers)
 * - Accounts for whitespace-heavy code blocks more accurately
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  const len = text.length;
  // Count CJK characters (Unicode ranges for Chinese, Japanese, Korean)
  const cjkCount = (
    text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g) || []
  ).length;
  const nonCjkLen = len - cjkCount;
  // Count code-like patterns (indentation, braces, semicolons, etc.)
  const codeIndicatorCount = (text.match(/[{}[\]();:=<>+\-*/%&|^!~?#@$`\\]/g) || []).length;
  const codeDensity = codeIndicatorCount / Math.max(nonCjkLen, 1);
  // Base rate: English ≈ 4 chars/token, code-heavy ≈ 3 chars/token, CJK ≈ 1.5 chars/token
  const codeRate = 3 + (1 - Math.min(codeDensity * 10, 1));
  const nonCjkTokens = nonCjkLen / codeRate;
  const cjkTokens = cjkCount / 1.5;
  return Math.ceil(nonCjkTokens + cjkTokens);
}

export function estimatePayloadTokens(messages: { content: string }[]): number {
  return messages.reduce((sum, msg) => sum + estimateTokenCount(msg.content), 0);
}

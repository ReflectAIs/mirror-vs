export const DEFAULT_HARD_MAX = 200000;
export const DEFAULT_BUDGET = 6000;
export const DEFAULT_HEADROOM = 0.85;

/**
 * Return the effective soft input-token budget.
 *
 * Rules:
 * - Explicit user budget is honored exactly, only clamped to the model's
 *   window when that window is known (never send more than the model holds).
 * - Otherwise (default), scale to headroom of the context window, capped
 *   at hard_max — so long-context models use their capacity.
 * - When the window is unknown, fall back to the configured/default value.
 */
export function computeInputTokenBudget(
  configured: number,
  contextLength: number,
  explicit: boolean,
  options?: {
    defaultBudget?: number;
    headroom?: number;
    hardMax?: number;
  },
): number {
  const defaultBudget = options?.defaultBudget ?? DEFAULT_BUDGET;
  const headroom = options?.headroom ?? DEFAULT_HEADROOM;
  const hardMax = options?.hardMax ?? DEFAULT_HARD_MAX;

  const conf = Math.max(0, configured || 0);
  const ctxLen = Math.max(0, contextLength || 0);

  if (explicit && conf > 0) {
    return ctxLen > 0 ? Math.min(conf, ctxLen) : conf;
  }

  if (ctxLen > 0) {
    const scaled = Math.floor(ctxLen * headroom);
    return Math.max(1, Math.min(scaled, hardMax));
  }

  return conf > 0 ? conf : defaultBudget;
}

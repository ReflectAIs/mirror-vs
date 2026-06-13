import { describe, it, expect } from 'vitest';
import { computeInputTokenBudget } from '../context-budget';

describe('Context Budget Service', () => {
  it('should honor explicit user budget, clamping to context length if known', () => {
    // Explicit 8000 budget, context length is 4000 -> clamp to 4000
    expect(computeInputTokenBudget(8000, 4000, true)).toBe(4000);
    // Explicit 3000 budget, context length is 4000 -> keep 3000
    expect(computeInputTokenBudget(3000, 4000, true)).toBe(3000);
    // Explicit 8000 budget, unknown context length -> keep 8000
    expect(computeInputTokenBudget(8000, 0, true)).toBe(8000);
  });

  it('should auto-scale default budget to headroom (85%) of context length, capped at hard_max', () => {
    // Default budget, context length 128000 -> 128000 * 0.85 = 108800
    expect(computeInputTokenBudget(6000, 128000, false)).toBe(108800);

    // Default budget, context length 1000000 -> 1000000 * 0.85 = 850000, capped at 200000
    expect(computeInputTokenBudget(6000, 1000000, false)).toBe(200000);
  });

  it('should fall back to configured default if context length is unknown', () => {
    // Default budget (configured 6000), context length unknown -> 6000
    expect(computeInputTokenBudget(6000, 0, false)).toBe(6000);
    // Budget 0/falsy, context length unknown -> 6000 default
    expect(computeInputTokenBudget(0, 0, false)).toBe(6000);
  });
});

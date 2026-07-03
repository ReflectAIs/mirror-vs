import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ActionPhysicsGuard } from '../ActionPhysicsGuard';

// Mock setTimeout to make async tests instant
vi.useFakeTimers();

describe('ActionPhysicsGuard', () => {
  let guard: ActionPhysicsGuard;

  beforeEach(() => {
    guard = new ActionPhysicsGuard();
    vi.clearAllTimers();
  });

  it('allows the first 3 reads on a file without friction', async () => {
    const file = 'src/app.ts';
    // Calls 1, 2, 3 — all below the threshold of 3
    for (let i = 0; i < 3; i++) {
      const promise = guard.evaluateFrictionGate(file);
      vi.runAllTimers();
      const result = await promise;
      expect(result.allowed).toBe(true);
      expect(result.warningMessage).toBeUndefined();
    }
  });

  it('fires friction gate on the 4th consecutive read', async () => {
    const file = 'src/app.ts';
    for (let i = 0; i < 3; i++) {
      const p = guard.evaluateFrictionGate(file);
      vi.runAllTimers();
      await p;
    }
    // 4th read — should trigger friction
    const promise = guard.evaluateFrictionGate(file);
    vi.runAllTimers();
    const result = await promise;
    expect(result.allowed).toBe(false);
    expect(result.warningMessage).toContain('[System Warning:');
    expect(result.warningMessage).toContain('src/app.ts');
    expect(result.appliedDelayMs).toBeGreaterThan(0);
  });

  it('applies quadratic delay on friction (N² × 150ms)', async () => {
    const file = 'src/app.ts';
    // Advance to 4th call (consecutiveTurns=4, delay = 4²×150 = 2400ms)
    for (let i = 0; i < 3; i++) {
      const p = guard.evaluateFrictionGate(file);
      vi.runAllTimers();
      await p;
    }
    const promise = guard.evaluateFrictionGate(file);
    vi.runAllTimers();
    const result = await promise;
    expect(result.appliedDelayMs).toBe(4 * 4 * 150); // 2400
  });

  it('resets friction counter after a write', async () => {
    const file = 'src/app.ts';
    for (let i = 0; i < 3; i++) {
      const p = guard.evaluateFrictionGate(file);
      vi.runAllTimers();
      await p;
    }
    guard.recordWrite(file);
    // After reset, next read should be allowed
    const promise = guard.evaluateFrictionGate(file);
    vi.runAllTimers();
    const result = await promise;
    expect(result.allowed).toBe(true);
    expect(guard.getConsecutiveCount(file)).toBe(1);
  });

  it('tracks different files independently', async () => {
    const fileA = 'src/a.ts';
    const fileB = 'src/b.ts';
    for (let i = 0; i < 4; i++) {
      const p = guard.evaluateFrictionGate(fileA);
      vi.runAllTimers();
      await p;
    }
    // fileB should still be allowed (independent counter)
    const promise = guard.evaluateFrictionGate(fileB);
    vi.runAllTimers();
    const result = await promise;
    expect(result.allowed).toBe(true);
  });

  it('generateStagnationHash returns consistent SHA-256 for identical inputs', () => {
    const hash1 = guard.generateStagnationHash('file content', 3);
    const hash2 = guard.generateStagnationHash('file content', 3);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex = 64 chars
  });

  it('generateStagnationHash differs when content or diagnostics change', () => {
    const hash1 = guard.generateStagnationHash('content A', 0);
    const hash2 = guard.generateStagnationHash('content A', 1);
    const hash3 = guard.generateStagnationHash('content B', 0);
    expect(hash1).not.toBe(hash2);
    expect(hash1).not.toBe(hash3);
  });
});

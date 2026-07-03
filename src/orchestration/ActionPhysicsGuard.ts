/**
 * Mirror VS v2.0 — ActionPhysicsGuard
 *
 * Prevents models from getting stuck in read-analysis loops by applying
 * quadratic (N²) cost backoff when the same file is accessed consecutively
 * without an intervening patch.
 *
 * When the friction gate fires (consecutiveTurns > 3):
 *   1. A non-blocking native delay (setTimeout) enforces structural pacing.
 *   2. A system warning is injected into the next assistant turn context
 *      so the model has clear observability into why it was redirected.
 *   3. The engine state machine is signalled to demote back to PLAN mode.
 *
 * (Q1 decision: Hybrid — native delay + explicit system warning)
 *
 * A SHA-256 stagnation hash detects when repeated reads produce zero change
 * to the effective file snapshot + diagnostic state.
 */

import * as crypto from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FrictionGateResult {
  /** true = tool call is allowed to proceed; false = gate fired, delay applied */
  allowed: boolean;
  /**
   * When allowed=false, this message should be injected into the next
   * assistant prompt turn as a system warning.
   */
  warningMessage?: string;
  /** Delay in milliseconds that has been applied (only set when allowed=false) */
  appliedDelayMs?: number;
}

// ---------------------------------------------------------------------------
// ActionPhysicsGuard
// ---------------------------------------------------------------------------

export class ActionPhysicsGuard {
  /**
   * Per-file consecutive access counter.
   * Incremented on every read_file call for the same target;
   * reset to 0 when a write to that file is recorded.
   */
  private readonly _consecutiveAccess: Record<string, number> = {};

  /**
   * Maximum consecutive reads on a single file before N² backoff fires.
   * Threshold = 3 means on the 4th consecutive read, the gate triggers.
   */
  private static readonly FRICTION_THRESHOLD = 3;

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Evaluate whether a read-file tool call on the given target should be
   * allowed to proceed immediately, or whether N² friction should be applied.
   *
   * @param targetFileIdentifier  Workspace-relative or absolute path of the file.
   * @returns FrictionGateResult — check `allowed` before dispatching the tool.
   */
  public async evaluateFrictionGate(targetFileIdentifier: string): Promise<FrictionGateResult> {
    // Increment the counter for this file
    this._consecutiveAccess[targetFileIdentifier] =
      (this._consecutiveAccess[targetFileIdentifier] ?? 0) + 1;

    const consecutiveTurns = this._consecutiveAccess[targetFileIdentifier];

    if (consecutiveTurns > ActionPhysicsGuard.FRICTION_THRESHOLD) {
      // N² cost backoff: delay grows quadratically with repetition depth
      const delayMs = Math.pow(consecutiveTurns, 2) * 150;

      console.warn(
        `[ActionPhysicsGuard] Loop friction applied to "${targetFileIdentifier}". ` +
          `Consecutive reads: ${consecutiveTurns}. Halting for ${delayMs}ms.`,
      );

      // Apply non-blocking native delay (structural pacing)
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));

      const warningMessage =
        `[System Warning: Loop friction applied to "${targetFileIdentifier}". ` +
        `Halting execution and returning to PLAN mode to avoid token exhaustion. ` +
        `This file has been read ${consecutiveTurns} times consecutively without a patch. ` +
        `You MUST either: (a) write a patch_file/create_file call now, or (b) declare the ` +
        `exploration complete and output an <implementation_plan> if you have not yet done so.]`;

      return { allowed: false, warningMessage, appliedDelayMs: delayMs };
    }

    return { allowed: true };
  }

  /**
   * Record that a write operation (patch_file, write_file, create_file)
   * has been applied to the given file. Resets its friction counter to 0.
   */
  public recordWrite(targetFileIdentifier: string): void {
    this._consecutiveAccess[targetFileIdentifier] = 0;
  }

  /**
   * Manually reset the friction counter for a specific file (e.g. when the
   * engine transitions back to EXPLORE mode after plan approval).
   */
  public resetFriction(targetFileIdentifier: string): void {
    delete this._consecutiveAccess[targetFileIdentifier];
  }

  /**
   * Reset all friction counters (e.g. at the start of a new user message).
   */
  public resetAll(): void {
    for (const key of Object.keys(this._consecutiveAccess)) {
      delete this._consecutiveAccess[key];
    }
  }

  /**
   * Generate a SHA-256 stagnation hash from a file snapshot blob and the
   * current diagnostic error count. Two identical hashes across consecutive
   * turns mean the engine made no meaningful progress on the target.
   *
   * @param fileSnapshotBlob  The raw content of the file as last read.
   * @param diagnosticCount   Number of active LSP errors in the workspace.
   */
  public generateStagnationHash(fileSnapshotBlob: string, diagnosticCount: number): string {
    return crypto
      .createHash('sha256')
      .update(`${fileSnapshotBlob}:${diagnosticCount}`)
      .digest('hex');
  }

  /**
   * Returns the current consecutive-read count for a file (for testing/logging).
   */
  public getConsecutiveCount(targetFileIdentifier: string): number {
    return this._consecutiveAccess[targetFileIdentifier] ?? 0;
  }
}

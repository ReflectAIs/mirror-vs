/**
 * Mirror VS v2.0 — PreemptionManager
 *
 * Prevents race conditions during active PATCH operations by monitoring
 * document changes. If the user manually edits a file that the engine
 * is currently patching, the active execution loop is immediately aborted
 * and the engine state machine is demoted back to PLAN mode so it can
 * re-verify context before resuming.
 *
 * Integration:
 *   - Call `registerPreemptionHook(targetUri, abortController, onDemote)`
 *     when entering PATCH mode for a specific file.
 *   - Call `dispose()` when the PATCH operation completes or is cancelled
 *     to release the document-change listener.
 */

import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// PreemptionManager
// ---------------------------------------------------------------------------

export class PreemptionManager implements vscode.Disposable {
  private _listener: vscode.Disposable | null = null;
  private _activeTargetUri: string | null = null;

  /**
   * Register a preemption hook for the given document URI.
   *
   * While the hook is active, any user edit to that document will:
   *   1. Call `abortController.abort()` to cancel the active streaming turn.
   *   2. Call `onDemote()` to reset the engine state back to PLAN mode.
   *
   * Only ONE file can be watched at a time; calling this again replaces
   * any previously registered hook.
   *
   * @param targetDocumentUri  The URI of the file currently being patched.
   * @param abortController    The orchestrator's active AbortController.
   * @param onDemote           Callback to fire when preemption occurs.
   */
  public registerPreemptionHook(
    targetDocumentUri: vscode.Uri,
    abortController: AbortController,
    onDemote: () => void,
  ): void {
    // Dispose of any previous hook first
    this._listener?.dispose();
    this._activeTargetUri = targetDocumentUri.toString();

    this._listener = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() !== this._activeTargetUri) return;

      // Only preempt if the abort has not already been signalled
      if (!abortController.signal.aborted) {
        console.warn(
          `[PreemptionManager] User edit intercepted on active target file: ` +
            `"${event.document.uri.fsPath}". Cancelling execution loop.`,
        );

        // 1. Cancel the active LLM streaming turn
        abortController.abort();

        // 2. Signal the orchestrator to demote back to PLAN mode
        try {
          onDemote();
        } catch (err) {
          console.error('[PreemptionManager] onDemote callback threw:', err);
        }
      }

      // Auto-dispose after first preemption (one-shot semantics)
      this._listener?.dispose();
      this._listener = null;
      this._activeTargetUri = null;
    });
  }

  /**
   * Deactivate the current preemption hook without triggering it.
   * Call this when a PATCH operation completes successfully.
   */
  public deactivate(): void {
    this._listener?.dispose();
    this._listener = null;
    this._activeTargetUri = null;
  }

  /**
   * Returns true if a preemption hook is currently registered.
   */
  public get isActive(): boolean {
    return this._listener !== null;
  }

  /** VS Code Disposable implementation */
  public dispose(): void {
    this.deactivate();
  }
}

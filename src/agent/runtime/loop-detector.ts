export interface ProgressMarker {
  type: 'new_file' | 'task_completed' | 'patch_applied' | 'diagnostics_changed' | 'build_completed';
  detail: string;
  timestamp: number;
}

export class LoopDetector {
  private _history: ProgressMarker[] = [];
  private _lastCheckCount = 0;
  private _maxTurnsWithoutProgress = 4;

  public registerProgress(
    type: 'new_file' | 'task_completed' | 'patch_applied' | 'diagnostics_changed' | 'build_completed',
    detail: string,
  ): void {
    this._history.push({
      type,
      detail,
      timestamp: Date.now(),
    });
    this._lastCheckCount = 0; // Reset turn counter when progress occurs
  }

  public registerTurn(): void {
    this._lastCheckCount++;
  }

  public detectLoop(): { isLoop: boolean; reason?: string } {
    if (this._lastCheckCount >= this._maxTurnsWithoutProgress) {
      return {
        isLoop: true,
        reason: `No positive progress detected in the last ${this._lastCheckCount} execution steps. Progress markers (such as file creation, patch application, compiler diagnostic changes, or task completion) have stalled. Consider modifying your plan or asking the user for assistance.`,
      };
    }
    return { isLoop: false };
  }

  public clear(): void {
    this._history = [];
    this._lastCheckCount = 0;
  }
}

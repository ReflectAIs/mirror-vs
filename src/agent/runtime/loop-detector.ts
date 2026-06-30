export interface ProgressMarker {
  type: 'new_file' | 'task_completed' | 'patch_applied' | 'diagnostics_changed' | 'build_completed';
  detail: string;
  timestamp: number;
}

export class LoopDetector {
  private _history: ProgressMarker[] = [];
  private _lastCheckCount = 0;
  private _maxTurnsWithoutProgress = 15; // Increased from 4 to 15 to allow healthy search/read steps
  private _recentActions: string[] = [];

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

  public registerAction(action: string): void {
    this._recentActions.push(action);
    if (this._recentActions.length > 20) {
      this._recentActions.shift();
    }
  }

  public detectLoop(): { isLoop: boolean; reason?: string } {
    // 1. Check for exact repetitive action loops
    const actionCounts: Record<string, number> = {};
    for (const action of this._recentActions) {
      actionCounts[action] = (actionCounts[action] || 0) + 1;
      if (actionCounts[action] >= 3) {
        return {
          isLoop: true,
          reason: `The action "${action.split(':')[0]} on ${action.split(':')[1] || 'unknown'}" has been repeated ${actionCounts[action]} times in this session without making changes.`,
        };
      }
    }

    // 2. Check for overall turn budget stall
    if (this._lastCheckCount >= this._maxTurnsWithoutProgress) {
      return {
        isLoop: true,
        reason: `No file modifications or task completions detected in the last ${this._lastCheckCount} turns. Stalled during exploration.`,
      };
    }
    return { isLoop: false };
  }

  public clear(): void {
    this._history = [];
    this._recentActions = [];
    this._lastCheckCount = 0;
  }
}

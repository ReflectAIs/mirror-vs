export interface ExplorerCriteria {
  targetLocated?: boolean;
  confidenceReached?: boolean;
  plannerComplete?: boolean;
}

export class ExplorerModeManager {
  private _criteria: ExplorerCriteria = {};

  public setCriteria(criteria: ExplorerCriteria): void {
    this._criteria = { ...this._criteria, ...criteria };
  }

  public shouldExitExplorer(): boolean {
    return (
      !!this._criteria.targetLocated ||
      !!this._criteria.confidenceReached ||
      !!this._criteria.plannerComplete
    );
  }

  public reset(): void {
    this._criteria = {};
  }
}

import * as fs from 'fs';
import * as path from 'path';

export interface LearningRecord {
  taskId: string;
  strategy: 'line' | 'symbol' | 'rewrite';
  success: boolean;
  timestamp: number;
}

export class LearningEngine {
  private _records: LearningRecord[] = [];
  private _registryPath: string;

  constructor(workspaceRoot?: string) {
    const root = workspaceRoot || '';
    this._registryPath = root ? path.join(root, '.mirror-vs', 'learning-registry.json') : '';
    this.load();
  }

  public registerOutcome(taskId: string, strategy: 'line' | 'symbol' | 'rewrite', success: boolean): void {
    this._records.push({
      taskId,
      strategy,
      success,
      timestamp: Date.now(),
    });
    this.save();
  }

  public getCostMultiplier(strategy: 'line' | 'symbol' | 'rewrite'): number {
    const recent = this._records
      .filter((r) => r.strategy === strategy)
      .slice(-3);

    if (recent.length === 0) return 1.0;

    const failures = recent.filter((r) => !r.success).length;
    return 1.0 + failures * 0.5;
  }

  private load(): void {
    if (!this._registryPath || !fs.existsSync(this._registryPath)) return;
    try {
      const data = fs.readFileSync(this._registryPath, 'utf8');
      this._records = JSON.parse(data) || [];
    } catch {
      // ignore
    }
  }

  private save(): void {
    if (!this._registryPath) return;
    try {
      const dir = path.dirname(this._registryPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this._registryPath, JSON.stringify(this._records, null, 2), 'utf8');
    } catch {
      // ignore
    }
  }
}

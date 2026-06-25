import { ActionRequest } from './types';

export class RecoveryEngine {
  private _failureCounts = new Map<string, number>();

  public registerFailure(path: string): void {
    const count = this._failureCounts.get(path) || 0;
    this._failureCounts.set(path, count + 1);
  }

  public registerSuccess(path: string): void {
    this._failureCounts.delete(path);
  }

  public getFailureCount(path: string): number {
    return this._failureCounts.get(path) || 0;
  }

  public suggestRecovery(request: ActionRequest, errorMsg: string): ActionRequest {
    if (request.type !== 'MODIFY_CODE' || !request.targetPath) {
      return request;
    }

    const path = request.targetPath;
    const failures = this.getFailureCount(path);

    if (failures >= 2) {
      return {
        ...request,
        patchStrategy: 'rewrite',
        details: {
          ...request.details,
          _recoveryNotice: `Escalated to full rewrite due to ${failures} consecutive patch failures: ${errorMsg}`,
        },
      };
    }

    return {
      ...request,
      details: {
        ...request.details,
        _recoveryNotice: `Retry attempt 1: Ensure exact content match. Original error: ${errorMsg}`,
      },
    };
  }

  public clear(): void {
    this._failureCounts.clear();
  }
}

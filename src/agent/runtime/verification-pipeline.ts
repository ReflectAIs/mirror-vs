import { WorkspaceAdapter } from './workspace-adapters';

export interface VerificationReport {
  success: boolean;
  buildStatus: 'passed' | 'failed' | 'skipped';
  testStatus: 'passed' | 'failed' | 'skipped';
  diagnosticsCount: number;
  logs: string;
}

export class VerificationPipeline {
  constructor(private adapter: WorkspaceAdapter) {}

  public async verify(): Promise<VerificationReport> {
    let logs = `--- Start Workspace Verification [${this.adapter.name}] ---\n`;
    let buildStatus: 'passed' | 'failed' | 'skipped' = 'skipped';
    let testStatus: 'passed' | 'failed' | 'skipped' = 'skipped';
    let diagnosticsCount = 0;
    let overallSuccess = true;

    // 1. Build Verification
    try {
      logs += `Running Build check...\n`;
      const buildRes = await this.adapter.build();
      logs += buildRes.output + '\n';
      if (buildRes.success) {
        buildStatus = 'passed';
      } else {
        buildStatus = 'failed';
        overallSuccess = false;
      }
    } catch (err: any) {
      buildStatus = 'failed';
      overallSuccess = false;
      logs += `Build Check Exception: ${err.message}\n`;
    }

    // 2. Diagnostics check
    try {
      logs += `Running Diagnostics check...\n`;
      const diagRes = await this.adapter.getDiagnostics();
      diagnosticsCount = diagRes.errorsCount;
      logs += diagRes.output + '\n';
      if (diagnosticsCount > 0) {
        logs += `Diagnostics reported ${diagnosticsCount} warning(s)/error(s).\n`;
      }
    } catch (err: any) {
      logs += `Diagnostics Check Exception: ${err.message}\n`;
    }

    // 3. Test verification
    if (overallSuccess) {
      try {
        logs += `Running Tests...\n`;
        const testRes = await this.adapter.test();
        logs += testRes.output + '\n';
        if (testRes.success) {
          testStatus = 'passed';
        } else {
          testStatus = 'failed';
          overallSuccess = false;
        }
      } catch (err: any) {
        testStatus = 'failed';
        overallSuccess = false;
        logs += `Test Check Exception: ${err.message}\n`;
      }
    }

    logs += `--- Verification Complete: ${overallSuccess ? 'PASSED' : 'FAILED'} ---`;

    return {
      success: overallSuccess,
      buildStatus,
      testStatus,
      diagnosticsCount,
      logs,
    };
  }
}

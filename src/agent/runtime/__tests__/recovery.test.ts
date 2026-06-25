import { describe, it, expect, vi } from 'vitest';
import { RecoveryEngine } from '../recovery-engine';
import { VerificationPipeline } from '../verification-pipeline';
import { WorkspaceAdapter } from '../workspace-adapters';
import { ActionRequest } from '../types';

describe('Mirror VS Phase 2 Recovery & Verification Tests', () => {

  describe('RecoveryEngine', () => {
    it('should track failures and escalate Line to Rewrite', () => {
      const engine = new RecoveryEngine();
      const request: ActionRequest = {
        type: 'MODIFY_CODE',
        targetPath: 'src/app.ts',
        patchStrategy: 'line',
        details: { code: 'hello' }
      };

      // 1. Initial attempt - suggestions keep strategy but add notice
      let recovery = engine.suggestRecovery(request, 'Syntax error');
      expect(recovery.patchStrategy).toBe('line');
      expect(recovery.details._recoveryNotice).toContain('Retry attempt 1');

      // Register failures
      engine.registerFailure('src/app.ts');
      engine.registerFailure('src/app.ts');

      // 2. Escalation attempt - strategy changes to rewrite
      recovery = engine.suggestRecovery(request, 'Line patch mismatch');
      expect(recovery.patchStrategy).toBe('rewrite');
      expect(recovery.details._recoveryNotice).toContain('Escalated to full rewrite');

      // 3. Register success clears failure count
      engine.registerSuccess('src/app.ts');
      expect(engine.getFailureCount('src/app.ts')).toBe(0);
    });
  });

  describe('VerificationPipeline', () => {
    it('should run build, diagnostics, and tests in order', async () => {
      const mockAdapter: WorkspaceAdapter = {
        name: 'Mock',
        build: vi.fn().mockResolvedValue({ success: true, output: 'Compile ok' }),
        test: vi.fn().mockResolvedValue({ success: true, output: 'All tests passed' }),
        restart: vi.fn().mockResolvedValue({ success: true }),
        getDiagnostics: vi.fn().mockResolvedValue({ errorsCount: 0, output: 'No warnings' }),
        getPackageManager: () => 'npm',
      };

      const pipeline = new VerificationPipeline(mockAdapter);
      const report = await pipeline.verify();

      expect(mockAdapter.build).toHaveBeenCalled();
      expect(mockAdapter.getDiagnostics).toHaveBeenCalled();
      expect(mockAdapter.test).toHaveBeenCalled();

      expect(report.success).toBe(true);
      expect(report.buildStatus).toBe('passed');
      expect(report.testStatus).toBe('passed');
      expect(report.diagnosticsCount).toBe(0);
    });

    it('should stop test execution if build fails', async () => {
      const mockAdapter: WorkspaceAdapter = {
        name: 'Mock',
        build: vi.fn().mockResolvedValue({ success: false, output: 'Syntax error on line 4' }),
        test: vi.fn().mockResolvedValue({ success: true, output: 'All tests passed' }),
        restart: vi.fn().mockResolvedValue({ success: true }),
        getDiagnostics: vi.fn().mockResolvedValue({ errorsCount: 1, output: 'Lint warning' }),
        getPackageManager: () => 'npm',
      };

      const pipeline = new VerificationPipeline(mockAdapter);
      const report = await pipeline.verify();

      expect(mockAdapter.build).toHaveBeenCalled();
      expect(mockAdapter.getDiagnostics).toHaveBeenCalled();
      expect(mockAdapter.test).not.toHaveBeenCalled(); // Should skip tests!

      expect(report.success).toBe(false);
      expect(report.buildStatus).toBe('failed');
      expect(report.testStatus).toBe('skipped');
    });
  });

});

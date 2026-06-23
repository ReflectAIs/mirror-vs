import { execFileSync } from 'child_process';

export function runWorkspaceVerification(workspaceFolder: string): string {
  let output = '\n\n### AUTOMATED POST-PATCH VERIFICATION:\n';
  output += '✅ Patch Applied Successfully.\n';
  output += '⚠️ NOT YET VERIFIED. Requires compilation/build validation and runtime tests to verify correctness.\n';

  let compilePassed = true;
  let lintPassed = true;
  let testsPassed = true;

  // 1. Run Compile / Build check
  try {
    output += '\n\nRunning build/compile check...';
    const compileOutput = execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'compile'], {
      cwd: workspaceFolder,
      encoding: 'utf8',
      timeout: 15000,
      stdio: 'pipe',
    });
    output += '\n[Build Status]: Success\n' + compileOutput.substring(0, 1000);
  } catch (err: any) {
    console.error('Compile/build check failed:', err.message || String(err));
    compilePassed = false;
    output +=
      '\n[Build Status]: FAILED\n' + (err.stdout || '') + '\n' + (err.stderr || '') + '\n' + (err.message || '');
  }

  // 2. Run Lint check
  try {
    output += '\n\nRunning lint check...';
    const lintOutput = execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'lint'], {
      cwd: workspaceFolder,
      encoding: 'utf8',
      timeout: 15000,
      stdio: 'pipe',
    });
    output += '\n[Lint Status]: Success\n' + lintOutput.substring(0, 1000);
  } catch (err: any) {
    console.error('Lint check failed:', err.message || String(err));
    lintPassed = false;
    output +=
      '\n[Lint Status]: FAILED or Warnings detected\n' + (err.stdout || '') + '\n' + (err.stderr || '') + '\n';
  }

  // 3. Run Tests
  try {
    output += '\n\nRunning test suite...';
    const testOutput = execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'test'], {
      cwd: workspaceFolder,
      encoding: 'utf8',
      timeout: 30000,
      stdio: 'pipe',
    });
    output += '\n[Test Status]: Success\n' + testOutput.substring(0, 1000);
  } catch (err: any) {
    console.error('Test run failed:', err.message || String(err));
    testsPassed = false;
    output += '\n[Test Status]: FAILED\n' + (err.stdout || '') + '\n' + (err.stderr || '') + '\n';
  }

  output += '\n\n### VERIFICATION REPORT:\n';
  if (compilePassed && lintPassed && testsPassed) {
    output += '✅ VERIFIED: Build, lint, and tests passed successfully.\n';
  } else {
    output +=
      '❌ NOT YET VERIFIED: Build or tests failed. Please review the compilation and test diagnostics output above.\n';
  }

  return output;
}

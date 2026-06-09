/**
 * Test Service — integrates with VS Code's Testing API to discover, run, and analyze tests.
 * Enables agent-driven test generation, execution, and failure analysis.
 * Supports auto-fix loops: run tests → find failures → fix code → re-run.
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface TestResult {
  name: string;
  filePath: string;
  status: 'passed' | 'failed' | 'skipped' | 'error';
  duration: number;
  message?: string;
  line?: number;
}

export interface TestSuite {
  filePath: string;
  tests: TestResult[];
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
}

export interface CoverageSummary {
  lines: { covered: number; total: number; percent: number };
  branches: { covered: number; total: number; percent: number };
  functions: { covered: number; total: number; percent: number };
  statements: { covered: number; total: number; percent: number };
}

export class TestService {
  private static instance: TestService;
  private _testResults: TestSuite[] = [];
  private _lastRunTime = 0;

  static getInstance(): TestService {
    if (!TestService.instance) {
      TestService.instance = new TestService();
    }
    return TestService.instance;
  }

  /**
   * Detect the test framework for a given workspace.
   */
  detectFramework(): string | null {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) return null;

    const packageJsonPath = path.join(workspaceFolder, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const deps = { ...pkg.devDependencies, ...pkg.dependencies };
        if (deps['vitest']) return 'vitest';
        if (deps['jest']) return 'jest';
        if (deps['mocha']) return 'mocha';
        if (deps['ava']) return 'ava';
        if (deps['@playwright/test']) return 'playwright';
      } catch {
        // ignore
      }
    }

    // Check for Python test frameworks
    const pytestPath = path.join(workspaceFolder, 'pytest.ini');
    if (fs.existsSync(pytestPath)) return 'pytest';
    const toxPath = path.join(workspaceFolder, 'tox.ini');
    if (fs.existsSync(toxPath)) return 'tox';

    // Check for Go test files
    const goTestFiles = this._findFiles(workspaceFolder, '*_test.go', 1);
    if (goTestFiles.length > 0) return 'go-test';

    return null;
  }

  /**
   * Generate a test command for the detected framework.
   */
  getTestCommand(framework: string, filePath?: string, testName?: string): string | null {
    switch (framework) {
      case 'vitest':
        if (testName) return `npx vitest run -t "${testName}"`;
        if (filePath) return `npx vitest run "${filePath}"`;
        return 'npx vitest run';
      case 'jest':
        if (testName) return `npx jest -t "${testName}"`;
        if (filePath) return `npx jest "${filePath}"`;
        return 'npx jest';
      case 'mocha':
        if (filePath) return `npx mocha "${filePath}"`;
        return 'npx mocha --recursive';
      case 'pytest':
        if (testName) return `python -m pytest -k "${testName}" -v`;
        if (filePath) return `python -m pytest "${filePath}" -v`;
        return 'python -m pytest -v';
      case 'go-test':
        if (testName) return `go test -run "${testName}" -v`;
        if (filePath) return `go test "${filePath}" -v`;
        return 'go test ./... -v';
      default:
        return null;
    }
  }

  /**
   * Get coverage command for the detected framework.
   */
  getCoverageCommand(framework: string): string | null {
    switch (framework) {
      case 'vitest':
        return 'npx vitest run --coverage';
      case 'jest':
        return 'npx jest --coverage';
      case 'pytest':
        return 'python -m pytest --cov=. --cov-report=json';
      case 'go-test':
        return 'go test ./... -coverprofile=coverage.out';
      default:
        return null;
    }
  }

  /**
   * Parse standard test output into structured results.
   */
  parseTestOutput(output: string, framework: string): TestSuite[] {
    this._lastRunTime = Date.now();
    const suites: TestSuite[] = [];

    switch (framework) {
      case 'vitest':
      case 'jest': {
        // Parse vitest/jest output
        const lines = output.split('\n');
        let currentFile = '';
        const results: TestResult[] = [];

        for (const line of lines) {
          // File indicator: ✓ src/foo.test.ts or × src/foo.test.ts
          const fileMatch = line.match(/(?:✓|×|✓|✗|FAIL|PASS)\s+(.+?\.(?:test|spec)\.\w+)/);
          if (fileMatch) {
            if (results.length > 0) {
              suites.push({
                filePath: currentFile,
                tests: [...results],
                passed: results.filter((r) => r.status === 'passed').length,
                failed: results.filter((r) => r.status === 'failed').length,
                skipped: results.filter((r) => r.status === 'skipped').length,
                duration: results.reduce((s, r) => s + r.duration, 0),
              });
              results.length = 0;
            }
            currentFile = fileMatch[1];
          }

          // Test result: ✓ test name or × test name
          const testMatch = line.match(/\s*(✓|✓|✗|×|✔|✖)\s+(.+?)(?:\s+\d+ms)?$/);
          if (testMatch) {
            const statusChar = testMatch[1];
            const name = testMatch[2].trim();
            const timeMatch = line.match(/(\d+)ms$/);
            results.push({
              name,
              filePath: currentFile,
              status: statusChar === '✓' || statusChar === '✓' || statusChar === '✔' ? 'passed' : 'failed',
              duration: timeMatch ? parseInt(timeMatch[1]) : 0,
            });
          }
        }

        if (results.length > 0) {
          suites.push({
            filePath: currentFile,
            tests: [...results],
            passed: results.filter((r) => r.status === 'passed').length,
            failed: results.filter((r) => r.status === 'failed').length,
            skipped: results.filter((r) => r.status === 'skipped').length,
            duration: results.reduce((s, r) => s + r.duration, 0),
          });
        }
        break;
      }

      case 'pytest': {
        // Parser for pytest output (PASSED/FAILED lines)
        const lines = output.split('\n');
        let currentFile = '';
        const results: TestResult[] = [];

        for (const line of lines) {
          const fileMatch = line.match(/^(.+\.py)\s+\.{3}/);
          if (fileMatch) {
            currentFile = fileMatch[1];
          }

          const passMatch = line.match(/PASSED\s+(.+)/);
          if (passMatch) {
            results.push({
              name: passMatch[1].trim(),
              filePath: currentFile,
              status: 'passed',
              duration: 0,
            });
          }

          const failMatch = line.match(/FAILED\s+(.+)/);
          if (failMatch) {
            results.push({
              name: failMatch[1].trim(),
              filePath: currentFile,
              status: 'failed',
              duration: 0,
            });
          }
        }

        if (results.length > 0) {
          suites.push({
            filePath: currentFile,
            tests: [...results],
            passed: results.filter((r) => r.status === 'passed').length,
            failed: results.filter((r) => r.status === 'failed').length,
            skipped: results.filter((r) => r.status === 'skipped').length,
            duration: results.reduce((s, r) => s + r.duration, 0),
          });
        }
        break;
      }

      default: {
        // Generic fallback: extract file paths and count results
        const lines = output.split('\n');
        for (const line of lines) {
          if (
            line.includes('pass') ||
            line.includes('fail') ||
            line.includes('PASS') ||
            line.includes('FAIL')
          ) {
            suites.push({
              filePath: 'unknown',
              tests: [
                {
                  name: line.trim().substring(0, 100),
                  filePath: 'unknown',
                  status: line.includes('fail') || line.includes('FAIL') ? 'failed' : 'passed',
                  duration: 0,
                  message: line.trim(),
                },
              ],
              passed: line.includes('fail') || line.includes('FAIL') ? 0 : 1,
              failed: line.includes('fail') || line.includes('FAIL') ? 1 : 0,
              skipped: 0,
              duration: 0,
            });
          }
        }
      }
    }

    this._testResults = suites;
    return suites;
  }

  /**
   * Try to read coverage data from standard coverage output files.
   */
  readCoverageData(): CoverageSummary | null {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) return null;

    // Check for coverage-summary.json (vitest, jest)
    const coverageSummaryPath = path.join(workspaceFolder, 'coverage', 'coverage-summary.json');
    if (fs.existsSync(coverageSummaryPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(coverageSummaryPath, 'utf8'));
        const total = data.total || data;
        return {
          lines: {
            covered: total.lines?.covered || 0,
            total: total.lines?.total || 0,
            percent: total.lines?.pct || 0,
          },
          branches: {
            covered: total.branches?.covered || 0,
            total: total.branches?.total || 0,
            percent: total.branches?.pct || 0,
          },
          functions: {
            covered: total.functions?.covered || 0,
            total: total.functions?.total || 0,
            percent: total.functions?.pct || 0,
          },
          statements: {
            covered: total.statements?.covered || 0,
            total: total.statements?.total || 0,
            percent: total.statements?.pct || 0,
          },
        };
      } catch {
        // ignore
      }
    }

    // Check for coverage.xml (Python coverage)
    const coverageXmlPath = path.join(workspaceFolder, 'coverage.xml');
    if (fs.existsSync(coverageXmlPath)) {
      try {
        const xml = fs.readFileSync(coverageXmlPath, 'utf8');
        const lineRate = parseFloat(xml.match(/line-rate="([^"]+)"/)?.[1] || '0');
        const branchRate = parseFloat(xml.match(/branch-rate="([^"]+)"/)?.[1] || '0');
        const linesCovered = parseInt(xml.match(/lines-covered="(\d+)"/)?.[1] || '0');
        const linesTotal = parseInt(xml.match(/lines-valid="(\d+)"/)?.[1] || '0');
        return {
          lines: { covered: linesCovered, total: linesTotal, percent: lineRate * 100 },
          branches: { covered: 0, total: 0, percent: branchRate * 100 },
          functions: { covered: 0, total: 0, percent: 0 },
          statements: { covered: linesCovered, total: linesTotal, percent: lineRate * 100 },
        };
      } catch {
        // ignore
      }
    }

    return null;
  }

  /**
   * Get the latest test results.
   */
  getLastResults(): TestSuite[] {
    return this._testResults;
  }

  /**
   * Get a summary of the last test run as a formatted string.
   */
  getTestSummary(): string {
    if (this._testResults.length === 0) {
      return 'No test results available. Run tests first.';
    }

    let totalPassed = 0;
    let totalFailed = 0;
    let totalSkipped = 0;
    let totalDuration = 0;

    for (const suite of this._testResults) {
      totalPassed += suite.passed;
      totalFailed += suite.failed;
      totalSkipped += suite.skipped;
      totalDuration += suite.duration;
    }

    const total = totalPassed + totalFailed + totalSkipped;
    const passRate = total > 0 ? ((totalPassed / total) * 100).toFixed(1) : '0';

    let summary = `Test Results: ${totalPassed} passed, ${totalFailed} failed, ${totalSkipped} skipped (${passRate}% pass rate)\n`;
    summary += `Total duration: ${totalDuration}ms\n`;

    if (totalFailed > 0) {
      summary += '\nFailed tests:\n';
      for (const suite of this._testResults) {
        for (const test of suite.tests) {
          if (test.status === 'failed') {
            summary += `  - ${test.name} (${suite.filePath})\n`;
            if (test.message) {
              summary += `    ${test.message.substring(0, 200)}\n`;
            }
          }
        }
      }
    }

    return summary;
  }

  /**
   * Get a failure report suitable for the agent to fix.
   */
  getFailureReport(): string {
    const failures = this._testResults
      .flatMap((s) => s.tests.filter((t) => t.status === 'failed'))
      .slice(0, 20);

    if (failures.length === 0) return '';

    let report = '## Test Failures to Fix\n\n';
    for (const f of failures) {
      report += `### ${f.name}\n`;
      report += `File: ${f.filePath}\n`;
      if (f.line) report += `Line: ${f.line}\n`;
      if (f.message) report += `\n\`\`\`\n${f.message.substring(0, 1000)}\n\`\`\`\n`;
      report += '\n';
    }

    return report;
  }

  /**
   * Clear stored test results.
   */
  clearResults(): void {
    this._testResults = [];
  }

  private _findFiles(dir: string, pattern: string, maxDepth: number, currentDepth = 1): string[] {
    if (currentDepth > maxDepth) return [];
    const results: string[] = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (['node_modules', '.git', 'dist'].includes(entry.name)) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && currentDepth < maxDepth) {
          results.push(...this._findFiles(fullPath, pattern, maxDepth, currentDepth + 1));
        } else if (entry.isFile()) {
          // Simple glob matching
          const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
          if (regex.test(entry.name)) {
            results.push(fullPath);
          }
        }
      }
    } catch {
      // skip
    }
    return results;
  }
}

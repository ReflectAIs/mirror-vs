import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as vscode from 'vscode';

// Mock vscode
vi.mock('vscode', () => {
  const mockWorkspace = {
    workspaceFolders: [{ uri: { fsPath: '' }, name: 'test' }],
    getConfiguration: vi.fn().mockReturnValue({
      get: vi.fn(),
    }),
  };
  return {
    workspace: mockWorkspace,
    window: {
      showWarningMessage: vi.fn(),
      showInformationMessage: vi.fn(),
    },
  };
});

describe('Code Analysis Tools', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-test-'));
    // Override workspace folder
    (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: testDir }, name: 'test' }];
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  function createFile(relPath: string, content: string) {
    const fullPath = path.join(testDir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
  }

  it('should analyze project overview', async () => {
    createFile('src/index.ts', 'export const greet = (name: string) => `Hello ${name}`;');
    createFile('src/utils.ts', 'export const add = (a: number, b: number) => a + b;\nexport const sub = (a: number, b: number) => a - b;');
    createFile('package.json', JSON.stringify({ dependencies: { react: '^18.0.0' } }));

    const { executeCodeAnalysisTool } = await import('../code-analysis-tools.js');
    const result = await executeCodeAnalysisTool({ name: 'analyze_project', path: '' });

    expect(result).toContain('Project');
    expect(result).toContain('React');
    expect(result).toContain('Source files');
    expect(result).toContain('utils.ts');
    expect(result).toContain('Analysis completed in');
  });

  it('should detect circular dependencies', async () => {
    createFile('src/a.ts', 'import { b } from "./b"; export const a = 1;');
    createFile('src/b.ts', 'import { a } from "./a"; export const b = 2;');
    createFile('package.json', '{}');

    const { executeCodeAnalysisTool } = await import('../code-analysis-tools.js');
    const result = await executeCodeAnalysisTool({ name: 'analyze_dependencies', path: '' });

    expect(result).toContain('Circular');
    expect(result).toContain('a.ts');
    expect(result).toContain('b.ts');
  });

  it('should analyze complexity', async () => {
    createFile('src/complex.ts', `
      export function simple() { return 1; }
      export function complex(x: number) {
        if (x > 0) {
          if (x > 1) {
            if (x > 2) {
              if (x > 3) {
                if (x > 4) {
                  if (x > 5) {
                    if (x > 6) {
                      if (x > 7) {
                        if (x > 8) {
                          if (x > 9) {
                            return x;
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
        return x;
      }
    `);
    createFile('package.json', '{}');

    const { executeCodeAnalysisTool } = await import('../code-analysis-tools.js');
    const result = await executeCodeAnalysisTool({ name: 'analyze_complexity', path: '' });

    expect(result).toContain('Complexity');
    expect(result).toContain('complex');
  });

  it('should analyze test coverage', async () => {
    createFile('src/index.ts', 'export const x = 1;');
    createFile('src/utils.ts', 'export const y = 2;');
    createFile('src/index.test.ts', 'import { x } from "./index"; test("x", () => expect(x).toBe(1));');
    createFile('package.json', '{}');

    const { executeCodeAnalysisTool } = await import('../code-analysis-tools.js');
    const result = await executeCodeAnalysisTool({ name: 'analyze_coverage', path: '' });

    expect(result).toContain('Coverage');
    expect(result).toContain('utils.ts');
  });

  it('should detect dead code', async () => {
    createFile('src/used.ts', 'export const coreFn = () => 1;');
    createFile('src/unused.ts', 'export const orphanFn = () => 2;');
    createFile('src/main.ts', 'import { coreFn } from "./used"; console.log(coreFn());');
    createFile('package.json', '{}');

    const { executeCodeAnalysisTool } = await import('../code-analysis-tools.js');
    const result = await executeCodeAnalysisTool({ name: 'analyze_dead_code', path: '' });

    expect(result).toContain('Dead Code');
    expect(result).toContain('orphanFn');
    expect(result).not.toContain('coreFn');
  });

  it('should analyze impact of a file', async () => {
    createFile('src/core.ts', 'export const core = 1;');
    createFile('src/consumer.ts', 'import { core } from "./core"; console.log(core);');
    createFile('package.json', '{}');

    const { executeCodeAnalysisTool } = await import('../code-analysis-tools.js');
    const result = await executeCodeAnalysisTool({ name: 'analyze_impact', path: 'src/core.ts' });

    expect(result).toContain('Impact');
    expect(result).toContain('consumer.ts');
    expect(result).toContain('dependents');
  });

  it('should handle empty project gracefully', async () => {
    createFile('package.json', '{}');

    const { executeCodeAnalysisTool } = await import('../code-analysis-tools.js');
    const result = await executeCodeAnalysisTool({ name: 'analyze_project', path: '' });

    expect(result).toContain('Project');
    expect(result).toContain('Source files: 0');
  });
});

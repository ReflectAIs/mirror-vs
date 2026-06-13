import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { executeDeveloperTool } from '../developer-tools';

function createTempDir(): string {
  const tmpDir = path.join(__dirname, '__temp_dev_test__');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }
  return tmpDir;
}

function cleanupTempDir(dir: string) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('executeDeveloperTool', () => {
  describe('python_eval', () => {
    it('should throw if code is missing', async () => {
      const tool = { name: 'python_eval' as const, code: undefined as any };
      await expect(executeDeveloperTool(tool)).rejects.toThrow('Missing "code" attribute for python_eval.');
    });

    it('should run Python code and return stdout', async () => {
      const tool = { name: 'python_eval' as const, code: 'print("hello from python")' };
      const result = await executeDeveloperTool(tool);
      expect(result).toContain('hello from python');
    });
  });

  describe('ast_grep', () => {
    it('should throw if query is missing', async () => {
      const tool = { name: 'ast_grep' as const, query: undefined as any };
      await expect(executeDeveloperTool(tool)).rejects.toThrow('Missing "query" or "pattern" attribute for ast_grep.');
    });
  });

  describe('lint_fix', () => {
    it('should throw if path is missing', async () => {
      const tool = { name: 'lint_fix' as const, path: undefined as any };
      await expect(executeDeveloperTool(tool)).rejects.toThrow('Missing "path" attribute for lint_fix.');
    });

    it('should throw if target file does not exist', async () => {
      const tmpDir = createTempDir();
      const workspaceFoldersBackup = vscode.workspace.workspaceFolders;
      (vscode.workspace as any).workspaceFolders = [{ uri: vscode.Uri.file(tmpDir), name: 'test', index: 0 }];

      try {
        const tool = { name: 'lint_fix' as const, path: 'missing_file.js' };
        await expect(executeDeveloperTool(tool)).rejects.toThrow('Target file does not exist: missing_file.js');
      } finally {
        (vscode.workspace as any).workspaceFolders = workspaceFoldersBackup;
        cleanupTempDir(tmpDir);
      }
    });
  });
});

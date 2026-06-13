import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

// Mock editor-utils
vi.mock('../../../utils/editor-utils', () => ({
  createCheckpoint: vi.fn().mockResolvedValue('cp_test123'),
  revertCheckpoint: vi.fn().mockResolvedValue(true),
}));

import { executeFileTool } from '../file-tools';

function createTempDir(): string {
  const tmpDir = path.join(__dirname, '__temp_test_fs__');
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

describe('executeFileTool', () => {
  const getSafePath = (p: string) => `/mock/workspace/${p}`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list_dir', () => {
    it('should throw if path is missing', async () => {
      const tool = { name: 'list_dir' as const, path: undefined as any };
      await expect(executeFileTool(tool, getSafePath)).rejects.toThrow('Missing "path" attribute for list_dir.');
    });

    it('should throw if directory does not exist', async () => {
      const tool = { name: 'list_dir' as const, path: 'nonexistent' };
      await expect(executeFileTool(tool, getSafePath)).rejects.toThrow('Directory does not exist: nonexistent');
    });
  });

  describe('read_file', () => {
    it('should throw if path is missing', async () => {
      const tool = { name: 'read_file' as const, path: undefined as any };
      await expect(executeFileTool(tool, getSafePath)).rejects.toThrow('Missing "path" attribute for read_file.');
    });

    it('should throw if file does not exist', async () => {
      const tool = { name: 'read_file' as const, path: 'missing.ts' };
      await expect(executeFileTool(tool, getSafePath)).rejects.toThrow('File does not exist: missing.ts');
    });

    it('should return proposed content if file is in active review', async () => {
      const tmpDir = createTempDir();
      const { ReviewManager } = await import('../../../services/review-manager.js');
      const rm = ReviewManager.getInstance();
      let spy: any;
      try {
        const filePath = 'review.txt';
        const absolutePath = path.join(tmpDir, filePath);
        fs.writeFileSync(absolutePath, 'original disk content', 'utf8');

        spy = vi.spyOn(rm, 'getProposedContent').mockReturnValue('mock proposed clean content');

        const localGetSafe = (p: string) => path.join(tmpDir, p);
        const tool = { name: 'read_file' as const, path: filePath };
        const result = await executeFileTool(tool, localGetSafe);

        expect(result).toBe('[File: review.txt — showing lines 1-1 of 1 total]\n1: mock proposed clean content');
        expect(spy).toHaveBeenCalledWith(absolutePath);
      } finally {
        if (spy) spy.mockRestore();
        cleanupTempDir(tmpDir);
      }
    });
  });

  describe('create_file', () => {
    it('should throw if path is missing', async () => {
      const tool = { name: 'create_file' as const, path: undefined as any, content: 'test' };
      await expect(executeFileTool(tool, getSafePath)).rejects.toThrow('Missing "path" attribute for create_file.');
    });

    it('should throw if path escapes workspace', async () => {
      const tool = { name: 'create_file' as const, path: '../outside.txt', content: 'test' };
      const unsafeGetPath = () => {
        throw new Error('Access denied: File path is outside of workspace.');
      };
      await expect(executeFileTool(tool, unsafeGetPath)).rejects.toThrow('Access denied');
    });
  });

  describe('write_file', () => {
    it('should throw if path is missing', async () => {
      const tool = { name: 'write_file' as const, path: undefined as any, content: 'data' };
      await expect(executeFileTool(tool, getSafePath)).rejects.toThrow('Missing "path" attribute for write_file.');
    });
  });

  describe('patch_file', () => {
    it('should throw if path is missing', async () => {
      const tool = { name: 'patch_file' as const, path: undefined as any, content: 'data' };
      await expect(executeFileTool(tool, getSafePath)).rejects.toThrow('Missing "path" attribute for patch_file.');
    });

    it('should throw if file does not exist', async () => {
      const tool = {
        name: 'patch_file' as const,
        path: 'nonexistent.ts',
        content: '<<<<<<< SEARCH\na\n=======\nb\n>>>>>>> REPLACE',
      };
      await expect(executeFileTool(tool, getSafePath)).rejects.toThrow('File does not exist: nonexistent.ts');
    });

    it('should throw if no valid SEARCH/REPLACE blocks', async () => {
      const tmpDir = createTempDir();
      try {
        const filePath = path.join(tmpDir, 'test.txt');
        fs.writeFileSync(filePath, 'hello world', 'utf8');

        const localGetSafe = (p: string) => path.join(tmpDir, p);
        const tool = { name: 'patch_file' as const, path: 'test.txt', content: 'no valid patch blocks' };
        await expect(executeFileTool(tool, localGetSafe)).rejects.toThrow(
          'No valid SEARCH/REPLACE blocks found in patch_file content.',
        );
      } finally {
        cleanupTempDir(tmpDir);
      }
    });

    it('should successfully parse and apply label-style SEARCH: / REPLACE: patches', async () => {
      const tmpDir = createTempDir();
      try {
        const filePath = path.join(tmpDir, 'test.txt');
        fs.writeFileSync(filePath, 'hello world\nthis is a test\nend', 'utf8');

        const localGetSafe = (p: string) => path.join(tmpDir, p);
        const tool = {
          name: 'patch_file' as const,
          path: 'test.txt',
          content: 'SEARCH:\nthis is a test\nREPLACE:\nthis is a patched test',
        };
        const result = await executeFileTool(tool, localGetSafe);
        expect(result).toContain('File patched: test.txt');

        const { ReviewManager } = await import('../../../services/review-manager.js');
        const rm = ReviewManager.getInstance();
        const proposed = rm.getProposedContent(filePath);
        expect(proposed).toBe('hello world\nthis is a patched test\nend');
      } finally {
        cleanupTempDir(tmpDir);
      }
    });
  });

  describe('multi_patch_file', () => {
    it('should successfully apply patches to multiple files', async () => {
      const tmpDir = createTempDir();
      try {
        const filePath1 = path.join(tmpDir, 'file1.txt');
        const filePath2 = path.join(tmpDir, 'file2.txt');
        fs.writeFileSync(filePath1, 'file one original content', 'utf8');
        fs.writeFileSync(filePath2, 'file two original content', 'utf8');

        const localGetSafe = (p: string) => path.join(tmpDir, p);
        const tool = {
          name: 'multi_patch_file' as const,
          content: `
<file path="file1.txt">
<<<<<<< SEARCH
one original
=======
one updated
>>>>>>> REPLACE
</file>
<file path="file2.txt">
SEARCH
two original
REPLACE
two updated
</file>
`,
        };

        const result = await executeFileTool(tool, localGetSafe);
        expect(result).toContain('Patched file1.txt');
        expect(result).toContain('Patched file2.txt');

        const { ReviewManager } = await import('../../../services/review-manager.js');
        const rm = ReviewManager.getInstance();
        expect(rm.getProposedContent(filePath1)).toBe('file one updated content');
        expect(rm.getProposedContent(filePath2)).toBe('file two updated content');
      } finally {
        cleanupTempDir(tmpDir);
      }
    });

    it('should throw if no files are matched', async () => {
      const tool = {
        name: 'multi_patch_file' as const,
        content: 'some non xml content',
      };
      await expect(executeFileTool(tool, getSafePath)).rejects.toThrow(
        'No valid <file path="...">...</file> blocks containing SEARCH/REPLACE blocks found in multi_patch_file.',
      );
    });
  });

  describe('unsupported tool', () => {
    it('should throw for invalid tool name', async () => {
      const tool = { name: 'invalid_tool' as any };
      await expect(executeFileTool(tool, getSafePath)).rejects.toThrow('Invalid file tool: invalid_tool');
    });
  });

  describe('update_plan', () => {
    it('should successfully write content to task.md', async () => {
      const tmpDir = createTempDir();
      try {
        const localGetSafe = (p: string) => path.join(tmpDir, p);
        const tool = {
          name: 'update_plan' as const,
          content: '- [x] Step 1\n- [ ] Step 2',
        };

        // Mock vscode.workspace.workspaceFolders
        const workspaceFoldersBackup = vscode.workspace.workspaceFolders;
        (vscode.workspace as any).workspaceFolders = [{ uri: vscode.Uri.file(tmpDir), name: 'test', index: 0 }];

        try {
          const result = await executeFileTool(tool, localGetSafe);
          expect(result).toContain('Successfully updated active plan checklist');

          const taskPath = path.join(tmpDir, '.mirror-vs', 'task.md');
          expect(fs.existsSync(taskPath)).toBe(true);
          expect(fs.readFileSync(taskPath, 'utf8')).toBe('- [x] Step 1\n- [ ] Step 2');
        } finally {
          (vscode.workspace as any).workspaceFolders = workspaceFoldersBackup;
        }
      } finally {
        cleanupTempDir(tmpDir);
      }
    });
  });
});

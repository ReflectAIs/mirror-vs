import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

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
      try {
        const filePath = 'review.txt';
        const absolutePath = path.join(tmpDir, filePath);
        fs.writeFileSync(absolutePath, 'original disk content', 'utf8');

        const { ReviewManager } = await import('../../../services/review-manager.js');
        const rm = ReviewManager.getInstance();
        const spy = vi.spyOn(rm, 'getProposedContent').mockReturnValue('mock proposed clean content');

        const localGetSafe = (p: string) => path.join(tmpDir, p);
        const tool = { name: 'read_file' as const, path: filePath };
        const result = await executeFileTool(tool, localGetSafe);

        expect(result).toBe('mock proposed clean content');
        expect(spy).toHaveBeenCalledWith(absolutePath);
        spy.mockRestore();
      } finally {
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
  });

  describe('unsupported tool', () => {
    it('should throw for invalid tool name', async () => {
      const tool = { name: 'invalid_tool' as any };
      await expect(executeFileTool(tool, getSafePath)).rejects.toThrow('Invalid file tool: invalid_tool');
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { TransactionalCommitPipeline, FileBufferMutation } from '../TransactionalCommitPipeline';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    promises: {
      ...actual.promises,
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
    },
    existsSync: vi.fn().mockReturnValue(true),
  };
});

describe('TransactionalCommitPipeline', () => {
  let pipeline: TransactionalCommitPipeline;

  beforeEach(() => {
    pipeline = new TransactionalCommitPipeline();
    vi.clearAllMocks();
    vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.promises.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.existsSync).mockReturnValue(true);
  });

  it('commits a valid TypeScript file successfully', async () => {
    const mutation: FileBufferMutation = {
      workspaceAbsolutePath: '/workspace/src/app.ts',
      proposedFileBuffer: 'function foo() { return { bar: [1, 2] }; }',
    };
    const result = await pipeline.stageAndExecuteTransaction([mutation]);
    expect(result.success).toBe(true);
    expect(fs.promises.writeFile).toHaveBeenCalledOnce();
  });

  it('rejects a file with mismatched curly braces', async () => {
    const mutation: FileBufferMutation = {
      workspaceAbsolutePath: '/workspace/src/broken.ts',
      proposedFileBuffer: 'function foo() { return { bar: 1; }', // missing closing }
    };
    const result = await pipeline.stageAndExecuteTransaction([mutation]);
    expect(result.success).toBe(false);
    expect(result.errorLog).toContain('Curly brace mismatch');
    expect(result.errorLog).toContain('atomic rollback');
    expect(fs.promises.writeFile).not.toHaveBeenCalled();
  });

  it('rejects entire batch if one file fails — atomic rollback (Q2: Option A)', async () => {
    const mutations: FileBufferMutation[] = [
      { workspaceAbsolutePath: '/workspace/src/good.ts', proposedFileBuffer: 'const x = { a: 1 };' },
      { workspaceAbsolutePath: '/workspace/src/bad.ts', proposedFileBuffer: 'const y = { b: 1;' }, // broken
    ];
    const result = await pipeline.stageAndExecuteTransaction(mutations);
    expect(result.success).toBe(false);
    expect(result.errorLog).toContain('2 file(s) in this batch were rejected');
    // NEITHER file should be written
    expect(fs.promises.writeFile).not.toHaveBeenCalled();
  });

  it('skips brace audit for non-auditable extensions (e.g. .md)', async () => {
    const mutation: FileBufferMutation = {
      workspaceAbsolutePath: '/workspace/README.md',
      proposedFileBuffer: 'This is {unbalanced markdown content {{',
    };
    const result = await pipeline.stageAndExecuteTransaction([mutation]);
    expect(result.success).toBe(true);
    expect(result.skippedAuditFiles).toContain('README.md');
    expect(fs.promises.writeFile).toHaveBeenCalledOnce();
  });

  it('correctly handles template literals with embedded braces', async () => {
    const mutation: FileBufferMutation = {
      workspaceAbsolutePath: '/workspace/src/template.ts',
      // Template literal contains a nested ${...} which would be a false positive without stripping
      proposedFileBuffer: 'const msg = `Hello ${name}`; function wrap() { return msg; }',
    };
    const result = await pipeline.stageAndExecuteTransaction([mutation]);
    expect(result.success).toBe(true);
  });

  it('correctly handles block comments with unbalanced braces', async () => {
    const mutation: FileBufferMutation = {
      workspaceAbsolutePath: '/workspace/src/commented.ts',
      proposedFileBuffer: '/* { unbalanced in comment */ function foo() { return 1; }',
    };
    const result = await pipeline.stageAndExecuteTransaction([mutation]);
    expect(result.success).toBe(true);
  });

  it('correctly handles JSON files', async () => {
    const mutation: FileBufferMutation = {
      workspaceAbsolutePath: '/workspace/package.json',
      proposedFileBuffer: '{ "name": "test", "version": "1.0.0" }',
    };
    const result = await pipeline.stageAndExecuteTransaction([mutation]);
    expect(result.success).toBe(true);
  });

  it('rejects JSON with mismatched square brackets', async () => {
    const mutation: FileBufferMutation = {
      workspaceAbsolutePath: '/workspace/data.json',
      proposedFileBuffer: '{ "items": [1, 2, 3 }', // ] not closed
    };
    const result = await pipeline.stageAndExecuteTransaction([mutation]);
    expect(result.success).toBe(false);
    expect(result.errorLog).toContain('Square bracket mismatch');
  });
});

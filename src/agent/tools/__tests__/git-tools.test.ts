import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeGitTool } from '../git-tools';
import { execFileSync } from 'child_process';

vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
}));

describe('executeGitTool checkpoint and rollback', () => {
  const mockWorkspace = '/mock/workspace';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should run git add and git commit on git_checkpoint', async () => {
    const mockExec = vi.mocked(execFileSync);
    mockExec.mockReturnValueOnce('true' as any); // git rev-parse inside work tree
    mockExec.mockReturnValueOnce('' as any); // git add -A
    mockExec.mockReturnValueOnce('' as any); // git commit
    mockExec.mockReturnValueOnce('mock-hash-123\n' as any); // git rev-parse HEAD

    const result = await executeGitTool({ name: 'git_checkpoint' }, mockWorkspace);
    expect(result).toContain('Checkpoint created successfully');
    expect(result).toContain('mock-hash-123');

    expect(mockExec).toHaveBeenCalledWith('git', ['add', '-A'], expect.any(Object));
    expect(mockExec).toHaveBeenCalledWith('git', ['commit', '--allow-empty', '-m', expect.stringContaining('mirror-checkpoint')], expect.any(Object));
    expect(mockExec).toHaveBeenCalledWith('git', ['rev-parse', 'HEAD'], expect.any(Object));
  });

  it('should run git reset and clean on git_rollback', async () => {
    const mockExec = vi.mocked(execFileSync);
    mockExec.mockReturnValueOnce('true' as any); // git rev-parse inside work tree
    mockExec.mockReturnValueOnce('' as any); // git reset
    mockExec.mockReturnValueOnce('' as any); // git clean

    const result = await executeGitTool({ name: 'git_rollback', checkpoint_id: 'mock-hash-123' }, mockWorkspace);
    expect(result).toContain('rolled back successfully');
    expect(result).toContain('mock-hash-123');

    expect(mockExec).toHaveBeenCalledWith('git', ['reset', '--hard', 'mock-hash-123'], expect.any(Object));
    expect(mockExec).toHaveBeenCalledWith('git', ['clean', '-fd'], expect.any(Object));
  });

  it('should reject git_rollback if checkpoint_id is missing', async () => {
    const mockExec = vi.mocked(execFileSync);
    mockExec.mockReturnValueOnce('true' as any);

    const result = await executeGitTool({ name: 'git_rollback' }, mockWorkspace);
    expect(result).toContain('Error: Missing "checkpoint_id"');
  });
});

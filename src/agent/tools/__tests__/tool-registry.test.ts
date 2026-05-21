
import { describe, it, expect, vi } from 'vitest';

vi.mock('../file-tools', () => ({
  executeFileTool: vi.fn().mockResolvedValue('file tool result'),
}));

vi.mock('../search-tools', () => ({
  executeSearchTool: vi.fn().mockResolvedValue('search result'),
}));

vi.mock('../browser-tools', () => ({
  executeBrowserTool: vi.fn().mockResolvedValue('browser result'),
}));

vi.mock('../terminal-tools', () => ({
  executeTerminalTool: vi.fn().mockResolvedValue('terminal result'),
}));

import { executeTool } from '../tool-registry';

describe('executeTool', () => {
  const getSafePath = (p: string) => `/workspace/${p}`;

  it('should route file tools correctly', async () => {
    const result = await executeTool({ name: 'read_file', path: 'test.ts' }, getSafePath);
    expect(result).toBe('file tool result');
  });

  it('should route create_file correctly', async () => {
    const result = await executeTool({ name: 'create_file', path: 'new.ts', content: 'hi' }, getSafePath);
    expect(result).toBe('file tool result');
  });

  it('should route write_file correctly', async () => {
    const result = await executeTool({ name: 'write_file', path: 'ex.ts', content: 'hi' }, getSafePath);
    expect(result).toBe('file tool result');
  });

  it('should route patch_file correctly', async () => {
    const result = await executeTool({ name: 'patch_file', path: 'ex.ts', content: 'patch' }, getSafePath);
    expect(result).toBe('file tool result');
  });

  it('should route list_dir correctly', async () => {
    const result = await executeTool({ name: 'list_dir', path: '.' }, getSafePath);
    expect(result).toBe('file tool result');
  });

  it('should route grep_search to search tools', async () => {
    const result = await executeTool({ name: 'grep_search', query: 'test' }, getSafePath);
    expect(result).toBe('search result');
  });

  it('should route browser tools correctly', async () => {
    const result = await executeTool({ name: 'browser_navigate', url: 'http://test.com' }, getSafePath);
    expect(result).toBe('browser result');
  });

  it('should route browser_screenshot correctly', async () => {
    const result = await executeTool({ name: 'browser_screenshot' }, getSafePath);
    expect(result).toBe('browser result');
  });

  it('should route terminal tools correctly', async () => {
    const result = await executeTool({ name: 'run_command', command: 'echo hi' }, getSafePath);
    expect(result).toBe('terminal result');
  });

  it('should route close_terminal correctly', async () => {
    const result = await executeTool({ name: 'close_terminal', terminal_name: 'test' }, getSafePath);
    expect(result).toBe('terminal result');
  });

  it('should throw for unsupported tool', async () => {
    await expect(executeTool({ name: 'unknown_tool' as any }, getSafePath)).rejects.toThrow(
      'Unsupported tool call: unknown_tool',
    );
  });
});

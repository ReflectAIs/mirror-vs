import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const mockGetSimplifiedNode = vi.fn();

vi.mock('../../../services/figma-service', () => {
  return {
    FigmaService: vi.fn().mockImplementation(() => {
      return {
        getSimplifiedNode: (...args: any[]) => mockGetSimplifiedNode(...args),
      };
    }),
  };
});

import { executeFigmaTool } from '../figma-tools';

describe('executeFigmaTool', () => {
  const mockFigmaKey = 'figma-pat-key';
  const mockWorkspace = path.join(__dirname, 'mock_figma_workspace');

  beforeEach(() => {
    vi.clearAllMocks();
    if (fs.existsSync(mockWorkspace)) {
      fs.rmSync(mockWorkspace, { recursive: true, force: true });
    }
  });

  it('should throw if tool name is not figma_inspect', async () => {
    await expect(executeFigmaTool({ name: 'read_file' } as any)).rejects.toThrow(
      'Unsupported Figma tool: read_file'
    );
  });

  it('should throw if figmaKey is missing', async () => {
    await expect(
      executeFigmaTool({ name: 'figma_inspect', url: 'https://figma.com/file/ABC' }, undefined, mockWorkspace)
    ).rejects.toThrow(
      'Figma Personal Access Token is not configured'
    );
  });

  it('should throw if workspacePath is missing', async () => {
    await expect(
      executeFigmaTool({ name: 'figma_inspect', url: 'https://figma.com/file/ABC' }, mockFigmaKey, undefined)
    ).rejects.toThrow(
      'No workspace folder is open'
    );
  });

  it('should throw if Figma URL is invalid', async () => {
    await expect(
      executeFigmaTool({ name: 'figma_inspect', url: 'https://figma.com/file/invalid-url' }, mockFigmaKey, mockWorkspace)
    ).rejects.toThrow(
      'Invalid Figma URL provided'
    );
  });

  it('should correctly throw the error if fetching simplified node fails', async () => {
    const figmaUrl = 'https://figma.com/file/12345/My-Design?node-id=2-3';
    const tool = { name: 'figma_inspect' as const, url: figmaUrl };

    mockGetSimplifiedNode.mockRejectedValue(
      new Error('Figma API Error: 429 - {"status":429,"err":"Rate limit exceeded"}')
    );

    await expect(
      executeFigmaTool(tool, mockFigmaKey, mockWorkspace)
    ).rejects.toThrow(
      'Failed to fetch from Figma: Figma API Error: 429 - {"status":429,"err":"Rate limit exceeded"}'
    );
  });

  it('should save fetching results and return success message if API call is successful', async () => {
    const figmaUrl = 'https://figma.com/file/ABCDE/My-Design?node-id=10-20';
    const mockJson = JSON.stringify({ id: '10:20', name: 'Button', type: 'INSTANCE' });

    mockGetSimplifiedNode.mockResolvedValue(mockJson);

    const tool = { name: 'figma_inspect' as const, url: figmaUrl };

    const result = await executeFigmaTool(tool, mockFigmaKey, mockWorkspace);

    expect(result).toContain('Successfully fetched Figma node 10:20');
    expect(result).toContain('.mirror-vs');

    const expectedFilePath = path.join(mockWorkspace, '.mirror-vs', 'figma', 'ABCDE_10_20.json');
    expect(fs.existsSync(expectedFilePath)).toBe(true);

    const content = fs.readFileSync(expectedFilePath, 'utf8');
    expect(content).toBe(mockJson);

    // Clean up
    fs.rmSync(mockWorkspace, { recursive: true, force: true });
  });
});

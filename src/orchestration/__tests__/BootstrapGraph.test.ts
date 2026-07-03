import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BootstrapPayload } from '../BootstrapGraph';

// Mock vscode before BootstrapGraph is imported
vi.mock('vscode', () => ({
  languages: { getDiagnostics: vi.fn().mockReturnValue([]) },
  DiagnosticSeverity: { Error: 0, Warning: 1 },
  Uri: { file: (p: string) => ({ fsPath: p, toString: () => p }) },
}));

// Mock net to always refuse connections (no real ports in tests)
vi.mock('net', () => ({
  Socket: vi.fn().mockImplementation(() => {
    const handlers: Record<string, Function> = {};
    return {
      setTimeout: vi.fn(),
      once: vi.fn((event: string, fn: Function) => { handlers[event] = fn; }),
      connect: vi.fn(function () { setTimeout(() => handlers['error']?.(new Error('refused')), 0); }),
      destroy: vi.fn(),
    };
  }),
}));

// Mock fs — use a factory that defines existsSync as a writable mock fn
const mockExistsSync = vi.fn().mockReturnValue(false);
const mockReadFile = vi.fn().mockRejectedValue(new Error('ENOENT'));
const mockReaddir = vi.fn().mockResolvedValue([]);

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: mockExistsSync,
    promises: {
      ...actual.promises,
      readFile: mockReadFile,
      readdir: mockReaddir,
    },
  };
});

// Import AFTER mocks are set up
const { BootstrapGraph } = await import('../BootstrapGraph');

describe('BootstrapGraph', () => {
  let graph: InstanceType<typeof BootstrapGraph>;

  beforeEach(() => {
    graph = new BootstrapGraph();
    mockExistsSync.mockReturnValue(false);
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    mockReaddir.mockResolvedValue([]);
  });

  it('returns a valid BootstrapPayload with defaults on empty workspace', async () => {
    const payload = await graph.runDiscovery('/fake/workspace');
    expect(payload).toHaveProperty('projectMemory');
    expect(payload).toHaveProperty('workspaceTree');
    expect(payload).toHaveProperty('techStack');
    expect(payload).toHaveProperty('activePorts');
    expect(payload).toHaveProperty('diagnosticsSnapshot');
    expect(payload.projectMemory).toBe('');
    expect(payload.workspaceTree).toEqual([]);
    expect(payload.techStack).toEqual([]);
  });

  it('detects TypeScript tech stack when tsconfig.json exists', async () => {
    mockExistsSync.mockImplementation((p: string) => String(p).endsWith('tsconfig.json'));
    const payload = await graph.runDiscovery('/fake/workspace');
    expect(payload.techStack).toContain('TypeScript');
  });

  it('excludes node_modules and .git from workspace tree', async () => {
    mockReaddir.mockResolvedValue([
      { name: 'node_modules', isDirectory: () => true },
      { name: '.git', isDirectory: () => true },
      { name: 'src', isDirectory: () => true },
      { name: 'index.ts', isDirectory: () => false },
    ] as any);
    const payload = await graph.runDiscovery('/fake/workspace', 1);
    expect(payload.workspaceTree).not.toContain('node_modules/');
    expect(payload.workspaceTree).not.toContain('.git/');
    expect(payload.workspaceTree).toContain('src/');
    expect(payload.workspaceTree).toContain('index.ts');
  });

  it('formatPayloadForPrompt produces a non-empty string with tech stack', () => {
    const mockPayload: BootstrapPayload = {
      projectMemory: '',
      workspaceTree: ['src/', 'package.json'],
      techStack: ['TypeScript', 'Vite_Bundler'],
      activePorts: [5173],
      diagnosticsSnapshot: [],
    };
    const result = BootstrapGraph.formatPayloadForPrompt(mockPayload);
    expect(result).toContain('TypeScript');
    expect(result).toContain('5173');
    expect(result).toContain('Zero errors');

  });
});



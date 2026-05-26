// VS Code mock for vitest testing
export const workspace = {
  fs: {
    writeFile: async () => {},
  },
  workspaceFolders: [{ uri: { fsPath: '/mock/workspace' } }],
  getConfiguration: () => ({
    get: <T>(_key: string, defaultValue?: T) => defaultValue as T,
    update: () => Promise.resolve(),
  }),
  openTextDocument: () => Promise.resolve({
    uri: { fsPath: '/mock/workspace/file.ts' },
    lineCount: 0,
    lineAt: () => ({ range: {} }),
  }),
};

const mockTextEditor = {
  document: {
    uri: { fsPath: '/mock/workspace/file.ts' },
    lineCount: 0,
    lineAt: () => ({ range: {} }),
  },
  selection: { active: { line: 0 } },
  revealRange: () => {},
  setDecorations: () => {},
};

export const window = {
  showInformationMessage: () => Promise.resolve(undefined),
  showErrorMessage: () => Promise.resolve(undefined),
  showTextDocument: () => Promise.resolve(mockTextEditor),
  activeTextEditor: mockTextEditor,
  visibleTextEditors: [],
  createTerminal: () => ({
    show: () => {},
    sendText: () => {},
    dispose: () => {},
  }),
  onDidChangeActiveTextEditor: () => ({ dispose: () => {} }),
  onDidChangeVisibleTextEditors: () => ({ dispose: () => {} }),
  createStatusBarItem: () => ({
    show: () => {},
    hide: () => {},
    dispose: () => {},
    text: '',
    command: '',
    tooltip: '',
  }),
  createTextEditorDecorationType: () => ({
    dispose: () => {},
  }),
  tabGroups: {
    all: [],
    close: () => Promise.resolve(),
  },
};

export const commands = {
  executeCommand: () => Promise.resolve(),
  registerCommand: () => ({ dispose: () => {} }),
};

export const Uri = {
  file: (p: string) => ({ fsPath: p, path: p, scheme: 'file' }),
  joinPath: (base: { fsPath?: string } | string, ...segments: string[]) => ({
    fsPath: [typeof base === 'string' ? base : base.fsPath || '', ...segments].join('/'),
  }),
  parse: (s: string) => ({ fsPath: s, path: s, scheme: 'data' }),
};

export const ConfigurationTarget = { Global: 1, Workspace: 2 };
export const EventEmitter = class {
  event = () => ({ dispose: () => {} });
  fire() {}
  dispose() {}
};
export const SecretStorage = class {};
export const OverviewRulerLane = { Left: 1 };
export const StatusBarAlignment = { Left: 1, Right: 2 };
export const ThemeColor = {};

export default { workspace, window, commands, Uri, ConfigurationTarget, StatusBarAlignment };

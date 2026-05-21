
/**
 * VS Code mock for unit testing with vitest.
 * This file is discovered automatically when vi.mock('vscode') is used.
 */

const mockFileSystem = {
  writeFile: async () => {},
};

const mockWorkspace = {
  fs: mockFileSystem,
  workspaceFolders: [{ uri: { fsPath: '/mock/workspace' } }],
  getConfiguration: () => ({
    get: <T>(_key: string, defaultValue?: T) => defaultValue as T,
    update: () => Promise.resolve(),
  }),
};

const mockWindow = {
  showInformationMessage: () => Promise.resolve(undefined),
  showErrorMessage: () => Promise.resolve(undefined),
  showTextDocument: () => Promise.resolve({}),
  activeTextEditor: null,
  visibleTextEditors: [],
  createTerminal: () => ({
    show: () => {},
    sendText: () => {},
    dispose: () => {},
  }),
  onDidChangeActiveTextEditor: () => ({ dispose: () => {} }),
  onDidChangeVisibleTextEditors: () => ({ dispose: () => {} }),
};

const mockCommands = {
  executeCommand: () => Promise.resolve(),
  registerCommand: () => ({ dispose: () => {} }),
};

export const workspace = mockWorkspace;
export const window = mockWindow;
export const commands = mockCommands;
export const Uri = {
  file: (p: string) => ({ fsPath: p, path: p, scheme: 'file' }),
  joinPath: (base: any, ...segments: string[]) => ({
    fsPath: [base.fsPath || base, ...segments].join('/'),
  }),
};
export const ConfigurationTarget = { Global: 1, Workspace: 2 };
export const EventEmitter = vi
  ? class {
      event = () => ({ dispose: () => {} });
      fire() {}
      dispose() {}
    }
  : class {};
export const SecretStorage = class {};
export const OverviewRulerLane = { Left: 1 };
export const ThemeColor = {};

export default {
  workspace: mockWorkspace,
  window: mockWindow,
  commands: mockCommands,
  Uri,
  ConfigurationTarget,
};

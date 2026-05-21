
/**
 * VS Code mock for unit testing.
 * Import this at the top of test files: vi.mock('vscode', () => import('../../test-utils/vscode-mock'));
 * Or use the globals approach.
 */

const mockWorkspace = {
  fs: {
    writeFile: () => Promise.resolve(),
  },
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

export const workspace = mockWorkspace;
export const window = mockWindow;
export const Uri = {
  file: (p: string) => ({ fsPath: p, path: p, scheme: 'file' }),
  joinPath: (base: any, ...segments: string[]) => ({
    fsPath: [base.fsPath || base, ...segments].join('/'),
  }),
};
export const ConfigurationTarget = { Global: 1, Workspace: 2 };
export const commands = {
  executeCommand: () => Promise.resolve(),
  registerCommand: () => ({ dispose: () => {} }),
};
export const SecretStorage = class {};
export const EventEmitter = class {};
export default {
  workspace: mockWorkspace,
  window: mockWindow,
  Uri,
  ConfigurationTarget,
  commands,
};

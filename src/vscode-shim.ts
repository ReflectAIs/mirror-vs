
// This file provides a mock VSCode module for vitest tests.
// It's used via vitest's alias configuration.

export const workspace = {
  fs: {
    writeFile: async () => {},
  },
  workspaceFolders: [{ uri: { fsPath: '/mock/workspace' } }],
  getConfiguration: () => ({
    get: <T>(_key: string, defaultValue?: T) => defaultValue as T,
    update: () => Promise.resolve(),
  }),
};

export const window = {
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

export const commands = {
  executeCommand: () => Promise.resolve(),
  registerCommand: () => ({ dispose: () => {} }),
};

export const Uri = {
  file: (p: string) => ({ fsPath: p, path: p, scheme: 'file' }),
  joinPath: (base: any, ...segments: string[]) => ({
    fsPath: [base.fsPath || base, ...segments].join('/'),
  }),
};

export const ConfigurationTarget = { Global: 1, Workspace: 2 };
export const EventEmitter = class {
  event = () => ({ dispose: () => {} });
  fire() {}
  dispose() {}
};
export const SecretStorage = class {};

export default { workspace, window, commands, Uri, ConfigurationTarget };

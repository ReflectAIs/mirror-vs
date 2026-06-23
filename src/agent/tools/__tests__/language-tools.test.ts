import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { executeLanguageTool } from '../language-tools';

describe('executeLanguageTool', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('symbol_search', () => {
    it('should throw error if query is missing', async () => {
      const tool = { name: 'symbol_search' as const };
      const result = await executeLanguageTool(tool);
      expect(result).toContain('Error: Please provide a search query.');
    });

    it('should return error if no workspace folder open', async () => {
      const foldersBackup = vscode.workspace.workspaceFolders;
      (vscode.workspace as any).workspaceFolders = null;

      try {
        const tool = { name: 'symbol_search' as const, query: 'test' };
        const result = await executeLanguageTool(tool);
        expect(result).toContain('Error: No workspace folder open.');
      } finally {
        (vscode.workspace as any).workspaceFolders = foldersBackup;
      }
    });

    it('should perform search and list symbols', async () => {
      const mockSymbols = [
        {
          name: 'MyClass',
          kind: vscode.SymbolKind.Class,
          location: {
            uri: { fsPath: '/mock/workspace/sub/file.ts' },
            range: { start: { line: 10 } },
          },
          containerName: 'MyNamespace',
        },
        {
          name: 'myFunc',
          kind: vscode.SymbolKind.Function,
          location: {
            uri: { fsPath: '/mock/workspace/file.ts' },
            range: { start: { line: 5 } },
          },
        },
      ];

      vi.spyOn(vscode.commands, 'executeCommand').mockResolvedValue(mockSymbols);

      const tool = { name: 'symbol_search' as const, query: 'My' };
      const result = await executeLanguageTool(tool);

      expect(result).toContain('Found 2 symbol(s) matching "My"');
      expect(result).toContain('🏛️ Class: MyClass');
      expect(result).toContain('sub/file.ts:11');
      expect(result).toContain('Contained in: MyNamespace');
      expect(result).toContain('⚡ Function: myFunc');
    });
  });

  describe('rename_symbol', () => {
    it('should throw error if parameters are missing', async () => {
      const tool = { name: 'rename_symbol' as const };
      const result = await executeLanguageTool(tool);
      expect(result).toContain('Error: Please provide both the current symbol name and new name.');
    });

    it('should return error if no active text editor is open', async () => {
      const activeTextEditorBackup = vscode.window.activeTextEditor;
      (vscode.window as any).activeTextEditor = undefined;

      try {
        const tool = { name: 'rename_symbol' as const, query: 'oldName', path: 'newName' };
        const result = await executeLanguageTool(tool);
        expect(result).toContain('Error: No active text editor.');
      } finally {
        (vscode.window as any).activeTextEditor = activeTextEditorBackup;
      }
    });

    it('should execute rename command and apply edits', async () => {
      const mockWorkspaceEdit = {
        size: 2,
      };

      vi.spyOn(vscode.commands, 'executeCommand').mockResolvedValue(mockWorkspaceEdit);
      vi.spyOn(vscode.workspace, 'applyEdit').mockResolvedValue(true);

      const tool = { name: 'rename_symbol' as const, query: 'oldName', path: 'newName' };
      const result = await executeLanguageTool(tool);

      expect(result).toContain('Renamed "oldName" → "newName" across 2 file(s).');
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'vscode.executeDocumentRenameProvider',
        expect.any(Object),
        expect.any(Object),
        'newName',
      );
      expect(vscode.workspace.applyEdit).toHaveBeenCalledWith(mockWorkspaceEdit);
    });
  });
});


/**
 * Language server integration tools for Mirror VS.
 * Provides symbol_search and rename_symbol as built-in tools.
 */

import { ToolCall } from '../types';
import * as vscode from 'vscode';

/**
 * Execute a language tool call (runs in VS Code extension host context)
 */
export async function executeLanguageTool(
  tool: ToolCall,
): Promise<string> {
  switch (tool.name) {
    case 'symbol_search': {
      const query = tool.query || tool.path || '';
      if (!query) {
        return 'Error: Please provide a search query. Usage: <symbol_search query="MyFunction" />';
      }

      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        return 'Error: No workspace folder open.';
      }

      const results = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
        'vscode.executeWorkspaceSymbolProvider',
        query,
      );

      if (!results || results.length === 0) {
        return `No symbols found matching "${query}".`;
      }

      function makeRelative(absPath: string): string {
        for (const wf of workspaceFolders) {
          const prefix = wf.uri.fsPath + '/';
          if (absPath.startsWith(prefix)) {
            return absPath.slice(prefix.length);
          }
        }
        return absPath;
      }

      let output = `Found ${results.length} symbol(s) matching "${query}":\n\n`;
      results.slice(0, 25).forEach((sym, idx) => {
        const kind = sym.kind === vscode.SymbolKind.Function ? '⚡ Function' :
          sym.kind === vscode.SymbolKind.Class ? '🏛️ Class' :
          sym.kind === vscode.SymbolKind.Method ? '🔧 Method' :
          sym.kind === vscode.SymbolKind.Variable ? '📦 Variable' :
          sym.kind === vscode.SymbolKind.Interface ? '📐 Interface' :
          sym.kind === vscode.SymbolKind.Module ? '📦 Module' :
          '📄 Symbol';
        const filePath = sym.location.uri.fsPath;
        const line = sym.location.range.start.line + 1;
        const relativePath = makeRelative(filePath);
        output += `${idx + 1}. ${kind}: ${sym.name}\n`;
        output += `   📁 ${relativePath}:${line}\n`;
        if (sym.containerName) {
          output += `   📎 Contained in: ${sym.containerName}\n`;
        }
        output += '\n';
      });

      if (results.length > 25) {
        output += `... and ${results.length - 25} more results.\n`;
      }

      return output;
    }

    case 'rename_symbol': {
      const currentSymbol = tool.query;
      const newName = tool.path;
      if (!currentSymbol || !newName) {
        return 'Error: Please provide both the current symbol name and new name. Usage: <rename_symbol query="oldName" path="newName" />';
      }

      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return 'Error: No active text editor. Please open a file first.';
      }

      const document = editor.document;
      const position = editor.selection.active;

      try {
        // Use VS Code's built-in rename
        const edits = await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
          'vscode.executeDocumentRename',
          document.uri,
          position,
          newName,
        );

        if (!edits || edits.size === 0) {
          return `No rename operations performed for "${currentSymbol}" → "${newName}". The symbol may not exist or may not be refactorable.`;
        }

        await vscode.workspace.applyEdit(edits);
        return `✅ Renamed "${currentSymbol}" → "${newName}" across ${edits.size} file(s).`;
      } catch (e: any) {
        return `Error renaming symbol: ${e.message}`;
      }
    }

    default:
      return `Error: Unknown language tool: ${tool.name}`;
  }
}

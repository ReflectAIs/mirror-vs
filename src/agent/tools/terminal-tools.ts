import * as vscode from 'vscode';
import { ToolCall } from '../types';
import { CommandService } from '../../services/command-service';

/**
 * Evaluates whether a terminal command is sensitive/dangerous and requires human approval.
 * Returns true if the command is destructive (rm, del, erase, etc.) or exits/traverses
 * outside the open workspace directory.
 */
function isSensitiveCommand(command: string): boolean {
  const cmdLower = command.toLowerCase();

  // 1. Destructive check (rm, rmdir, del, rd, erase, remove-item)
  const destructivePatterns = [
    /\brm\b/i,
    /\brmdir\b/i,
    /\bdel\b/i,
    /\brd\b/i,
    /\berase\b/i,
    /\bremove-item\b/i
  ];

  const isDestructive = destructivePatterns.some(pattern => pattern.test(cmdLower));
  if (isDestructive) {
    return true;
  }

  // 2. Upward path traversal check (contains directory climbing "..")
  if (cmdLower.includes('..')) {
    return true;
  }

  // 3. Out-of-workspace absolute path check
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspaceFolder) {
    const workspaceFolderLower = workspaceFolder.toLowerCase();

    // Match Windows drive-letter paths (e.g. C:\path or D:/path)
    const winAbsMatch = command.match(/\b([a-zA-Z]:[\\/][^"'\s]*)/);
    if (winAbsMatch) {
      const absPath = winAbsMatch[1].toLowerCase();
      if (!absPath.startsWith(workspaceFolderLower)) {
        return true;
      }
    }

    // Match Unix absolute paths (e.g. /etc/passwd or /usr/bin)
    const unixAbsMatch = command.match(/\b(\/[a-zA-Z0-9_\-\.\/]+)/);
    if (unixAbsMatch) {
      const absPath = unixAbsMatch[1].toLowerCase();
      const workspaceUnix = workspaceFolderLower.replace(/\\/g, '/');
      if (!absPath.startsWith(workspaceUnix) && absPath !== '/' && absPath.split('/').length > 2) {
        return true;
      }
    }
  }

  return false;
}

export async function executeTerminalTool(
  tool: ToolCall
): Promise<string> {
  if (tool.name !== 'run_command') {
    throw new Error(`Invalid terminal tool: ${tool.name}`);
  }

  if (!tool.command) {
    throw new Error('Missing "command" attribute for run_command.');
  }

  const command = tool.command.trim();

  // Safety Confirmation Guardrail (Only blocks if command is destructive or traverses outside the workspace)
  if (isSensitiveCommand(command)) {
    const choice = await vscode.window.showWarningMessage(
      `Mirror VS is requesting to run a sensitive/destructive command:\n\n"${command}"\n\nDo you want to authorize this command?`,
      { modal: true }, // Modal dialog blocks safely and secures active developer attention
      'Allow Execution',
      'Deny'
    );

    if (choice !== 'Allow Execution') {
      throw new Error(`Command execution denied by user: "${command}"`);
    }
  }

  return await CommandService.getInstance().executeCommand(command);
}

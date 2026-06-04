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
  let cmdTrimmed = cmdLower.trim();
  // Strip leading and trailing quotes (single/double) if they wrap the entire command
  if ((cmdTrimmed.startsWith('"') && cmdTrimmed.endsWith('"')) || (cmdTrimmed.startsWith("'") && cmdTrimmed.endsWith("'"))) {
    cmdTrimmed = cmdTrimmed.slice(1, -1).trim();
  }

  // Exempt safe grep, sed, and read-only file viewer commands (get-content, gc, cat, type) from sensitive checks
  const isSafeGrep = /^\s*grep\b/i.test(cmdTrimmed);
  const isSafeSed = /^\s*sed\b/i.test(cmdTrimmed) && !/\b-i\b/i.test(cmdTrimmed) && !/--in-place/i.test(cmdTrimmed);
  const hasWriteRedirect = /[>|]\s*(out-file|set-content|sc|tee|add-content|ac)\b/i.test(cmdTrimmed) || />/g.test(cmdTrimmed);
  const isSafeRead = /^\s*(get-content|gc|cat|type)\b/i.test(cmdTrimmed) && !hasWriteRedirect;

  if (isSafeGrep || isSafeSed || isSafeRead) {
    return false;
  }

  // 1. Destructive check (rm, rmdir, del, rd, erase, remove-item)
  const destructivePatterns = [/\brm\b/i, /\brmdir\b/i, /\bdel\b/i, /\brd\b/i, /\berase\b/i, /\bremove-item\b/i];

  const isDestructive = destructivePatterns.some((pattern) => pattern.test(cmdLower));
  if (isDestructive) {
    return true;
  }

  // 2. Upward path traversal check (contains directory climbing "..")
  if (cmdLower.includes('..')) {
    return true;
  }

  // 3. Out-of-workspace absolute path check — check against all workspace folders
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders && workspaceFolders.length > 0) {
    // Collect all allowed path prefixes (lowercase)
    const allowedPrefixes = workspaceFolders.map(wf => wf.uri.fsPath.toLowerCase());

    // Match Windows drive-letter paths (e.g. C:\path or D:/path)
    const winAbsMatch = command.match(/\b([a-zA-Z]:[\\/][^"'\s]*)/);
    if (winAbsMatch) {
      const absPath = winAbsMatch[1].toLowerCase();
      const isAllowed = allowedPrefixes.some(prefix => absPath.startsWith(prefix));
      if (!isAllowed) {
        return true;
      }
    }

    // Match Unix absolute paths (e.g. /etc/passwd or /usr/bin)
    const unixAbsMatch = command.match(/\b(\/[a-zA-Z0-9_\-./]+)/);
    if (unixAbsMatch) {
      const absPath = unixAbsMatch[1].toLowerCase();
      const absUnix = absPath.replace(/\\/g, '/');
      const isAllowed = allowedPrefixes.some(prefix => {
        const prefixUnix = prefix.replace(/\\/g, '/');
        return absUnix.startsWith(prefixUnix);
      });
      if (!isAllowed && absPath !== '/' && absPath.split('/').length > 2) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Checks if a command contains a blocked git action (push or remote manipulations).
 */
function containsBlockedGitCommand(cmd: string): boolean {
  const cmdLower = cmd.toLowerCase();
  return /\bgit\s+push\b/i.test(cmdLower) || /\bgit\s+remote\s+(add|set-url|remove|rm|rename)\b/i.test(cmdLower);
}

export async function executeTerminalTool(tool: ToolCall): Promise<string> {
  const service = CommandService.getInstance();

  // ---- run_command ----
  if (tool.name === 'run_command') {
    if (!tool.command) {
      throw new Error('Missing "command" attribute for run_command.');
    }

    const command = tool.command.trim();

    // Block forbidden Git operations
    if (containsBlockedGitCommand(command)) {
      throw new Error(`Git push or remote modifications are forbidden by user policy: "${command}"`);
    }

    // Safety Confirmation Guardrail (Only blocks if command is destructive or traverses outside the workspace)
    if (isSensitiveCommand(command)) {
      const choice = await vscode.window.showWarningMessage(
        `Mirror VS is requesting to run a sensitive/destructive command:\n\n"${command}"\n\nDo you want to authorize this command?`,
        { modal: true }, // Modal dialog blocks safely and secures active developer attention
        'Allow Execution',
        'Deny',
      );

      if (choice !== 'Allow Execution') {
        throw new Error(`Command execution denied by user: "${command}"`);
      }
    }

    return await service.executeCommand(command);
  }

  // ---- send_terminal_input ----
  if (tool.name === 'send_terminal_input') {
    const termName = (tool as ToolCall).terminal_name || '';
    const input = tool.content || '';

    if (!termName) {
      throw new Error('Missing "terminal_name" attribute for send_terminal_input.');
    }
    if (!input) {
      throw new Error('Missing terminal input content.');
    }

    // Block forbidden Git operations
    if (containsBlockedGitCommand(input)) {
      throw new Error(`Git push or remote modifications are forbidden by user policy: "${input}"`);
    }

    const success = service.sendInputToTerminal(termName, input);
    if (!success) {
      const activeTerminals = service.getActiveTerminals();
      const terminalList =
        activeTerminals.length > 0
          ? activeTerminals.map((t) => `"${t.name}" (${t.running ? 'running' : 'exited'})`).join(', ')
          : 'none';
      throw new Error(`Active terminal "${termName}" not found. Active terminals: ${terminalList}`);
    }

    return `Successfully sent input to terminal "${termName}": "${input}"`;
  }

  // ---- close_terminal ----
  if (tool.name === 'close_terminal') {
    const termName = (tool as ToolCall).terminal_name || '';

    if (!termName) {
      throw new Error('Missing "terminal_name" attribute for close_terminal.');
    }

    const success = service.closeTerminal(termName);
    if (!success) {
      const activeTerminals = service.getActiveTerminals();
      const terminalList =
        activeTerminals.length > 0
          ? activeTerminals.map((t) => `"${t.name}" (${t.running ? 'running' : 'exited'})`).join(', ')
          : 'none';
      throw new Error(`Active terminal "${termName}" not found. Active terminals: ${terminalList}`);
    }

    return `Successfully closed and terminated terminal "${termName}"`;
  }

  // ---- read_terminal ----
  if (tool.name === 'read_terminal') {
    const termName = (tool as ToolCall).terminal_name || '';

    if (!termName) {
      throw new Error(
        'Missing "terminal_name" attribute for read_terminal. Use list_terminals first to see available terminal names.',
      );
    }

    // Parse optional chars/lines parameter
    const chars = parseInt((tool as ToolCall).chars || '5000', 10) || 5000;

    const result = service.readTerminalOutput(termName, chars);
    if (!result) {
      const activeTerminals = service.getActiveTerminals();
      const terminalList =
        activeTerminals.length > 0
          ? activeTerminals.map((t) => `"${t.name}" (${t.running ? 'running' : 'exited'})`).join(', ')
          : 'none';
      throw new Error(`Terminal "${termName}" not found. Active terminals: ${terminalList}`);
    }

    const statusLine = result.running
      ? '🟢 Process is still RUNNING'
      : `🔴 Process has EXITED (code: ${result.exitCode})`;

    return `${statusLine}\n\n--- Terminal Output (last ${chars} chars) ---\n${result.output || '[No output]'}`;
  }

  // ---- list_terminals ----
  if (tool.name === 'list_terminals') {
    const terminals = service.getActiveTerminals();

    if (terminals.length === 0) {
      return 'No active agent-managed terminals. Use <run_command command="..." /> to start one.';
    }

    const lines = terminals.map((t, i) => {
      const status = t.running ? '🟢 RUNNING' : `🔴 EXITED (code: ${t.exitCode})`;
      const type = t.isServer ? '[SERVER]' : '[SHORT]';
      return `${i + 1}. "${t.name}" ${type} ${status}\n   Command: "${t.command}"`;
    });

    return `Active terminals (${terminals.length}):\n\n${lines.join('\n\n')}\n\nUse <read_terminal terminal_name="..." /> to read output, <send_terminal_input terminal_name="...">input</send_terminal_input> to interact, or <close_terminal terminal_name="..." /> to close.`;
  }

  throw new Error(`Invalid terminal tool: ${tool.name}`);
}

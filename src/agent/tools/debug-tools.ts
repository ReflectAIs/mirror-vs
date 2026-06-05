import * as vscode from 'vscode';
import { ToolCall } from '../types';
import * as path from 'path';

export async function executeDebugTool(tool: ToolCall): Promise<string> {
  const name = tool.name;

  if (name === 'debug_get_sessions') {
    const active = vscode.debug.activeDebugSession;
    if (!active) {
      return 'No active debug sessions.';
    }
    return `Active Debug Session:\n- Name: "${active.name}"\n- Type: "${active.type}"\n- ID: ${active.id}`;
  }

  if (name === 'debug_get_breakpoints') {
    const breakpoints = vscode.debug.breakpoints;
    if (breakpoints.length === 0) {
      return 'No active breakpoints in workspace.';
    }

    const lines = breakpoints.map((bp, idx) => {
      if (bp instanceof vscode.SourceBreakpoint) {
        const relPath = vscode.workspace.workspaceFolders
          ? path.relative(vscode.workspace.workspaceFolders[0].uri.fsPath, bp.location.uri.fsPath).replace(/\\/g, '/')
          : bp.location.uri.fsPath;
        return `${idx + 1}. Source Breakpoint: ${relPath} (Line ${bp.location.range.start.line + 1}) [${bp.enabled ? 'Enabled' : 'Disabled'}]`;
      }
      return `${idx + 1}. Function Breakpoint: ${(bp as any).functionName || 'unknown'} [${bp.enabled ? 'Enabled' : 'Disabled'}]`;
    });

    return `Active Breakpoints:\n${lines.join('\n')}`;
  }

  if (name === 'debug_add_breakpoint') {
    const file = tool.path || tool.query || '';
    const lineStr = (tool as any).line || '';
    if (!file || !lineStr) {
      return 'Error: Missing "path" or "line" for debug_add_breakpoint. Usage: <debug_add_breakpoint path="src/math.ts" line="15" />';
    }

    const line = parseInt(lineStr, 10);
    if (isNaN(line)) {
      return `Error: Invalid line number "${lineStr}".`;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return 'Error: No workspace open.';
    }

    const absolutePath = path.resolve(workspaceFolders[0].uri.fsPath, file);
    const uri = vscode.Uri.file(absolutePath);

    const bp = new vscode.SourceBreakpoint(new vscode.Location(uri, new vscode.Position(line - 1, 0)));

    vscode.debug.addBreakpoints([bp]);
    return `✅ Successfully added breakpoint at ${file} (Line ${line})`;
  }

  if (name === 'debug_remove_breakpoint') {
    const file = tool.path || '';
    const lineStr = (tool as any).line || '';

    if (!file || !lineStr) {
      // If no file/line provided, maybe they provided breakpoint_id? We can just delete all matching breakpoints
      return 'Error: Missing "path" or "line" for debug_remove_breakpoint. Usage: <debug_remove_breakpoint path="src/math.ts" line="15" />';
    }

    const line = parseInt(lineStr, 10);
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return 'Error: No workspace open.';
    }

    const absolutePath = path.resolve(workspaceFolders[0].uri.fsPath, file);
    const normalizedTarget = path.normalize(absolutePath).toLowerCase();

    const targetBps = vscode.debug.breakpoints.filter((bp) => {
      if (bp instanceof vscode.SourceBreakpoint) {
        return (
          path.normalize(bp.location.uri.fsPath).toLowerCase() === normalizedTarget &&
          bp.location.range.start.line + 1 === line
        );
      }
      return false;
    });

    if (targetBps.length === 0) {
      return `No breakpoint found at ${file}:${line}`;
    }

    vscode.debug.removeBreakpoints(targetBps);
    return `✅ Removed ${targetBps.length} breakpoint(s) at ${file}:${line}`;
  }

  if (name === 'debug_inspect_variables') {
    const session = vscode.debug.activeDebugSession;
    if (!session) {
      return 'Error: No active debug session. Please start a debug session first.';
    }

    try {
      // Query active threads
      const threadsResp = await session.customRequest('threads');
      const threads = threadsResp.threads || [];
      if (threads.length === 0) {
        return `Debug session "${session.name}" is active but has no active threads.`;
      }

      // Read stacktrace of the first thread (or active thread)
      const thread = threads[0];
      const stackTraceResp = await session.customRequest('stackTrace', { threadId: thread.id, levels: 5 });
      const stackFrames = stackTraceResp.stackFrames || [];

      if (stackFrames.length === 0) {
        return `Thread "${thread.name}" is running or has no available stack frames. Pause the debugger to inspect variables.`;
      }

      // Query scopes for the top stack frame
      const topFrame = stackFrames[0];
      const scopesResp = await session.customRequest('scopes', { frameId: topFrame.id });
      const scopes = scopesResp.scopes || [];

      let varsOutput = '';

      for (const scope of scopes.slice(0, 2)) {
        const varsResp = await session.customRequest('variables', { variablesReference: scope.variablesReference });
        const variables = varsResp.variables || [];

        varsOutput += `\nScope: ${scope.name}\n`;
        variables.slice(0, 15).forEach((v: any) => {
          varsOutput += `  - ${v.name}: ${v.value} (${v.type || 'unknown'})\n`;
        });
        if (variables.length > 15) {
          varsOutput += `  ... and ${variables.length - 15} more variables\n`;
        }
      }

      return [
        `🐞 Debug Session: "${session.name}" (Type: "${session.type}")`,
        `🧵 Active Thread: "${thread.name}" (ID: ${thread.id})`,
        `📍 Current Stack Frame: ${topFrame.name} (${topFrame.source?.name || 'unknown'}:${topFrame.line}:${topFrame.column})`,
        `\nCall Stack:`,
        stackFrames.map((f: any) => `  at ${f.name} (${f.source?.name || 'unknown'}:${f.line}:${f.column})`).join('\n'),
        `\nVariables:`,
        varsOutput || '  No variables found in scope.',
      ].join('\n');
    } catch (e: any) {
      return `Failed to inspect variables via DAP: ${e.message}. The debugger might not be paused or support variable inspections.`;
    }
  }

  throw new Error(`Invalid debug tool: ${name}`);
}

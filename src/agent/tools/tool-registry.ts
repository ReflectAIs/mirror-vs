import { ToolCall, ChatMessage } from '../types';
import { executeFileTool } from './file-tools';
import { executeSearchTool } from './search-tools';
import { executeBrowserTool } from './browser-tools';
import { executeTerminalTool } from './terminal-tools';
import { executeFigmaTool } from './figma-tools';
import { executeGitTool } from './git-tools';
import { PluginService } from '../../services/plugin-service';
import { executeArtifactTool } from './artifact-tools';
import { executeDeveloperTool } from './developer-tools';
import { executeMcpTool, isMcpToolCall } from './mcp-tools';
import { executeHistoryTool } from './history-tools';

export const ALL_REGISTERED_TOOLS = new Set([
  'wait',
  'create_artifact',
  'search_chat_history',
  'read_file',
  'create_file',
  'write_file',
  'patch_file',
  'multi_patch_file',
  'list_dir',
  'rename_file',
  'delete_file',
  'update_agent_memory',
  'update_plan',
  'grep_search',
  'semantic_search',
  'web_search',
  'get_diagnostics',
  'browser_navigate',
  'browser_click',
  'browser_type',
  'browser_evaluate_script',
  'browser_screenshot',
  'run_command',
  'send_terminal_input',
  'close_terminal',
  'read_terminal',
  'list_terminals',
  'figma_inspect',
  'python_eval',
  'ast_grep',
  'lint_fix',
  'git_status',
  'git_diff',
  'git_commit',
  'git_add',
  'git_checkpoint',
  'git_rollback',
  'symbol_search',
  'rename_symbol',
  'analyze_project',
  'analyze_dependencies',
  'analyze_complexity',
  'analyze_coverage',
  'analyze_dead_code',
  'analyze_impact',
  'graphify',
  'debug_get_sessions',
  'debug_get_breakpoints',
  'debug_add_breakpoint',
  'debug_remove_breakpoint',
  'debug_inspect_variables',
]);

export async function executeTool(
  tool: ToolCall,
  getSafePath: (p: string) => string,
  figmaKey?: string,
  workspacePath?: string,
  activeMessages?: ChatMessage[],
): Promise<string> {
  const name = tool.name;

  if (name === 'invalid_tool_mix') {
    throw new Error(tool.content || 'Invalid tool mix.');
  }

  // Check plugin tools first (custom tools registered by extensions/users)
  const pluginService = PluginService.getInstance();
  if (pluginService.isPluginTool(name)) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const workspaceFolder = require('vscode').workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    return pluginService.executePlugin(tool, {
      workspaceFolder,
      getSafePath,
      postMessage: (msg: any) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { MirrorVsSidebarProvider } = require('../../providers/sidebar-provider');
          MirrorVsSidebarProvider.postToActive?.(msg);
        } catch {
          /* ignore */
        }
      },
    });
  }

  // Built-in wait tool
  if (name === 'wait') {
    const ms = tool.ms !== undefined ? tool.ms : tool.seconds !== undefined ? tool.seconds * 1000 : 3000;
    const duration = Math.max(100, Math.min(60000, ms));
    await new Promise((resolve) => setTimeout(resolve, duration));
    return `Waited for ${duration}ms as requested.`;
  }

  // Artifact tool — creates interactive previewable content in a new VS Code window
  if (name === 'create_artifact') {
    return await executeArtifactTool(tool);
  }

  if (
    name === 'read_file' ||
    name === 'create_file' ||
    name === 'write_file' ||
    name === 'patch_file' ||
    name === 'multi_patch_file' ||
    name === 'list_dir' ||
    name === 'rename_file' ||
    name === 'delete_file' ||
    name === 'update_agent_memory' ||
    name === 'update_plan'
  ) {
    return await executeFileTool(tool, getSafePath);
  }

  if (name === 'grep_search' || name === 'semantic_search' || name === 'web_search' || name === 'get_diagnostics') {
    return await executeSearchTool(tool);
  }

  if (
    name === 'browser_navigate' ||
    name === 'browser_click' ||
    name === 'browser_type' ||
    name === 'browser_evaluate_script' ||
    name === 'browser_screenshot'
  ) {
    return await executeBrowserTool(tool, getSafePath);
  }

  if (
    name === 'run_command' ||
    name === 'send_terminal_input' ||
    name === 'close_terminal' ||
    name === 'read_terminal' ||
    name === 'list_terminals'
  ) {
    return await executeTerminalTool(tool);
  }

  if (name === 'figma_inspect') {
    return await executeFigmaTool(tool, figmaKey, workspacePath);
  }

  if (name === 'search_chat_history') {
    return await executeHistoryTool(tool, activeMessages);
  }

  // Developer tools
  if (name === 'python_eval' || name === 'ast_grep' || name === 'lint_fix') {
    return await executeDeveloperTool(tool);
  }

  // Git tools
  if (
    name === 'git_status' ||
    name === 'git_diff' ||
    name === 'git_commit' ||
    name === 'git_add' ||
    name === 'git_checkpoint' ||
    name === 'git_rollback'
  ) {
    return await executeGitTool(tool, workspacePath);
  }

  // Language tools (run in VS Code host context via executeCommand)
  if (name === 'symbol_search' || name === 'rename_symbol') {
    const { executeLanguageTool } = await import('./language-tools.js');
    return await executeLanguageTool(tool);
  }

  // Code analysis tools
  if (
    name === 'analyze_project' ||
    name === 'analyze_dependencies' ||
    name === 'analyze_complexity' ||
    name === 'analyze_coverage' ||
    name === 'analyze_dead_code' ||
    name === 'analyze_impact' ||
    name === 'graphify'
  ) {
    const { executeCodeAnalysisTool } = await import('./code-analysis-tools.js');
    return await executeCodeAnalysisTool(tool);
  }

  // Debugger tools
  if (
    name === 'debug_get_sessions' ||
    name === 'debug_get_breakpoints' ||
    name === 'debug_add_breakpoint' ||
    name === 'debug_remove_breakpoint' ||
    name === 'debug_inspect_variables'
  ) {
    const { executeDebugTool } = await import('./debug-tools.js');
    return await executeDebugTool(tool);
  }

  // MCP tools (dynamic: mcp__serverName__toolName)
  if (isMcpToolCall(name)) {
    return await executeMcpTool(tool);
  }

  throw new Error(`Unsupported tool call: ${name}`);
}

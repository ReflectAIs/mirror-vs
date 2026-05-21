import { ToolCall } from '../types';
import { executeFileTool } from './file-tools';
import { executeSearchTool } from './search-tools';
import { executeBrowserTool } from './browser-tools';
import { executeTerminalTool } from './terminal-tools';

export async function executeTool(
  tool: ToolCall,
  getSafePath: (p: string) => string
): Promise<string> {
  const name = tool.name;

  if (
    name === 'read_file' ||
    name === 'create_file' ||
    name === 'write_file' ||
    name === 'patch_file' ||
    name === 'list_dir'
  ) {
    return await executeFileTool(tool, getSafePath);
  }

  if (name === 'grep_search') {
    return await executeSearchTool(tool);
  }

  if (
    name === 'browser_navigate' ||
    name === 'browser_click' ||
    name === 'browser_type' ||
    name === 'browser_screenshot'
  ) {
    return await executeBrowserTool(tool);
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

  throw new Error(`Unsupported tool call: ${name}`);
}

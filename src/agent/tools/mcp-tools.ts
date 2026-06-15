/**
 * MCP Tool — executes tools exposed by configured MCP servers.
 * Interacts with McpService to discover and execute remote tools.
 */

import { McpService } from '../../services/mcp-service';
import { ToolCall } from '../types';
import { NativeToolCallParser } from '../native-tool-call-parser';

/**
 * Execute an MCP tool call.
 * The tool name format is: mcp__<serverName>__<toolName>
 */
export async function executeMcpTool(tool: ToolCall): Promise<string> {
  const mcpService = McpService.getInstance();

  // Parse the tool name to extract server and tool name
  const parsed = NativeToolCallParser.parseMcpToolCall(tool.name, JSON.stringify({}));
  if (!parsed) {
    // Try another format: toolName might be in the call directly
    const toolName = tool.name.replace(/^mcp__/, '').replace(/^mcp--/, '');
    const parts = toolName.split('__');
    if (parts.length < 2) {
      return `Error: Invalid MCP tool name '${tool.name}'. Expected format: mcp__serverName__toolName.`;
    }
    const serverName = parts[0];
    const actualToolName = parts.slice(1).join('__');

    return await mcpService.executeTool(serverName, actualToolName, {
      path: tool.path,
      query: tool.query,
      content: tool.content,
      command: tool.command,
      url: tool.url,
      text: tool.text,
    });
  }

  return await mcpService.executeTool(parsed.serverName, parsed.toolName, parsed.arguments);
}

/**
 * Check if a tool call is an MCP tool.
 */
export function isMcpToolCall(toolName: string): boolean {
  return toolName.startsWith('mcp__') || toolName.startsWith('mcp--');
}

/**
 * Get all available MCP tool names for the tool registry.
 */
export async function getMcpToolNames(): Promise<string[]> {
  const mcpService = McpService.getInstance();
  const tools = await mcpService.getAllTools();
  return tools.map((t) => `mcp__${t.serverName}__${t.name}`);
}

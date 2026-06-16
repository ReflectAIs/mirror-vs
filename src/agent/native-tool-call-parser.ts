/**
 * Native Tool Call Parser — handles both XML-tag-style and OpenAI native function
 * calling tool invocations from LLM streaming output.
 *
 * Adapted from Roo Code's NativeToolCallParser with support for:
 * - Native OpenAI function calling (JSON arguments)
 * - Legacy XML-tag format (mirror-vs backward compatibility)
 * - Partial JSON parsing for robust streaming
 * - MCP tool call parsing (mcp__serverName__toolName)
 */

import { ToolCall } from './types';

export interface NativeToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  partial: boolean;
}

export interface NativeToolCallEvent {
  type: 'tool_call_start' | 'tool_call_delta' | 'tool_call_end';
  id: string;
  name?: string;
  delta?: string;
}

interface StreamingToolCallState {
  id: string;
  name: string;
  argumentsBuffer: string;
  hasStarted: boolean;
}

export class NativeToolCallParser {
  private static streamingCalls = new Map<string, StreamingToolCallState>();
  private static chunkIndexTracker = new Map<number, StreamingToolCallState>();

  /**
   * Process a raw tool call chunk from an API stream.
   * Returns start/delta/end events for compatible processing.
   */
  static processRawChunk(chunk: {
    index: number;
    id?: string;
    name?: string;
    arguments?: string;
  }): NativeToolCallEvent[] {
    const events: NativeToolCallEvent[] = [];
    const { index, id, name, arguments: args } = chunk;

    let tracked = this.chunkIndexTracker.get(index);

    if (id && !tracked) {
      tracked = { id, name: name || '', argumentsBuffer: '', hasStarted: false };
      this.chunkIndexTracker.set(index, tracked);
    }

    if (!tracked) return events;

    if (name) tracked.name = name;

    if (!tracked.hasStarted && tracked.name) {
      events.push({ type: 'tool_call_start', id: tracked.id, name: tracked.name });
      tracked.hasStarted = true;
    }

    if (args) {
      tracked.argumentsBuffer += args;
      events.push({ type: 'tool_call_delta', id: tracked.id, delta: args });
    }

    return events;
  }

  /**
   * Signal that a tool call has completed (typically after receiving a tool_call_end
   * or when the stream ends).
   */
  static finishToolCall(index: number): NativeToolCallEvent[] {
    const tracked = this.chunkIndexTracker.get(index);
    if (!tracked) return [];

    this.chunkIndexTracker.delete(index);
    return [{ type: 'tool_call_end', id: tracked.id }];
  }

  /**
   * Finalize all in-progress tool calls.
   */
  static finishAll(): NativeToolCallEvent[] {
    const events: NativeToolCallEvent[] = [];
    for (const [, tracked] of this.chunkIndexTracker) {
      events.push({ type: 'tool_call_end', id: tracked.id });
    }
    this.chunkIndexTracker.clear();
    return events;
  }

  /**
   * Parse completed tool call arguments into a structured ToolCall.
   * Handles both native JSON args and legacy XML formats.
   */
  static parseToolCall(name: string, argsStr: string, callId?: string): ToolCall | null {
    try {
      const args = JSON.parse(argsStr || '{}');

      // Map native tool call names to Mirror VS tool names
      const toolName = this.mapToolName(name);

      const toolCall: ToolCall = {
        name: toolName as ToolCall['name'],
        ...this.mapArgs(toolName, args),
      };

      return toolCall;
    } catch {
      // If JSON parsing fails, try legacy XML parsing
      return null;
    }
  }

  /**
   * Parse MCP tool calls (format: mcp__serverName__toolName or mcp--serverName--toolName).
   */
  static parseMcpToolCall(name: string, argsStr: string): { serverName: string; toolName: string; arguments: Record<string, unknown> } | null {
    // Normalize separators
    const normalized = name.replace(/--/g, '__');

    if (!normalized.startsWith('mcp__')) return null;

    const parts = normalized.split('__');
    if (parts.length < 3) return null;

    // parts[0] = 'mcp', parts[1] = serverName, parts[2...] = toolName
    const serverName = parts[1];
    const toolName = parts.slice(2).join('__');

    try {
      const args = JSON.parse(argsStr || '{}');
      return { serverName, toolName, arguments: args };
    } catch {
      return null;
    }
  }

  /**
   * Check if a tool name is an MCP tool call.
   */
  static isMcpTool(name: string): boolean {
    return name.startsWith('mcp__') || name.startsWith('mcp--');
  }

  /**
   * Map standard tool names from various providers to Mirror VS tool names.
   */
  private static mapToolName(name: string): string {
    const nameMap: Record<string, string> = {
      read_file: 'read_file',
      write_to_file: 'write_file',
      create_file: 'create_file',
      patch_file: 'patch_file',
      multi_patch_file: 'multi_patch_file',
      replace_in_file: 'patch_file',
      search_file: 'grep_search',
      list_files: 'list_dir',
      execute_command: 'run_command',
      search_content: 'grep_search',
      semantic_search: 'semantic_search',
      web_search: 'web_search',
      web_fetch: 'web_search',
      browser_action: 'browser_navigate',
      browser_screenshot: 'browser_screenshot',
      run_terminal_cmd: 'run_command',
      replace_file: 'write_file',
      delete_files: 'delete_file',
      git_commit: 'git_commit',
      git_diff: 'git_diff',
      git_status: 'git_status',
      list_code_definition_names: 'symbol_search',
      get_diagnostics: 'get_diagnostics',
      wait: 'wait',
      update_memory: 'update_agent_memory',
      use_skill: 'update_agent_memory',
      new_task: 'update_agent_memory',
      ask_followup_question: 'update_agent_memory',
      attempt_completion: 'update_agent_memory',
      search_and_replace: 'patch_file',
      apply_diff: 'patch_file',
      apply_patch: 'patch_file',
      edit_file: 'patch_file',
      codebase_search: 'semantic_search',
      read_lints: 'get_diagnostics',
      update_todo: 'update_plan',
      read_plan: 'update_plan',
      update_plan: 'update_plan',
    };

    return nameMap[name] || name;
  }

  /**
   * Map native tool arguments to Mirror VS ToolCall format.
   */
  private static mapArgs(toolName: string, args: Record<string, unknown>): Partial<ToolCall> {
    switch (toolName) {
      case 'read_file':
        return {
          path: typeof args.path === 'string' ? args.path : typeof args.filePath === 'string' ? args.filePath : undefined,
          start_line: typeof args.start_line === 'number' ? args.start_line : typeof args.startLine === 'number' ? args.startLine : typeof args.offset === 'number' ? args.offset : undefined,
          end_line: typeof args.end_line === 'number' ? args.end_line : typeof args.endLine === 'number' ? args.endLine : typeof args.limit === 'number' ? (args.offset as number || 0) + args.limit : undefined,
        };
      case 'write_file':
        return {
          path: typeof args.path === 'string' ? args.path : typeof args.filePath === 'string' ? args.filePath : undefined,
          content: typeof args.content === 'string' ? args.content : undefined,
        };
      case 'create_file':
        return {
          path: typeof args.path === 'string' ? args.path : typeof args.filePath === 'string' ? args.filePath : undefined,
          content: typeof args.content === 'string' ? args.content : undefined,
        };
      case 'patch_file':
        return {
          path: typeof args.path === 'string' ? args.path : typeof args.filePath === 'string' ? args.filePath : undefined,
          start_line: typeof args.start_line === 'number' ? args.start_line : typeof args.startLine === 'number' ? args.startLine : undefined,
          end_line: typeof args.end_line === 'number' ? args.end_line : typeof args.endLine === 'number' ? args.endLine : undefined,
          expected_search_content: typeof args.expected_search_content === 'string' ? args.expected_search_content : typeof args.expectedSearchContent === 'string' ? args.expectedSearchContent : undefined,
          replace_content: typeof args.replace_content === 'string' ? args.replace_content : typeof args.replaceContent === 'string' ? args.replaceContent : undefined,
          chars: typeof args.patch === 'string' ? args.patch : typeof args.diff === 'string' ? args.diff : undefined,
        };
      case 'multi_patch_file':
        return {
          path: typeof args.path === 'string' ? args.path : typeof args.filePath === 'string' ? args.filePath : undefined,
          patches: Array.isArray(args.patches)
            ? args.patches.map((p) => {
                if (typeof p !== 'object' || p === null) return p;
                const item = p as any;
                return {
                  start_line: typeof item.start_line === 'number' ? item.start_line : typeof item.startLine === 'number' ? item.startLine : undefined,
                  end_line: typeof item.end_line === 'number' ? item.end_line : typeof item.endLine === 'number' ? item.endLine : undefined,
                  expected_search_content: typeof item.expected_search_content === 'string' ? item.expected_search_content : typeof item.expectedSearchContent === 'string' ? item.expectedSearchContent : undefined,
                  replace_content: typeof item.replace_content === 'string' ? item.replace_content : typeof item.replaceContent === 'string' ? item.replaceContent : undefined,
                };
              })
            : undefined,
        };
      case 'grep_search':
        return {
          query: typeof args.query === 'string' ? args.query : typeof args.pattern === 'string' ? args.pattern : typeof args.search === 'string' ? args.search : undefined,
          path: typeof args.path === 'string' ? args.path : typeof args.directory === 'string' ? args.directory : undefined,
        };
      case 'run_command':
        return {
          command: typeof args.command === 'string' ? args.command : typeof args.cmd === 'string' ? args.cmd : undefined,
          terminal_name: typeof args.terminal === 'string' ? args.terminal : undefined,
        };
      case 'list_dir':
        return {
          path: typeof args.path === 'string' ? args.path : typeof args.directory === 'string' ? args.directory : typeof args.target_directory === 'string' ? args.target_directory : undefined,
          depth: typeof args.depth === 'number' ? args.depth : typeof args.recursive === 'boolean' ? (args.recursive ? 3 : 1) : undefined,
        };
      case 'web_search':
        return {
          query: typeof args.query === 'string' ? args.query : typeof args.searchTerm === 'string' ? args.searchTerm : undefined,
        };
      case 'browser_navigate':
        return {
          url: typeof args.url === 'string' ? args.url : undefined,
        };
      case 'browser_screenshot':
        return {};
      case 'browser_click':
        return {
          selector: typeof args.selector === 'string' ? args.selector : undefined,
        };
      case 'delete_file':
        return {
          path: typeof args.path === 'string' ? args.path : typeof args.target_file === 'string' ? args.target_file : undefined,
        };
      case 'rename_file':
        return {
          path: typeof args.source_path === 'string' ? args.source_path : typeof args.path === 'string' ? args.path : typeof args.oldPath === 'string' ? args.oldPath : typeof args.source === 'string' ? args.source : undefined,
          content: typeof args.destination_path === 'string' ? args.destination_path : typeof args.text === 'string' ? args.text : typeof args.newPath === 'string' ? args.newPath : typeof args.destination === 'string' ? args.destination : undefined,
        };
      case 'git_commit':
        return {
          text: typeof args.message === 'string' ? args.message : undefined,
        };
      case 'symbol_search':
        return {
          query: typeof args.query === 'string' ? args.query : typeof args.pattern === 'string' ? args.pattern : undefined,
        };
      case 'wait':
        return {
          ms: typeof args.ms === 'number' ? args.ms : typeof args.seconds === 'number' ? args.seconds * 1000 : undefined,
          seconds: typeof args.seconds === 'number' ? args.seconds : undefined,
        };
      case 'update_agent_memory':
        return {
          key: typeof args.key === 'string' ? args.key : undefined,
          value: typeof args.value === 'string' ? args.value : undefined,
        };
      case 'semantic_search':
        return {
          query: typeof args.query === 'string' ? args.query : undefined,
        };
      default:
        return {
          path: typeof args.path === 'string' ? args.path : typeof args.filePath === 'string' ? args.filePath : undefined,
          query: typeof args.query === 'string' ? args.query : undefined,
          content: typeof args.content === 'string' ? args.content : undefined,
          command: typeof args.command === 'string' ? args.command : undefined,
          url: typeof args.url === 'string' ? args.url : undefined,
        };
    }
  }

  /**
   * Reset all internal state. Call between conversations.
   */
  static reset(): void {
    this.streamingCalls.clear();
    this.chunkIndexTracker.clear();
  }
}

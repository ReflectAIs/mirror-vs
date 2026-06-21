export interface ToolCall {
  name:
    | 'read_file'
    | 'create_file'
    | 'write_file'
    | 'patch_file'
    | 'list_dir'
    | 'grep_search'
    | 'web_search'
    | 'browser_navigate'
    | 'browser_click'
    | 'browser_type'
    | 'browser_evaluate_script'
    | 'browser_screenshot'
    | 'run_command'
    | 'send_terminal_input'
    | 'close_terminal'
    | 'read_terminal'
    | 'list_terminals'
    | 'figma_inspect'
    // New tools:
    | 'git_commit'
    | 'git_status'
    | 'git_diff'
    | 'git_add'
    | 'symbol_search'
    | 'rename_symbol'
    | 'rename_file'
    | 'delete_file'
    | 'wait'
    | 'multi_patch_file'
    // Code analysis tools:
    | 'analyze_project'
    | 'analyze_dependencies'
    | 'analyze_complexity'
    | 'analyze_coverage'
    | 'analyze_dead_code'
    | 'analyze_impact'
    | 'graphify'
    | 'get_diagnostics'
    // Advanced features tools:
    | 'semantic_search'
    | 'update_agent_memory'
    | 'debug_get_sessions'
    | 'debug_get_breakpoints'
    | 'debug_add_breakpoint'
    | 'debug_remove_breakpoint'
    | 'debug_inspect_variables'
    | string; // Allow dynamic MCP tool names: mcp__serverName__toolName
  path?: string;
  depth?: number;
  query?: string;
  content?: string;
  url?: string;
  selector?: string;
  text?: string;
  command?: string;
  terminal_name?: string;
  start_line?: number;
  end_line?: number;
  chars?: string;
  expected_search_content?: string;
  replace_content?: string;
  source_path?: string;
  destination_path?: string;
  patches?: Array<{
    start_line: number;
    end_line: number;
    expected_search_content: string;
    replace_content: string;
  }>;
  script?: string;
  ms?: number;
  seconds?: number;
  key?: string;
  value?: string;
  id?: string;
  // Artifact tool properties
  type?: string;
  artifactType?: string;
  language?: string;
  body?: string;
  // Developer tool properties
  code?: string;
  pattern?: string;
  target?: string;
  // Agent memory property
  category?: string;
  // File rename properties
  from?: string;
  to?: string;
}

export type ToolStatus = 'running' | 'success' | 'error';

export interface ToolStatusMessage {
  type: 'toolStatus';
  toolName: string;
  status: ToolStatus;
  target: string;
  result?: string;
  checkpointId?: string;
  code?: string;
  terminalName?: string;
}

export interface ToolExecutionContext {
  getSafePath(targetPath: string): string;
  createCheckpoint(filePath: string, type: 'replace' | 'create'): Promise<string>;
  revertCheckpoint(id: string): Promise<boolean>;
}

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
    | 'wait';
  path?: string;
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
  script?: string;
  ms?: number;
  seconds?: number;
  screenshot_name?: string;
}

export type ToolStatus = 'running' | 'success' | 'error';

export interface ToolExecutionContext {
  getSafePath(targetPath: string): string;
  createCheckpoint(filePath: string, type: 'replace' | 'create'): Promise<string>;
  revertCheckpoint(id: string): Promise<boolean>;
}

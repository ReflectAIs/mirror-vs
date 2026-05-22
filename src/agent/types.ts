export interface ToolCall {
  name:
    | 'read_file'
    | 'create_file'
    | 'write_file'
    | 'patch_file'
    | 'list_dir'
    | 'grep_search'
    | 'browser_navigate'
    | 'browser_click'
    | 'browser_type'
    | 'browser_screenshot'
    | 'run_command'
    | 'send_terminal_input'
    | 'close_terminal'
    | 'read_terminal'
    | 'list_terminals';
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
}

export type ToolStatus = 'running' | 'success' | 'error';

export interface ToolExecutionContext {
  getSafePath(targetPath: string): string;
  createCheckpoint(filePath: string, type: 'replace' | 'create'): Promise<string>;
  revertCheckpoint(id: string): Promise<boolean>;
}

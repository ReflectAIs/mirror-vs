import { describe, it, expect } from 'vitest';
import { AgentParser } from '../agent-parser';

function makeParser() {
  return new AgentParser();
}

const TAG_OPEN = String.fromCharCode(60);
const TAG_CLOSE = String.fromCharCode(62);
const TAG_SLASH = String.fromCharCode(47);

function selfClosing(name: string, attrs: string = ''): string {
  return TAG_OPEN + name + (attrs ? ' ' + attrs : '') + ' ' + TAG_SLASH + TAG_CLOSE;
}

function blockOpen(name: string, attrs: string = ''): string {
  return TAG_OPEN + name + (attrs ? ' ' + attrs : '') + TAG_CLOSE;
}

function blockClose(name: string): string {
  return TAG_OPEN + TAG_SLASH + name + TAG_CLOSE;
}

describe('AgentParser', () => {
  describe('stripCodeBlocks', () => {
    it('should strip triple-backtick fenced code blocks', () => {
      const parser = makeParser();
      const bt = String.fromCharCode(96);
      const input = 'before\n' + bt + bt + bt + '\ncode here\n' + bt + bt + bt + '\nafter';
      expect(parser.stripCodeBlocks(input)).toBe('before\n\nafter');
    });

    it('should strip inline backtick blocks', () => {
      const parser = makeParser();
      const bt = String.fromCharCode(96);
      const input = 'use ' + bt + 'read_file' + bt + ' to read files';
      expect(parser.stripCodeBlocks(input)).toBe('use  to read files');
    });

    it('should strip HTML-encoded angle bracket blocks', () => {
      const parser = makeParser();
      const amp = String.fromCharCode(38);
      const q = String.fromCharCode(34);
      const openTag = amp + 'lt;write_file path=' + q + 'x' + q + amp + 'gt;';
      const closeTag = amp + 'lt;/write_file' + amp + 'gt;';
      const input = 'text ' + openTag + 'content' + closeTag + ' more';
      expect(parser.stripCodeBlocks(input)).toBe('text content more');
    });

    it('should return unchanged text if no code blocks', () => {
      const parser = makeParser();
      const input = 'Just plain text';
      expect(parser.stripCodeBlocks(input)).toBe(input);
    });

    it('should handle empty string', () => {
      const parser = makeParser();
      expect(parser.stripCodeBlocks('')).toBe('');
    });

    it('should handle nested backticks by removing outer block only', () => {
      const parser = makeParser();
      const bt = String.fromCharCode(96);
      const input = bt + bt + bt + '\ninner ' + bt + 'code' + bt + '\n' + bt + bt + bt;
      expect(parser.stripCodeBlocks(input)).toBe('');
    });
  });

  describe('hasCompleteToolCall', () => {
    it('should detect self-closing read_file', () => {
      const parser = makeParser();
      expect(parser.hasCompleteToolCall(selfClosing('read_file', 'path="test.ts"'))).toBe(true);
    });

    it('should detect self-closing run_command', () => {
      const parser = makeParser();
      expect(parser.hasCompleteToolCall(selfClosing('run_command', 'command="echo hi"'))).toBe(true);
    });

    it('should detect self-closing browser_screenshot', () => {
      const parser = makeParser();
      expect(parser.hasCompleteToolCall(selfClosing('browser_screenshot'))).toBe(true);
    });

    it('should detect self-closing list_terminals', () => {
      const parser = makeParser();
      expect(parser.hasCompleteToolCall(selfClosing('list_terminals'))).toBe(true);
    });

    it('should detect self-closing browser_navigate', () => {
      const parser = makeParser();
      expect(parser.hasCompleteToolCall(selfClosing('browser_navigate', 'url="http://test"'))).toBe(true);
    });

    it('should detect block tool with closing tag (write_file)', () => {
      const parser = makeParser();
      const input = blockOpen('write_file', 'path="t.txt"') + 'content' + blockClose('write_file');
      expect(parser.hasCompleteToolCall(input)).toBe(true);
    });

    it('should detect block tool with closing tag (create_file)', () => {
      const parser = makeParser();
      const input = blockOpen('create_file', 'path="t.txt"') + 'content' + blockClose('create_file');
      expect(parser.hasCompleteToolCall(input)).toBe(true);
    });

    it('should detect block tool with closing tag (patch_file)', () => {
      const parser = makeParser();
      const input = blockOpen('patch_file', 'path="t.txt"') + 'content' + blockClose('patch_file');
      expect(parser.hasCompleteToolCall(input)).toBe(true);
    });

    it('should return false for plain text', () => {
      const parser = makeParser();
      expect(parser.hasCompleteToolCall('Just a regular message')).toBe(false);
    });

    it('should ignore tool-like text inside code blocks', () => {
      const parser = makeParser();
      const input = '';
      expect(parser.hasCompleteToolCall(input)).toBe(false);
    });

    it('should return false for empty string', () => {
      const parser = makeParser();
      expect(parser.hasCompleteToolCall('')).toBe(false);
    });

    it('should not match partial/unclosed block tool', () => {
      const parser = makeParser();
      const input = TAG_OPEN + 'write_file path="t.txt"' + TAG_CLOSE + 'content without closing tag';
      expect(parser.hasCompleteToolCall(input)).toBe(false);
    });
  });

  describe('parseToolCalls', () => {
    it('should parse read_file with path', () => {
      const parser = makeParser();
      const calls = parser.parseToolCalls(selfClosing('read_file', 'path="src/index.ts"'));
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({ name: 'read_file', path: 'src/index.ts' });
    });

    it('should parse read_file with start_line and end_line', () => {
      const parser = makeParser();
      const calls = parser.parseToolCalls(selfClosing('read_file', 'path="big.ts" start_line="10" end_line="20"'));
      expect(calls).toHaveLength(1);
      expect(calls[0].name).toBe('read_file');
      expect(calls[0].path).toBe('big.ts');
      expect(calls[0].start_line).toBe(10);
      expect(calls[0].end_line).toBe(20);
    });

    it('should parse write_file with content', () => {
      const parser = makeParser();
      const input = blockOpen('write_file', 'path="hello.txt"') + 'Hello World' + blockClose('write_file');
      const calls = parser.parseToolCalls(input);
      expect(calls).toHaveLength(1);
      expect(calls[0].name).toBe('write_file');
      expect(calls[0].path).toBe('hello.txt');
      expect(calls[0].content).toBe('Hello World');
    });

    it('should parse write_file with multiline content', () => {
      const parser = makeParser();
      const content = 'line1\nline2\nline3';
      const input = blockOpen('write_file', 'path="multi.txt"') + content + blockClose('write_file');
      const calls = parser.parseToolCalls(input);
      expect(calls).toHaveLength(1);
      expect(calls[0].content).toBe(content);
    });

    it('should parse create_file with content', () => {
      const parser = makeParser();
      const input = blockOpen('create_file', 'path="new.ts"') + 'const x = 1;' + blockClose('create_file');
      const calls = parser.parseToolCalls(input);
      expect(calls).toHaveLength(1);
      expect(calls[0].name).toBe('create_file');
      expect(calls[0].path).toBe('new.ts');
      expect(calls[0].content).toBe('const x = 1;');
    });

    it('should parse patch_file with SEARCH/REPLACE content', () => {
      const parser = makeParser();
      const content = 'SEARCH\nold code\nREPLACE\nnew code';
      const input = blockOpen('patch_file', 'path="edit.ts"') + content + blockClose('patch_file');
      const calls = parser.parseToolCalls(input);
      expect(calls).toHaveLength(1);
      expect(calls[0].name).toBe('patch_file');
      expect(calls[0].path).toBe('edit.ts');
      expect(calls[0].content).toBe(content);
    });

    it('should parse run_command', () => {
      const parser = makeParser();
      const calls = parser.parseToolCalls(selfClosing('run_command', 'command="npm test"'));
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({ name: 'run_command', command: 'npm test' });
    });

    it('should parse run_command with complex command', () => {
      const parser = makeParser();
      const calls = parser.parseToolCalls(selfClosing('run_command', 'command="node -e \\"console.log(1)\\""'));
      expect(calls).toHaveLength(1);
      expect(calls[0].name).toBe('run_command');
      expect(calls[0].command).toContain('node');
    });

    it('should parse browser_screenshot without name', () => {
      const parser = makeParser();
      const calls = parser.parseToolCalls(selfClosing('browser_screenshot'));
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({ name: 'browser_screenshot' });
    });

    it('should parse browser_screenshot with name attribute', () => {
      const parser = makeParser();
      const calls = parser.parseToolCalls(selfClosing('browser_screenshot', 'name="manufacturer_login_page"'));
      expect(calls).toHaveLength(1);
      expect(calls[0].name).toBe('browser_screenshot');
      expect(calls[0].screenshot_name).toBe('manufacturer_login_page');
    });

    it('should parse list_terminals', () => {
      const parser = makeParser();
      const calls = parser.parseToolCalls(selfClosing('list_terminals'));
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({ name: 'list_terminals' });
    });

    it('should parse browser_navigate', () => {
      const parser = makeParser();
      const calls = parser.parseToolCalls(selfClosing('browser_navigate', 'url="http://localhost:3000"'));
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({ name: 'browser_navigate', url: 'http://localhost:3000' });
    });

    it('should parse browser_click', () => {
      const parser = makeParser();
      const calls = parser.parseToolCalls(selfClosing('browser_click', 'selector="#my-button"'));
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({ name: 'browser_click', selector: '#my-button' });
    });

    it('should parse browser_type', () => {
      const parser = makeParser();
      const calls = parser.parseToolCalls(selfClosing('browser_type', 'selector="#input" text="hello"'));
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({ name: 'browser_type', selector: '#input', text: 'hello' });
    });

    it('should parse browser_evaluate_script', () => {
      const parser = makeParser();
      const calls = parser.parseToolCalls(selfClosing('browser_evaluate_script', 'script="document.title"'));
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({ name: 'browser_evaluate_script', script: 'document.title' });
    });

    it('should parse list_dir', () => {
      const parser = makeParser();
      const calls = parser.parseToolCalls(selfClosing('list_dir', 'path="src"'));
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({ name: 'list_dir', path: 'src' });
    });

    it('should parse grep_search', () => {
      const parser = makeParser();
      const calls = parser.parseToolCalls(selfClosing('grep_search', 'query="function"'));
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({ name: 'grep_search', query: 'function' });
    });

    it('should parse web_search', () => {
      const parser = makeParser();
      const calls = parser.parseToolCalls(selfClosing('web_search', 'query="typescript"'));
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({ name: 'web_search', query: 'typescript' });
    });

    it('should parse figma_inspect', () => {
      const parser = makeParser();
      const calls = parser.parseToolCalls(selfClosing('figma_inspect', 'url="https://figma.com/file/test"'));
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({ name: 'figma_inspect', url: 'https://figma.com/file/test' });
    });

    it('should parse write_file and strip CDATA wrapper if present', () => {
      const parser = makeParser();
      const input = blockOpen('write_file', 'path="src/index.ts"') + '<![CDATA[console.log("hello");]]>' + blockClose('write_file');
      const calls = parser.parseToolCalls(input);
      expect(calls).toHaveLength(1);
      expect(calls[0].name).toBe('write_file');
      expect(calls[0].path).toBe('src/index.ts');
      expect((calls[0] as any).content).toBe('console.log("hello");');
    });

    it('should parse send_terminal_input (block style)', () => {
      const parser = makeParser();
      const input = blockOpen('send_terminal_input', 'terminal_name="Term 1"') + 'Ctrl+C' + blockClose('send_terminal_input');
      const calls = parser.parseToolCalls(input);
      expect(calls).toHaveLength(1);
      expect(calls[0].name).toBe('send_terminal_input');
      expect((calls[0] as any).terminal_name).toBe('Term 1');
      expect((calls[0] as any).content).toBe('Ctrl+C');
    });

    it('should parse send_terminal_input (self-closing style)', () => {
      const parser = makeParser();
      const calls = parser.parseToolCalls(selfClosing('send_terminal_input', 'terminal_name="MyTerm" input="exit"'));
      expect(calls).toHaveLength(1);
      expect(calls[0].name).toBe('send_terminal_input');
      expect((calls[0] as any).terminal_name).toBe('MyTerm');
    });

    it('should parse close_terminal', () => {
      const parser = makeParser();
      const calls = parser.parseToolCalls(selfClosing('close_terminal', 'terminal_name="Term 1"'));
      expect(calls).toHaveLength(1);
      expect(calls[0].name).toBe('close_terminal');
      expect((calls[0] as any).terminal_name).toBe('Term 1');
    });

    it('should parse read_terminal', () => {
      const parser = makeParser();
      const calls = parser.parseToolCalls(selfClosing('read_terminal', 'terminal_name="Term 1"'));
      expect(calls).toHaveLength(1);
      expect(calls[0].name).toBe('read_terminal');
      expect((calls[0] as any).terminal_name).toBe('Term 1');
    });

    it('should parse read_terminal with sanitized long terminal names', () => {
      const parser = makeParser();
      const calls = parser.parseToolCalls(
        selfClosing('read_terminal', 'terminal_name="Mirror: cd temp-login and npm install and npm install tailwindcss ..."')
      );
      expect(calls).toHaveLength(1);
      expect(calls[0].name).toBe('read_terminal');
      expect((calls[0] as any).terminal_name).toBe('Mirror: cd temp-login and npm install and npm install tailwindcss ...');
    });

    it('should parse run_command with nested unescaped quotes and redirections correctly', () => {
      const parser = makeParser();
      const inputDouble = '<run_command command="powershell -Command \'npm run compile 2>&1 | ForEach-Object { $_ -replace \\"^D:.*?error \\", \\"\\" }\'" />';
      const callsDouble = parser.parseToolCalls(inputDouble);
      expect(callsDouble).toHaveLength(1);
      expect(callsDouble[0].name).toBe('run_command');
      expect((callsDouble[0] as any).command).toBe(`powershell -Command 'npm run compile 2>&1 | ForEach-Object { $_ -replace "^D:.*?error ", "" }'`);

      const inputSingle = '<run_command command=\'powershell -Command "$null; Write-Output \\"---$\\"; dir *.config.* 2> $null; Write-Output \\"---$\\"; dir *.js 2> $null"\' />';
      const callsSingle = parser.parseToolCalls(inputSingle);
      expect(callsSingle).toHaveLength(1);
      expect(callsSingle[0].name).toBe('run_command');
      expect((callsSingle[0] as any).command).toBe(`powershell -Command "$null; Write-Output \\"---$\\"; dir *.config.* 2> $null; Write-Output \\"---$\\"; dir *.js 2> $null"`);
    });

    it('should return empty array for text with no tool tags', () => {
      const parser = makeParser();
      expect(parser.parseToolCalls('Just some text')).toEqual([]);
    });

    it('should return empty array for empty string', () => {
      const parser = makeParser();
      expect(parser.parseToolCalls('')).toEqual([]);
    });

    it('should return only the first tool call when multiple are present', () => {
      const parser = makeParser();
      const input = selfClosing('read_file', 'path="a.ts"') + ' ' + selfClosing('read_file', 'path="b.ts"');
      const calls = parser.parseToolCalls(input);
      expect(calls).toHaveLength(1);
      expect(calls[0].path).toBe('a.ts');
    });

    it('should strip code blocks before parsing so tools inside blocks are ignored', () => {
      const parser = makeParser();
      const input = '';
      const calls = parser.parseToolCalls(input);
      expect(calls).toEqual([]);
    });
  });

  describe('getCleanedToolResponse', () => {
    it('should auto-close unclosed block tags (write_file)', () => {
      const parser = makeParser();
      const input = blockOpen('write_file', 'path="test.ts"') + 'content (no closing tag)';
      const result = parser.getCleanedToolResponse(input);
      expect(result).toContain('content');
      expect(result).toContain(blockClose('write_file'));
    });

    it('should auto-close unclosed block tags (create_file)', () => {
      const parser = makeParser();
      const input = blockOpen('create_file', 'path="test.ts"') + 'content';
      const result = parser.getCleanedToolResponse(input);
      expect(result).toContain(blockClose('create_file'));
    });

    it('should auto-close unclosed block tags (patch_file)', () => {
      const parser = makeParser();
      const input = blockOpen('patch_file', 'path="test.ts"') + 'SEARCH\nREPLACE';
      const result = parser.getCleanedToolResponse(input);
      expect(result).toContain(blockClose('patch_file'));
    });

    it('should strip content after the first tool call', () => {
      const parser = makeParser();
      const input = selfClosing('read_file', 'path="a.ts"') + ' extra ' + selfClosing('read_file', 'path="b.ts"');
      const result = parser.getCleanedToolResponse(input);
      expect(result).not.toContain('b.ts');
    });

    it('should strip content after a block tool call', () => {
      const parser = makeParser();
      const input = blockOpen('write_file', 'path="a.ts"') + 'content' + blockClose('write_file') + ' extra stuff ' + selfClosing('read_file', 'path="b.ts"');
      const result = parser.getCleanedToolResponse(input);
      expect(result).not.toContain('b.ts');
      expect(result).not.toContain('extra stuff');
    });

    it('should preserve the first tool call entirely', () => {
      const parser = makeParser();
      const input = selfClosing('read_file', 'path="a.ts"');
      const result = parser.getCleanedToolResponse(input);
      expect(result).toContain('a.ts');
      expect(result).toContain('read_file');
    });

    it('should return input unchanged for text with no tool calls', () => {
      const parser = makeParser();
      const input = 'Just some text';
      expect(parser.getCleanedToolResponse(input)).toBe(input);
    });

    it('should return empty string for empty input', () => {
      const parser = makeParser();
      expect(parser.getCleanedToolResponse('')).toBe('');
    });

    it('should not truncate tags whose attributes contain a > character', () => {
      const parser = makeParser();
      const input = '<run_command command="git log 2>&1 | select -first 30" /> extra content';
      const result = parser.getCleanedToolResponse(input);
      expect(result).toBe('<run_command command="git log 2>&1 | select -first 30" />');
    });
  });

  describe('formatToolStatus', () => {
    it('should format a running status correctly', () => {
      const parser = makeParser();
      const result = parser.formatToolStatus('read_file', 'running', 'test.ts');
      expect(result).toEqual({
        type: 'toolStatus',
        toolName: 'read_file',
        status: 'running',
        target: 'test.ts',
        result: undefined,
        checkpointId: undefined,
        code: undefined,
        terminalName: undefined,
      });
    });

    it('should format a success status with result', () => {
      const parser = makeParser();
      const result = parser.formatToolStatus('read_file', 'success', 'test.ts', 'file content here');
      expect(result.type).toBe('toolStatus');
      expect(result.status).toBe('success');
      expect(result.result).toBe('file content here');
    });

    it('should format an error status with checkpointId', () => {
      const parser = makeParser();
      const result = parser.formatToolStatus('write_file', 'error', 'test.ts', 'Write failed', 'cp_123');
      expect(result.status).toBe('error');
      expect(result.checkpointId).toBe('cp_123');
    });

    it('should format with terminalName for send_terminal_input', () => {
      const parser = makeParser();
      const result = parser.formatToolStatus('send_terminal_input', 'running', 'Term 1', undefined, undefined, undefined, 'Term 1');
      expect(result.terminalName).toBe('Term 1');
    });

    it('should format with code for patch_file', () => {
      const parser = makeParser();
      const result = parser.formatToolStatus('patch_file', 'running', 'test.ts', undefined, undefined, 'SEARCH/REPLACE block');
      expect(result.code).toBe('SEARCH/REPLACE block');
    });
  });
});
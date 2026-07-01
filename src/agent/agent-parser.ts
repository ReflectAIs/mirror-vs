import { ToolCall, ToolStatusMessage } from './types';

/**
 * Parses tool calls from raw LLM response text.
 * Handles: stripping code blocks, auto-closing tags, cleaning responses,
 * and enforcing one-tool-per-turn.
 */
export class AgentParser {
  /**
   * Remove fenced code blocks from text before tool-tag scanning.
   */
  public stripCodeBlocks(text: string): string {
    let result = text.replace(/\x60\x60\x60[\s\S]*?\x60\x60\x60/g, '');
    result = result.replace(/`[^`\n]*?`/g, '');
    result = result.replace(/&lt;\/?[a-z_]+[\s\S]*?\/?&gt;/gi, '');
    return result;
  }

  private findUnquotedTagEndEx(
    text: string,
    toolName: string,
    startFrom: number = 0,
  ): { start: number; end: number; attrs: string; isSelfClosing: boolean } | null {
    const openTag = '\u003C' + toolName;
    const startIdx = text.toLowerCase().indexOf(openTag, startFrom);
    if (startIdx === -1) return null;

    const nextChar = text[startIdx + openTag.length];
    if (nextChar && !/\s|\/|\u003E/.test(nextChar)) {
      return this.findUnquotedTagEndEx(text, toolName, startIdx + 1);
    }

    let inDq = false;
    let inSq = false;
    let escaped = false;
    for (let i = startIdx + openTag.length; i < text.length; i++) {
      const char = text[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"' && !inSq) {
        if (inDq) {
          const remaining = text.substring(i + 1).trim();
          if (
            remaining === '' ||
            remaining.startsWith('/>') ||
            remaining.startsWith('>') ||
            remaining.startsWith('\u003E') ||
            /^[a-zA-Z_0-9-]+\s*=/.test(remaining)
          ) {
            inDq = false;
          }
        } else {
          inDq = true;
        }
        continue;
      }
      if (char === "'" && !inDq) {
        if (inSq) {
          const remaining = text.substring(i + 1).trim();
          if (
            remaining === '' ||
            remaining.startsWith('/>') ||
            remaining.startsWith('>') ||
            remaining.startsWith('\u003E') ||
            /^[a-zA-Z_0-9-]+\s*=/.test(remaining)
          ) {
            inSq = false;
          }
        } else {
          inSq = true;
        }
        continue;
      }
      if (char === '\u003E' && !inDq && !inSq) {
        const tagText = text.substring(startIdx, i + 1);
        const isSelfClosing = tagText.trim().endsWith('/\u003E');
        const attrs = text.substring(openTag.length + startIdx, i - (isSelfClosing ? 1 : 0));
        return {
          start: startIdx,
          end: i + 1,
          attrs,
          isSelfClosing,
        };
      }
    }
    return null;
  }

  private isInsideFencedCodeBlock(text: string, index: number): boolean {
    let count = 0;
    let pos = text.indexOf('```');
    while (pos !== -1 && pos < index) {
      count++;
      pos = text.indexOf('```', pos + 3);
    }
    return count % 2 === 1;
  }

  private isInsideInlineCodeBlock(text: string, index: number): boolean {
    const lineStart = text.lastIndexOf('\n', index) + 1;
    const lineEnd = text.indexOf('\n', index);
    const line = text.substring(lineStart, lineEnd === -1 ? text.length : lineEnd);
    const indexInLine = index - lineStart;

    let count = 0;
    let pos = line.indexOf('`');
    while (pos !== -1 && pos < indexInLine) {
      count++;
      pos = line.indexOf('`', pos + 1);
    }
    return count % 2 === 1;
  }

  public hasCompleteToolCall(text: string): boolean {
    const selfClosingTools = [
      'read_file',
      'list_dir',
      'grep_search',
      'web_search',
      'browser_navigate',
      'browser_click',
      'browser_type',
      'browser_evaluate_script',
      'browser_screenshot',
      'figma_inspect',
      'run_command',
      'run_script',
      'run_server',
      'close_terminal',
      'read_terminal',
      'list_terminals',
      'delete_file',
      'git_status',
      'git_diff',
      'git_add',
      'symbol_search',
      'rename_symbol',
      'wait',
      'analyze_project',
      'analyze_dependencies',
      'analyze_complexity',
      'analyze_coverage',
      'analyze_dead_code',
      'analyze_impact',
      'graphify',
      'get_diagnostics',
    ];
    for (const tool of selfClosingTools) {
      let startFrom = 0;
      let tagInfo;
      while ((tagInfo = this.findUnquotedTagEndEx(text, tool, startFrom)) !== null) {
        if (!this.isInsideFencedCodeBlock(text, tagInfo.start) && !this.isInsideInlineCodeBlock(text, tagInfo.start)) {
          return true;
        }
        startFrom = tagInfo.end;
      }
    }
    const blockTools = [
      'create_file',
      'write_file',
      'patch_file',
      'send_terminal_input',
      'rename_file',
      'git_commit',
      'multi_patch_file',
      'multipatch_file',
      'create_artifact',
    ];
    for (const tool of blockTools) {
      let startFrom = 0;
      let tagInfo;
      while ((tagInfo = this.findUnquotedTagEndEx(text, tool, startFrom)) !== null) {
        if (!this.isInsideFencedCodeBlock(text, tagInfo.start) && !this.isInsideInlineCodeBlock(text, tagInfo.start)) {
          const closeTag = '\u003C\u002F' + tool + '\\s*\u003E';
          const regex = new RegExp(closeTag, 'i');
          if (regex.test(text.substring(tagInfo.end))) {
            return true;
          }
        }
        startFrom = tagInfo.end;
      }
    }
    return false;
  }

  private autoCloseToolTags(text: string): string {
    const blockTools = [
      'create_file',
      'write_file',
      'patch_file',
      'send_terminal_input',
      'rename_file',
      'git_commit',
      'multi_patch_file',
      'multipatch_file',
      'create_artifact',
    ];
    let adjustedText = text;
    for (const tool of blockTools) {
      const hasOpen = this.findUnquotedTagEndEx(adjustedText, tool) !== null;
      const closeTag = '\u003C\u002F' + tool + '\\s*\u003E';
      const closeRegex = new RegExp(closeTag, 'i');
      if (hasOpen && !closeRegex.test(adjustedText)) {
        adjustedText = adjustedText.trimEnd() + '\n\u003C\u002F' + tool + '\u003E';
      }
    }
    return adjustedText;
  }

  public getCleanedToolResponse(text: string): string {
    const closedText = this.autoCloseToolTags(text);
    const selfClosingTools = [
      'read_file',
      'list_dir',
      'grep_search',
      'web_search',
      'browser_navigate',
      'browser_click',
      'browser_type',
      'browser_evaluate_script',
      'browser_screenshot',
      'figma_inspect',
      'run_command',
      'run_script',
      'run_server',
      'close_terminal',
      'read_terminal',
      'list_terminals',
      'delete_file',
      'git_status',
      'git_diff',
      'git_add',
      'symbol_search',
      'rename_symbol',
      'wait',
      'analyze_project',
      'analyze_dependencies',
      'analyze_complexity',
      'analyze_coverage',
      'analyze_dead_code',
      'analyze_impact',
      'graphify',
      'get_diagnostics',
    ];
    let earliestEnd = -1;
    for (const tool of selfClosingTools) {
      let startFrom = 0;
      let tagInfo;
      while ((tagInfo = this.findUnquotedTagEndEx(closedText, tool, startFrom)) !== null) {
        if (
          !this.isInsideFencedCodeBlock(closedText, tagInfo.start) &&
          !this.isInsideInlineCodeBlock(closedText, tagInfo.start)
        ) {
          if (earliestEnd === -1 || tagInfo.end < earliestEnd) {
            earliestEnd = tagInfo.end;
          }
        }
        startFrom = tagInfo.end;
      }
    }
    const blockTools = [
      'create_file',
      'write_file',
      'patch_file',
      'send_terminal_input',
      'rename_file',
      'git_commit',
      'multi_patch_file',
      'multipatch_file',
      'create_artifact',
    ];
    for (const tool of blockTools) {
      let startFrom = 0;
      let tagInfo;
      while ((tagInfo = this.findUnquotedTagEndEx(closedText, tool, startFrom)) !== null) {
        if (
          !this.isInsideFencedCodeBlock(closedText, tagInfo.start) &&
          !this.isInsideInlineCodeBlock(closedText, tagInfo.start)
        ) {
          const closeTag = '\u003C\u002F' + tool + '\\s*\u003E';
          const regex = new RegExp(closeTag, 'i');
          const m = regex.exec(closedText.substring(tagInfo.end));
          if (m) {
            const endIdx = tagInfo.end + m.index + m[0].length;
            if (earliestEnd === -1 || endIdx < earliestEnd) {
              earliestEnd = endIdx;
            }
          }
        }
        startFrom = tagInfo.end;
      }
    }
    if (earliestEnd !== -1) {
      return closedText.substring(0, earliestEnd);
    }
    return closedText;
  }

  private attr(attrs: string, name: string): string | null {
    // 1. Straight double quotes
    const dqName = name + '\\s*=\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"';
    const dq = new RegExp(dqName, 'i').exec(attrs);
    if (dq) return dq[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');

    // 2. Straight single quotes
    const sqName = name + "\\s*=\\s*'([^'\\\\]*(?:\\\\.[^'\\\\]*)*)'";
    const sq = new RegExp(sqName, 'i').exec(attrs);
    if (sq) return sq[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');

    // 3. Curly double quotes
    const cdqName = name + '\\s*=\\s*[“"]([^“”"\\\\]*(?:\\\\.[^“”"\\\\]*)*)[”"]';
    const cdq = new RegExp(cdqName, 'i').exec(attrs);
    if (cdq) return cdq[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');

    // 4. Curly single quotes
    const csqName = name + '\\s*=\\s*[‘\']([^‘’\'\\\\]*(?:\\\\.[^‘’\'\\\\]*)*)[’\']';
    const csq = new RegExp(csqName, 'i').exec(attrs);
    if (csq) return csq[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');

    // 5. Unquoted fallback
    const simpleName = name + '\\s*=\\s*([^\\s>]+)';
    const simple = new RegExp(simpleName, 'i').exec(attrs);
    if (simple) return simple[1];

    return null;
  }

  public parseToolCalls(rawText: string, allowParallelReadOnly: boolean = false): ToolCall[] {
    const candidates: { index: number; tool: ToolCall }[] = [];
    let tagInfo;
    let startFrom = 0;

    // read_file
    startFrom = 0;
    while ((tagInfo = this.findUnquotedTagEndEx(rawText, 'read_file', startFrom)) !== null) {
      if (
        this.isInsideFencedCodeBlock(rawText, tagInfo.start) ||
        this.isInsideInlineCodeBlock(rawText, tagInfo.start)
      ) {
        startFrom = tagInfo.end;
        continue;
      }
      const p = this.attr(tagInfo.attrs, 'path');
      if (p) {
        const sl = this.attr(tagInfo.attrs, 'start_line');
        const el = this.attr(tagInfo.attrs, 'end_line');
        const tool: ToolCall = { name: 'read_file', path: p.trim() };
        if (sl) tool.start_line = parseInt(sl, 10);
        if (el) tool.end_line = parseInt(el, 10);
        candidates.push({ index: tagInfo.start, tool });
      }
      startFrom = tagInfo.end;
    }

    // figma_inspect
    startFrom = 0;
    while ((tagInfo = this.findUnquotedTagEndEx(rawText, 'figma_inspect', startFrom)) !== null) {
      if (
        this.isInsideFencedCodeBlock(rawText, tagInfo.start) ||
        this.isInsideInlineCodeBlock(rawText, tagInfo.start)
      ) {
        startFrom = tagInfo.end;
        continue;
      }
      const u = this.attr(tagInfo.attrs, 'url');
      if (u) candidates.push({ index: tagInfo.start, tool: { name: 'figma_inspect', url: u } });
      startFrom = tagInfo.end;
    }

    // list_dir
    startFrom = 0;
    while ((tagInfo = this.findUnquotedTagEndEx(rawText, 'list_dir', startFrom)) !== null) {
      if (
        this.isInsideFencedCodeBlock(rawText, tagInfo.start) ||
        this.isInsideInlineCodeBlock(rawText, tagInfo.start)
      ) {
        startFrom = tagInfo.end;
        continue;
      }
      const p = this.attr(tagInfo.attrs, 'path');
      const d = this.attr(tagInfo.attrs, 'depth');
      if (p)
        candidates.push({
          index: tagInfo.start,
          tool: { name: 'list_dir', path: p.trim(), depth: d ? parseInt(d, 10) : undefined },
        });
      startFrom = tagInfo.end;
    }

    // ls_dir alias (models sometimes hallucinate this instead of list_dir)
    startFrom = 0;
    while ((tagInfo = this.findUnquotedTagEndEx(rawText, 'ls_dir', startFrom)) !== null) {
      if (
        this.isInsideFencedCodeBlock(rawText, tagInfo.start) ||
        this.isInsideInlineCodeBlock(rawText, tagInfo.start)
      ) {
        startFrom = tagInfo.end;
        continue;
      }
      const p = this.attr(tagInfo.attrs, 'path');
      const d = this.attr(tagInfo.attrs, 'depth');
      if (p)
        candidates.push({
          index: tagInfo.start,
          tool: { name: 'list_dir', path: p.trim(), depth: d ? parseInt(d, 10) : undefined },
        });
      startFrom = tagInfo.end;
    }

    // grep_search
    startFrom = 0;
    while ((tagInfo = this.findUnquotedTagEndEx(rawText, 'grep_search', startFrom)) !== null) {
      if (
        this.isInsideFencedCodeBlock(rawText, tagInfo.start) ||
        this.isInsideInlineCodeBlock(rawText, tagInfo.start)
      ) {
        startFrom = tagInfo.end;
        continue;
      }
      const q = this.attr(tagInfo.attrs, 'query');
      const p = this.attr(tagInfo.attrs, 'path');
      if (q)
        candidates.push({
          index: tagInfo.start,
          tool: { name: 'grep_search', query: q, path: p ? p.trim() : undefined },
        });
      startFrom = tagInfo.end;
    }

    // web_search
    startFrom = 0;
    while ((tagInfo = this.findUnquotedTagEndEx(rawText, 'web_search', startFrom)) !== null) {
      if (
        this.isInsideFencedCodeBlock(rawText, tagInfo.start) ||
        this.isInsideInlineCodeBlock(rawText, tagInfo.start)
      ) {
        startFrom = tagInfo.end;
        continue;
      }
      const q = this.attr(tagInfo.attrs, 'query');
      if (q) candidates.push({ index: tagInfo.start, tool: { name: 'web_search', query: q } });
      startFrom = tagInfo.end;
    }

    // block tools (write_file, create_file, patch_file, rename_file, git_commit, multi_patch_file, multipatch_file)
    const blockTools = [
      'write_file',
      'create_file',
      'patch_file',
      'rename_file',
      'git_commit',
      'multi_patch_file',
      'multipatch_file',
      'create_artifact',
    ];
    for (const toolName of blockTools) {
      startFrom = 0;
      while ((tagInfo = this.findUnquotedTagEndEx(rawText, toolName, startFrom)) !== null) {
        if (
          this.isInsideFencedCodeBlock(rawText, tagInfo.start) ||
          this.isInsideInlineCodeBlock(rawText, tagInfo.start)
        ) {
          startFrom = tagInfo.end;
          continue;
        }
        const p = this.attr(tagInfo.attrs, 'path');
        if (p || toolName === 'git_commit' || toolName === 'multi_patch_file' || toolName === 'multipatch_file' || toolName === 'create_artifact') {
          const closeTagPattern = '\u003C\u002F' + toolName + '\\s*\u003E';
          const closeTagRegex = new RegExp(closeTagPattern, 'i');
          const closeMatch = closeTagRegex.exec(rawText.substring(tagInfo.end));
          if (closeMatch) {
            let content = rawText.substring(tagInfo.end, tagInfo.end + closeMatch.index);
            // Strip any CDATA wrapper if present (sometimes added by XML-aware LLMs)
            const cdataStart = '<![CDATA[';
            const cdataEnd = ']]>';
            if (content.trim().startsWith(cdataStart) && content.trim().endsWith(cdataEnd)) {
              const trimmed = content.trim();
              content = trimmed.substring(cdataStart.length, trimmed.length - cdataEnd.length);
            }
            const tool: any = {
              name: (toolName === 'multipatch_file' ? 'multi_patch_file' : toolName) as ToolCall['name'],
              path: p ? p.trim() : undefined,
              content,
            };
            if (toolName === 'create_artifact') {
              const id = this.attr(tagInfo.attrs, 'id');
              const type = this.attr(tagInfo.attrs, 'type');
              const title = this.attr(tagInfo.attrs, 'title');
              const language = this.attr(tagInfo.attrs, 'language');
              if (id) tool.id = id.trim();
              if (type) tool.type = type.trim();
              if (title) tool.title = title.trim();
              if (language) tool.language = language.trim();
            }
            candidates.push({
              index: tagInfo.start,
              tool,
            });
            startFrom = tagInfo.end + closeMatch.index + closeMatch[0].length;
            continue;
          }
        }
        startFrom = tagInfo.end;
      }
    }

    // delete_file
    startFrom = 0;
    while ((tagInfo = this.findUnquotedTagEndEx(rawText, 'delete_file', startFrom)) !== null) {
      if (
        this.isInsideFencedCodeBlock(rawText, tagInfo.start) ||
        this.isInsideInlineCodeBlock(rawText, tagInfo.start)
      ) {
        startFrom = tagInfo.end;
        continue;
      }
      const p = this.attr(tagInfo.attrs, 'path');
      if (p) candidates.push({ index: tagInfo.start, tool: { name: 'delete_file', path: p.trim() } });
      startFrom = tagInfo.end;
    }

    // git_status
    startFrom = 0;
    while ((tagInfo = this.findUnquotedTagEndEx(rawText, 'git_status', startFrom)) !== null) {
      if (
        this.isInsideFencedCodeBlock(rawText, tagInfo.start) ||
        this.isInsideInlineCodeBlock(rawText, tagInfo.start)
      ) {
        startFrom = tagInfo.end;
        continue;
      }
      candidates.push({ index: tagInfo.start, tool: { name: 'git_status' } });
      startFrom = tagInfo.end;
    }

    // git_diff
    startFrom = 0;
    while ((tagInfo = this.findUnquotedTagEndEx(rawText, 'git_diff', startFrom)) !== null) {
      if (
        this.isInsideFencedCodeBlock(rawText, tagInfo.start) ||
        this.isInsideInlineCodeBlock(rawText, tagInfo.start)
      ) {
        startFrom = tagInfo.end;
        continue;
      }
      const p = this.attr(tagInfo.attrs, 'path');
      candidates.push({ index: tagInfo.start, tool: { name: 'git_diff', path: p ? p.trim() : undefined } });
      startFrom = tagInfo.end;
    }

    // git_add
    startFrom = 0;
    while ((tagInfo = this.findUnquotedTagEndEx(rawText, 'git_add', startFrom)) !== null) {
      if (
        this.isInsideFencedCodeBlock(rawText, tagInfo.start) ||
        this.isInsideInlineCodeBlock(rawText, tagInfo.start)
      ) {
        startFrom = tagInfo.end;
        continue;
      }
      const p = this.attr(tagInfo.attrs, 'path');
      candidates.push({ index: tagInfo.start, tool: { name: 'git_add', path: p ? p.trim() : undefined } });
      startFrom = tagInfo.end;
    }

    // symbol_search
    startFrom = 0;
    while ((tagInfo = this.findUnquotedTagEndEx(rawText, 'symbol_search', startFrom)) !== null) {
      if (
        this.isInsideFencedCodeBlock(rawText, tagInfo.start) ||
        this.isInsideInlineCodeBlock(rawText, tagInfo.start)
      ) {
        startFrom = tagInfo.end;
        continue;
      }
      const q = this.attr(tagInfo.attrs, 'query');
      if (q) candidates.push({ index: tagInfo.start, tool: { name: 'symbol_search', query: q } });
      startFrom = tagInfo.end;
    }

    // rename_symbol
    startFrom = 0;
    while ((tagInfo = this.findUnquotedTagEndEx(rawText, 'rename_symbol', startFrom)) !== null) {
      if (
        this.isInsideFencedCodeBlock(rawText, tagInfo.start) ||
        this.isInsideInlineCodeBlock(rawText, tagInfo.start)
      ) {
        startFrom = tagInfo.end;
        continue;
      }
      const q = this.attr(tagInfo.attrs, 'query');
      const p = this.attr(tagInfo.attrs, 'path');
      if (q && p) candidates.push({ index: tagInfo.start, tool: { name: 'rename_symbol', query: q, path: p.trim() } });
      startFrom = tagInfo.end;
    }

    // browser_navigate
    startFrom = 0;
    while ((tagInfo = this.findUnquotedTagEndEx(rawText, 'browser_navigate', startFrom)) !== null) {
      if (
        this.isInsideFencedCodeBlock(rawText, tagInfo.start) ||
        this.isInsideInlineCodeBlock(rawText, tagInfo.start)
      ) {
        startFrom = tagInfo.end;
        continue;
      }
      const u = this.attr(tagInfo.attrs, 'url');
      if (u) candidates.push({ index: tagInfo.start, tool: { name: 'browser_navigate', url: u } });
      startFrom = tagInfo.end;
    }

    // browser_click
    startFrom = 0;
    while ((tagInfo = this.findUnquotedTagEndEx(rawText, 'browser_click', startFrom)) !== null) {
      if (
        this.isInsideFencedCodeBlock(rawText, tagInfo.start) ||
        this.isInsideInlineCodeBlock(rawText, tagInfo.start)
      ) {
        startFrom = tagInfo.end;
        continue;
      }
      const s = this.attr(tagInfo.attrs, 'selector');
      if (s) candidates.push({ index: tagInfo.start, tool: { name: 'browser_click', selector: s } });
      startFrom = tagInfo.end;
    }

    // browser_type
    startFrom = 0;
    while ((tagInfo = this.findUnquotedTagEndEx(rawText, 'browser_type', startFrom)) !== null) {
      if (
        this.isInsideFencedCodeBlock(rawText, tagInfo.start) ||
        this.isInsideInlineCodeBlock(rawText, tagInfo.start)
      ) {
        startFrom = tagInfo.end;
        continue;
      }
      const s = this.attr(tagInfo.attrs, 'selector');
      const t = this.attr(tagInfo.attrs, 'text');
      if (s && t) candidates.push({ index: tagInfo.start, tool: { name: 'browser_type', selector: s, text: t } });
      startFrom = tagInfo.end;
    }

    // browser_evaluate_script
    startFrom = 0;
    while ((tagInfo = this.findUnquotedTagEndEx(rawText, 'browser_evaluate_script', startFrom)) !== null) {
      if (
        this.isInsideFencedCodeBlock(rawText, tagInfo.start) ||
        this.isInsideInlineCodeBlock(rawText, tagInfo.start)
      ) {
        startFrom = tagInfo.end;
        continue;
      }
      const scriptAttr = this.attr(tagInfo.attrs, 'script');
      if (scriptAttr)
        candidates.push({ index: tagInfo.start, tool: { name: 'browser_evaluate_script', script: scriptAttr } });
      startFrom = tagInfo.end;
    }

    // browser_screenshot
    startFrom = 0;
    while ((tagInfo = this.findUnquotedTagEndEx(rawText, 'browser_screenshot', startFrom)) !== null) {
      if (
        this.isInsideFencedCodeBlock(rawText, tagInfo.start) ||
        this.isInsideInlineCodeBlock(rawText, tagInfo.start)
      ) {
        startFrom = tagInfo.end;
        continue;
      }
      candidates.push({ index: tagInfo.start, tool: { name: 'browser_screenshot' } });
      startFrom = tagInfo.end;
    }

    // run_command
    startFrom = 0;
    while ((tagInfo = this.findUnquotedTagEndEx(rawText, 'run_command', startFrom)) !== null) {
      if (
        this.isInsideFencedCodeBlock(rawText, tagInfo.start) ||
        this.isInsideInlineCodeBlock(rawText, tagInfo.start)
      ) {
        startFrom = tagInfo.end;
        continue;
      }
      const c = this.attr(tagInfo.attrs, 'command');
      const t = this.attr(tagInfo.attrs, 'terminal_name');
      if (c) {
        const tool: ToolCall = { name: 'run_command', command: c };
        if (t) tool.terminal_name = t;
        candidates.push({ index: tagInfo.start, tool });
      }
      startFrom = tagInfo.end;
    }

    // run_script
    startFrom = 0;
    while ((tagInfo = this.findUnquotedTagEndEx(rawText, 'run_script', startFrom)) !== null) {
      if (
        this.isInsideFencedCodeBlock(rawText, tagInfo.start) ||
        this.isInsideInlineCodeBlock(rawText, tagInfo.start)
      ) {
        startFrom = tagInfo.end;
        continue;
      }
      const c = this.attr(tagInfo.attrs, 'command');
      const t = this.attr(tagInfo.attrs, 'terminal_name');
      if (c) {
        const tool: ToolCall = { name: 'run_script', command: c };
        if (t) tool.terminal_name = t;
        candidates.push({ index: tagInfo.start, tool });
      }
      startFrom = tagInfo.end;
    }

    // run_server
    startFrom = 0;
    while ((tagInfo = this.findUnquotedTagEndEx(rawText, 'run_server', startFrom)) !== null) {
      if (
        this.isInsideFencedCodeBlock(rawText, tagInfo.start) ||
        this.isInsideInlineCodeBlock(rawText, tagInfo.start)
      ) {
        startFrom = tagInfo.end;
        continue;
      }
      const c = this.attr(tagInfo.attrs, 'command');
      const t = this.attr(tagInfo.attrs, 'terminal_name');
      if (c) {
        const tool: ToolCall = { name: 'run_server', command: c };
        if (t) tool.terminal_name = t;
        candidates.push({ index: tagInfo.start, tool });
      }
      startFrom = tagInfo.end;
    }

    // send_terminal_input (both block and self-closing styles)
    startFrom = 0;
    while ((tagInfo = this.findUnquotedTagEndEx(rawText, 'send_terminal_input', startFrom)) !== null) {
      if (
        this.isInsideFencedCodeBlock(rawText, tagInfo.start) ||
        this.isInsideInlineCodeBlock(rawText, tagInfo.start)
      ) {
        startFrom = tagInfo.end;
        continue;
      }
      const termName = this.attr(tagInfo.attrs, 'terminal_name');
      if (termName) {
        if (tagInfo.isSelfClosing) {
          const input = this.attr(tagInfo.attrs, 'input');
          if (input) {
            const tool: ToolCall = { name: 'send_terminal_input', terminal_name: termName.trim(), content: input };
            candidates.push({ index: tagInfo.start, tool });
          }
        } else {
          const closeTagPattern = '\u003C\u002Fsend_terminal_input\\s*\u003E';
          const closeTagRegex = new RegExp(closeTagPattern, 'i');
          const closeMatch = closeTagRegex.exec(rawText.substring(tagInfo.end));
          if (closeMatch) {
            const content = rawText.substring(tagInfo.end, tagInfo.end + closeMatch.index);
            const tool: ToolCall = { name: 'send_terminal_input', terminal_name: termName.trim(), content };
            candidates.push({ index: tagInfo.start, tool });
            startFrom = tagInfo.end + closeMatch.index + closeMatch[0].length;
            continue;
          }
        }
      }
      startFrom = tagInfo.end;
    }

    // wait
    startFrom = 0;
    while ((tagInfo = this.findUnquotedTagEndEx(rawText, 'wait', startFrom)) !== null) {
      if (
        this.isInsideFencedCodeBlock(rawText, tagInfo.start) ||
        this.isInsideInlineCodeBlock(rawText, tagInfo.start)
      ) {
        startFrom = tagInfo.end;
        continue;
      }
      const ms = this.attr(tagInfo.attrs, 'ms');
      const seconds = this.attr(tagInfo.attrs, 'seconds');
      if (ms || seconds) {
        const tool: ToolCall = { name: 'wait' };
        if (ms) tool.ms = parseInt(ms, 10);
        if (seconds) tool.seconds = parseInt(seconds, 10);
        candidates.push({ index: tagInfo.start, tool });
      }
      startFrom = tagInfo.end;
    }

    // close_terminal
    startFrom = 0;
    while ((tagInfo = this.findUnquotedTagEndEx(rawText, 'close_terminal', startFrom)) !== null) {
      if (
        this.isInsideFencedCodeBlock(rawText, tagInfo.start) ||
        this.isInsideInlineCodeBlock(rawText, tagInfo.start)
      ) {
        startFrom = tagInfo.end;
        continue;
      }
      const termName = this.attr(tagInfo.attrs, 'terminal_name');
      if (termName) {
        const tool: ToolCall = { name: 'close_terminal', terminal_name: termName.trim() };
        candidates.push({ index: tagInfo.start, tool });
      }
      startFrom = tagInfo.end;
    }

    // read_terminal
    startFrom = 0;
    while ((tagInfo = this.findUnquotedTagEndEx(rawText, 'read_terminal', startFrom)) !== null) {
      if (
        this.isInsideFencedCodeBlock(rawText, tagInfo.start) ||
        this.isInsideInlineCodeBlock(rawText, tagInfo.start)
      ) {
        startFrom = tagInfo.end;
        continue;
      }
      const termName = this.attr(tagInfo.attrs, 'terminal_name') || '';
      const chars = this.attr(tagInfo.attrs, 'chars');
      const tool: ToolCall = { name: 'read_terminal', terminal_name: termName.trim() };
      if (chars) tool.chars = chars;
      candidates.push({ index: tagInfo.start, tool });
      startFrom = tagInfo.end;
    }

    // list_terminals
    startFrom = 0;
    while ((tagInfo = this.findUnquotedTagEndEx(rawText, 'list_terminals', startFrom)) !== null) {
      if (
        this.isInsideFencedCodeBlock(rawText, tagInfo.start) ||
        this.isInsideInlineCodeBlock(rawText, tagInfo.start)
      ) {
        startFrom = tagInfo.end;
        continue;
      }
      candidates.push({ index: tagInfo.start, tool: { name: 'list_terminals' } });
      startFrom = tagInfo.end;
    }

    // codebase analysis tools
    const codeAnalysisTools = [
      'analyze_project',
      'analyze_dependencies',
      'analyze_complexity',
      'analyze_coverage',
      'analyze_dead_code',
      'graphify',
    ];
    for (const toolName of codeAnalysisTools) {
      startFrom = 0;
      while ((tagInfo = this.findUnquotedTagEndEx(rawText, toolName, startFrom)) !== null) {
        if (
          this.isInsideFencedCodeBlock(rawText, tagInfo.start) ||
          this.isInsideInlineCodeBlock(rawText, tagInfo.start)
        ) {
          startFrom = tagInfo.end;
          continue;
        }
        candidates.push({ index: tagInfo.start, tool: { name: toolName as ToolCall['name'] } });
        startFrom = tagInfo.end;
      }
    }

    // analyze_impact
    startFrom = 0;
    while ((tagInfo = this.findUnquotedTagEndEx(rawText, 'analyze_impact', startFrom)) !== null) {
      if (
        this.isInsideFencedCodeBlock(rawText, tagInfo.start) ||
        this.isInsideInlineCodeBlock(rawText, tagInfo.start)
      ) {
        startFrom = tagInfo.end;
        continue;
      }
      const p = this.attr(tagInfo.attrs, 'path');
      candidates.push({ index: tagInfo.start, tool: { name: 'analyze_impact', path: p ? p.trim() : undefined } });
      startFrom = tagInfo.end;
    }

    // get_diagnostics
    startFrom = 0;
    while ((tagInfo = this.findUnquotedTagEndEx(rawText, 'get_diagnostics', startFrom)) !== null) {
      if (
        this.isInsideFencedCodeBlock(rawText, tagInfo.start) ||
        this.isInsideInlineCodeBlock(rawText, tagInfo.start)
      ) {
        startFrom = tagInfo.end;
        continue;
      }
      const p = this.attr(tagInfo.attrs, 'path');
      candidates.push({ index: tagInfo.start, tool: { name: 'get_diagnostics', path: p ? p.trim() : undefined } });
      startFrom = tagInfo.end;
    }

    if (candidates.length === 0) return [];
    candidates.sort((a, b) => a.index - b.index);

    if (candidates.length > 1) {
      return [{
        name: 'invalid_tool_mix' as any,
        path: 'error',
        content: 'Error: Multiple tool calls are not allowed in a single turn. To prevent incorrect assumptions and ensure file content is actually read first, you must call exactly ONE tool at a time and await its response before calling another.'
      }];
    }

    return [candidates[0].tool];
  }

  public formatToolStatus(
    toolName: string,
    status: 'running' | 'success' | 'error',
    target: string,
    result?: string,
    checkpointId?: string,
    code?: string,
    terminalName?: string,
  ): ToolStatusMessage {
    return {
      type: 'toolStatus',
      toolName,
      status,
      target,
      result,
      checkpointId,
      code,
      terminalName,
    };
  }
}

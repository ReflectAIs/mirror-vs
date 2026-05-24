import { ToolCall } from './types';

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

  private isTagFullyClosed(text: string, toolName: string): boolean {
    const openTag = '\u003C' + toolName;
    const startIdx = text.toLowerCase().indexOf(openTag);
    if (startIdx === -1) return false;
    let inDq = false;
    let inSq = false;
    let escaped = false;
    for (let i = startIdx + openTag.length; i < text.length; i++) {
      const char = text[i];
      if (escaped) { escaped = false; continue; }
      if (char === '\\') { escaped = true; continue; }
      if (char === '"' && !inSq) { inDq = !inDq; continue; }
      if (char === "'" && !inDq) { inSq = !inSq; continue; }
      if (char === '\u003E' && !inDq && !inSq) { return true; }
    }
    return false;
  }

  public hasCompleteToolCall(text: string): boolean {
    const stripped = this.stripCodeBlocks(text);
    const selfClosingTools = [
      'read_file', 'list_dir', 'grep_search', 'web_search',
      'browser_navigate', 'browser_click', 'browser_type',
      'browser_evaluate_script', 'browser_screenshot',
      'figma_inspect', 'run_command', 'close_terminal',
      'read_terminal', 'list_terminals',
    ];
    for (const tool of selfClosingTools) {
      if (this.isTagFullyClosed(stripped, tool)) return true;
    }
    const blockTools = ['create_file', 'write_file', 'patch_file', 'send_terminal_input'];
    for (const tool of blockTools) {
      const closeTag = '\u003C\u002F' + tool + '\\s*\u003E';
      const regex = new RegExp(closeTag, 'i');
      if (regex.test(stripped)) return true;
    }
    return false;
  }

  private autoCloseToolTags(text: string): string {
    const blockTools = ['create_file', 'write_file', 'patch_file', 'send_terminal_input'];
    let adjustedText = text;
    for (const tool of blockTools) {
      const openTag = '\u003C' + tool + '(\\s+[^>]*?)?\u003E';
      const openRegex = new RegExp(openTag, 'i');
      const closeTag = '\u003C\u002F' + tool + '\\s*\u003E';
      const closeRegex = new RegExp(closeTag, 'i');
      if (openRegex.test(adjustedText) && !closeRegex.test(adjustedText)) {
        adjustedText = adjustedText.trimEnd() + '\\n\u003C\u002F' + tool + '\u003E';
      }
    }
    return adjustedText;
  }

  public getCleanedToolResponse(text: string): string {
    const closedText = this.autoCloseToolTags(text);
    const stripped = this.stripCodeBlocks(closedText);
    const selfClosingTools = [
      'read_file', 'list_dir', 'grep_search', 'web_search',
      'browser_navigate', 'browser_click', 'browser_type',
      'browser_evaluate_script', 'browser_screenshot',
      'figma_inspect', 'run_command', 'close_terminal',
      'read_terminal', 'list_terminals',
    ];
    let earliestEnd = -1;
    for (const tool of selfClosingTools) {
      const openTag = '\u003C' + tool + '[^>]*\u003E';
      const regex = new RegExp(openTag, 'i');
      const m = regex.exec(stripped);
      if (m) {
        const escaped = m[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const origM = new RegExp(escaped).exec(closedText);
        if (origM) {
          const endIdx = origM.index + origM[0].length;
          if (earliestEnd === -1 || endIdx < earliestEnd) earliestEnd = endIdx;
        }
      }
    }
    const blockTools = ['create_file', 'write_file', 'patch_file', 'send_terminal_input'];
    for (const tool of blockTools) {
      const closeTag = '\u003C\u002F' + tool + '\\s*\u003E';
      const regex = new RegExp(closeTag, 'i');
      const m = regex.exec(stripped);
      if (m) {
        const escaped = m[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const origM = new RegExp(escaped).exec(closedText);
        if (origM) {
          const endIdx = origM.index + origM[0].length;
          if (earliestEnd === -1 || endIdx < earliestEnd) earliestEnd = endIdx;
        }
      }
    }
    if (earliestEnd !== -1) return closedText.substring(0, earliestEnd);
    return closedText;
  }

  private attr(attrs: string, name: string): string | null {
    const dqName = name + '\\s*=\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"';
    const dq = new RegExp(dqName, 'i').exec(attrs);
    if (dq) return dq[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    const sqName = name + "\\s*=\\s*'([^'\\\\]*(?:\\\\.[^'\\\\]*)*)'";
    const sq = new RegExp(sqName, 'i').exec(attrs);
    if (sq) return sq[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    return null;
  }

  public parseToolCalls(rawText: string): ToolCall[] {
    const text = this.stripCodeBlocks(rawText);
    const candidates: { index: number; tool: ToolCall }[] = [];
    let match;

    // read_file
    const readFileTag = '\\u003Cread_file([\\s\\S]*?)\\/?\\u003E';
    const readFileRegex = new RegExp(readFileTag, 'gi');
    while ((match = readFileRegex.exec(text)) !== null) {
      const p = this.attr(match[1], 'path');
      if (p) {
        const sl = this.attr(match[1], 'start_line');
        const el = this.attr(match[1], 'end_line');
        const tool: ToolCall = { name: 'read_file', path: p.trim() };
        if (sl) tool.start_line = parseInt(sl, 10);
        if (el) tool.end_line = parseInt(el, 10);
        candidates.push({ index: match.index, tool });
      }
    }

    // figma_inspect
    const figmaTag = '\\u003Cfigma_inspect([\\s\\S]*?)\\/?\\u003E';
    const figmaInspectRegex = new RegExp(figmaTag, 'gi');
    while ((match = figmaInspectRegex.exec(text)) !== null) {
      const u = this.attr(match[1], 'url');
      if (u) candidates.push({ index: match.index, tool: { name: 'figma_inspect', url: u } });
    }

    // list_dir
    const listDirTag = '\\u003Clist_dir([\\s\\S]*?)\\/?\\u003E';
    const listDirRegex = new RegExp(listDirTag, 'gi');
    while ((match = listDirRegex.exec(text)) !== null) {
      const p = this.attr(match[1], 'path');
      if (p) candidates.push({ index: match.index, tool: { name: 'list_dir', path: p.trim() } });
    }

    // grep_search
    const grepTag = '\\u003Cgrep_search([\\s\\S]*?)\\/?\\u003E';
    const grepSearchRegex = new RegExp(grepTag, 'gi');
    while ((match = grepSearchRegex.exec(text)) !== null) {
      const q = this.attr(match[1], 'query');
      if (q) candidates.push({ index: match.index, tool: { name: 'grep_search', query: q } });
    }

    // web_search
    const webTag = '\\u003Cweb_search([\\s\\S]*?)\\/?\\u003E';
    const webSearchRegex = new RegExp(webTag, 'gi');
    while ((match = webSearchRegex.exec(text)) !== null) {
      const q = this.attr(match[1], 'query');
      if (q) candidates.push({ index: match.index, tool: { name: 'web_search', query: q } });
    }

    // write_file
    const writeFileTag = '\\u003Cwrite_file([\\s\\S]*?)\\u003E([\\s\\S]*?)\\u003C\\u002Fwrite_file\\s*\\u003E';
    const writeFileRegex = new RegExp(writeFileTag, 'gi');
    while ((match = writeFileRegex.exec(text)) !== null) {
      const p = this.attr(match[1], 'path');
      if (p) candidates.push({ index: match.index, tool: { name: 'write_file', path: p.trim(), content: match[2] } });
    }

    // create_file
    const createFileTag = '\\u003Ccreate_file([\\s\\S]*?)\\u003E([\\s\\S]*?)\\u003C\\u002Fcreate_file\\s*\\u003E';
    const createFileRegex = new RegExp(createFileTag, 'gi');
    while ((match = createFileRegex.exec(text)) !== null) {
      const p = this.attr(match[1], 'path');
      if (p) candidates.push({ index: match.index, tool: { name: 'create_file', path: p.trim(), content: match[2] } });
    }

    // patch_file
    const patchFileTag = '\\u003Cpatch_file([\\s\\S]*?)\\u003E([\\s\\S]*?)\\u003C\\u002Fpatch_file\\s*\\u003E';
    const patchFileRegex = new RegExp(patchFileTag, 'gi');
    while ((match = patchFileRegex.exec(text)) !== null) {
      const p = this.attr(match[1], 'path');
      if (p) candidates.push({ index: match.index, tool: { name: 'patch_file', path: p.trim(), content: match[2] } });
    }

    // browser_navigate
    const browserNavTag = '\\u003Cbrowser_navigate([\\s\\S]*?)\\/?\\u003E';
    const browserNavRegex = new RegExp(browserNavTag, 'gi');
    while ((match = browserNavRegex.exec(text)) !== null) {
      const u = this.attr(match[1], 'url');
      if (u) candidates.push({ index: match.index, tool: { name: 'browser_navigate', url: u } });
    }

    // browser_click
    const browserClickTag = '\\u003Cbrowser_click([\\s\\S]*?)\\/?\\u003E';
    const browserClickRegex = new RegExp(browserClickTag, 'gi');
    while ((match = browserClickRegex.exec(text)) !== null) {
      const s = this.attr(match[1], 'selector');
      if (s) candidates.push({ index: match.index, tool: { name: 'browser_click', selector: s } });
    }

    // browser_type
    const browserTypeTag = '\\u003Cbrowser_type([\\s\\S]*?)\\/?\\u003E';
    const browserTypeRegex = new RegExp(browserTypeTag, 'gi');
    while ((match = browserTypeRegex.exec(text)) !== null) {
      const s = this.attr(match[1], 'selector');
      const t = this.attr(match[1], 'text');
      if (s && t) candidates.push({ index: match.index, tool: { name: 'browser_type', selector: s, text: t } });
    }

    // browser_evaluate_script
    const browserEvalTag = '\\u003Cbrowser_evaluate_script([\\s\\S]*?)\\/?\\u003E';
    const browserEvalRegex = new RegExp(browserEvalTag, 'gi');
    while ((match = browserEvalRegex.exec(text)) !== null) {
      const scriptAttr = this.attr(match[1], 'script');
      if (scriptAttr) candidates.push({ index: match.index, tool: { name: 'browser_evaluate_script', script: scriptAttr } });
    }

    // browser_screenshot
    const browserScreenshotTag = '\\u003Cbrowser_screenshot[\\s\\S]*?\\/?\\u003E';
    const browserScreenshotRegex = new RegExp(browserScreenshotTag, 'gi');
    while ((match = browserScreenshotRegex.exec(text)) !== null) {
      candidates.push({ index: match.index, tool: { name: 'browser_screenshot' } });
    }

    // run_command
    const runCommandTag = '\\u003Crun_command([\\s\\S]*?)\\/?\\u003E';
    const runCommandRegex = new RegExp(runCommandTag, 'gi');
    while ((match = runCommandRegex.exec(text)) !== null) {
      const c = this.attr(match[1], 'command');
      if (c) candidates.push({ index: match.index, tool: { name: 'run_command', command: c } });
    }

    // send_terminal_input (block style)
    const sendTerminalBlockTag = '\\u003Csend_terminal_input([\\s\\S]*?)\\u003E([\\s\\S]*?)\\u003C\\u002Fsend_terminal_input\\s*\\u003E';
    const sendTerminalInputBlockRegex = new RegExp(sendTerminalBlockTag, 'gi');
    while ((match = sendTerminalInputBlockRegex.exec(text)) !== null) {
      const termName = this.attr(match[1], 'terminal_name');
      if (termName) {
        candidates.push({
          index: match.index,
          tool: { name: 'send_terminal_input', terminal_name: termName.trim(), content: match[2] } as any,
        });
      }
    }

    // send_terminal_input (self-closing style)
    const sendTerminalSelfTag = '\\u003Csend_terminal_input([\\s\\S]*?)\\/?\\u003E';
    const sendTerminalInputSelfRegex = new RegExp(sendTerminalSelfTag, 'gi');
    while ((match = sendTerminalInputSelfRegex.exec(text)) !== null) {
      if (match[0].includes('\u003C\\u002Fsend_terminal_input')) continue;
      const termName = this.attr(match[1], 'terminal_name');
      const input = this.attr(match[1], 'input');
      if (termName && input) {
        candidates.push({
          index: match.index,
          tool: { name: 'send_terminal_input', terminal_name: termName.trim(), content: input } as any,
        });
      }
    }

    // close_terminal
    const closeTerminalTag = '\\u003Cclose_terminal([\\s\\S]*?)\\/?\\u003E';
    const closeTerminalRegex = new RegExp(closeTerminalTag, 'gi');
    while ((match = closeTerminalRegex.exec(text)) !== null) {
      const termName = this.attr(match[1], 'terminal_name');
      if (termName) {
        candidates.push({
          index: match.index,
          tool: { name: 'close_terminal', terminal_name: termName.trim() } as any,
        });
      }
    }

    // read_terminal
    const readTerminalTag = '\\u003Cread_terminal([\\s\\S]*?)\\/?\\u003E';
    const readTerminalRegex = new RegExp(readTerminalTag, 'gi');
    while ((match = readTerminalRegex.exec(text)) !== null) {
      const termName = this.attr(match[1], 'terminal_name');
      if (termName) {
        const chars = this.attr(match[1], 'chars');
        candidates.push({
          index: match.index,
          tool: { name: 'read_terminal', terminal_name: termName.trim(), chars: chars || undefined } as any,
        });
      }
    }

    // list_terminals
    const listTerminalsTag = '\\u003Clist_terminals[\\s\\S]*?\\/?\\u003E';
    const listTerminalsRegex = new RegExp(listTerminalsTag, 'gi');
    while ((match = listTerminalsRegex.exec(text)) !== null) {
      candidates.push({ index: match.index, tool: { name: 'list_terminals' } });
    }

    if (candidates.length === 0) return [];
    candidates.sort((a, b) => a.index - b.index);
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
  ): any {
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

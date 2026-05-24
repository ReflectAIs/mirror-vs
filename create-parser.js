
const fs = require('fs');
const content = `import { ToolCall } from './types';

export class AgentParser {
  public stripCodeBlocks(text: string): string {
    let result = text.replace(/\\`\\`\\`[\\s\\S]*?\\`\\`\\`/g, '');
    result = result.replace(/\\`[^\\`\\n]*?\\`/g, '');
    result = result.replace(/&lt;\\/?[a-z_]+[\\s\\S]*?\\/?&gt;/gi, '');
    return result;
  }

  private isTagFullyClosed(text: string, toolName: string): boolean {
    const openTag = \`<\${toolName}\`;
    const startIdx = text.toLowerCase().indexOf(openTag);
    if (startIdx === -1) return false;
    let inDq = false;
    let inSq = false;
    let escaped = false;
    for (let i = startIdx + openTag.length; i < text.length; i++) {
      const char = text[i];
      if (escaped) { escaped = false; continue; }
      if (char === '\\\\') { escaped = true; continue; }
      if (char === '"' && !inSq) { inDq = !inDq; continue; }
      if (char === "'" && !inDq) { inSq = !inSq; continue; }
      if (char === '>' && !inDq && !inSq) { return true; }
    }
    return false;
  }
}
`;
fs.writeFileSync('src/agent/agent-parser.ts', content, 'utf8');
console.log('Written successfully');


import * as fs from 'fs';

const c = fs.readFileSync('src/agent/orchestrator.ts', 'utf8');

const oldStart = c.indexOf('private _stripCodeBlocks(');
if (oldStart === -1) { console.log('NOT FOUND'); process.exit(1); }

// Find the end of this method by finding the next non-comment non-blank line after the closing brace
const methodBodyStart = c.indexOf('{', oldStart) + 1;
let depth = 1;
let pos = methodBodyStart;
while (depth > 0 && pos < c.length) {
  if (c[pos] === '{') depth++;
  if (c[pos] === '}') depth--;
  pos++;
}
const oldEnd = pos; // position after closing brace

const before = c.substring(0, oldStart);
const after = c.substring(oldEnd);

const newFunc = `private _stripCodeBlocks(text: string): string {
    // Step 1: Remove fenced code blocks (triple-backtick with optional language label)
    let result = text.replace(/\\x60\\x60\\x60[\\s\\S]*?\\x60\\x60\\x60/g, '');
    // Step 2: Remove inline code spans (single backtick, non-greedy)
    result = result.replace(/\\x60[^\\x60\\n]*?\\x60/g, '');
    // Step 3: Remove HTML-escaped tool tags (e.g., &lt;read_file ... /&gt;)
    result = result.replace(/&lt;\\/?[a-z_]+[\\s\\S]*?\\/?&gt;/gi, '');
    return result;
  }`;

fs.writeFileSync('src/agent/orchestrator.ts', before + newFunc + after, 'utf8');
console.log('DONE: _stripCodeBlocks updated');


const fs = require('fs');
const c = fs.readFileSync('src/agent/orchestrator.ts', 'utf8');

const BACKTICK = String.fromCharCode(96);

const idx = c.indexOf('private _stripCodeBlocks(');
if (idx === -1) { console.log('NOT FOUND'); process.exit(1); }

const braceStart = c.indexOf('{', idx);
let depth = 1;
let pos = braceStart + 1;
while (depth > 0 && pos < c.length) {
  if (c[pos] === '{') depth++;
  if (c[pos] === '}') depth--;
  pos++;
}

const before = c.substring(0, idx);
const after = c.substring(pos);

const newFunc = [
  'private _stripCodeBlocks(text: string): string {',
  '    // Step 1: Remove fenced code blocks (triple-backtick with optional language label)',
  "    let result = text.replace(/" + BACKTICK + BACKTICK + BACKTICK + "[\\s\\S]*?" + BACKTICK + BACKTICK + BACKTICK + "/g, '');",
  '    // Step 2: Remove inline code spans (single backtick, non-greedy)',
  "    result = result.replace(/" + BACKTICK + "[^" + BACKTICK + "\\n]*?" + BACKTICK + "/g, '');",
  '    // Step 3: Remove HTML-escaped tool tags (e.g., &lt;read_file ... /&gt;)',
  "    result = result.replace(/&lt;\\/?[a-z_]+[\\s\\S]*?\\/?&gt;/gi, '');",
  '    return result;',
  '  }'
].join('\n');

fs.writeFileSync('src/agent/orchestrator.ts', before + newFunc + after, 'utf8');
console.log('DONE');

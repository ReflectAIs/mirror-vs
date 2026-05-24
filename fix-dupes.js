
const fs = require('fs');
const c = fs.readFileSync('src/agent/orchestrator.ts', 'utf8');
const BACKTICK = String.fromCharCode(96);

const idx = c.indexOf('private _stripCodeBlocks(');
if (idx === -1) { console.log('NOT FOUND'); process.exit(1); }

const braceStart = c.indexOf('{', idx);
let depth = 1;
let pos = braceStart + 1;
let content = '';
while (depth > 0 && pos < c.length) {
  const ch = c[pos];
  if (ch === '{') depth++;
  if (ch === '}') depth--;
  if (depth > 0) content += ch;
  pos++;
}

console.log('=== OLD CONTENT ===');
console.log(content);
console.log('=== END OLD ===');

// Build perfect replacement
const triple = BACKTICK + BACKTICK + BACKTICK;
const single = BACKTICK;

let newContent = '';
newContent += '    // Step 1: Remove fenced code blocks (triple-backtick with optional language label)\n';
newContent += "    let result = text.replace(/" + triple + "[\\s\\S]*?" + triple + "/g, '');\n";
newContent += '    // Step 2: Remove inline code spans (single backtick, non-greedy)\n';
newContent += "    result = result.replace(/" + single + "[^" + single + "\\n]*?" + single + "/g, '');\n";
newContent += '    // Step 3: Remove HTML-escaped tool tags (e.g., &lt;read_file ... /&gt;)\n';
newContent += "    result = result.replace(/&lt;\\/?[a-z_]+[\\s\\S]*?\\/?&gt;/gi, '');\n";
newContent += '    return result;';

// Replace the old content
const before = c.substring(0, braceStart + 1);
const after = c.substring(pos);
const result = before + '\n' + newContent + '\n  ' + after;

fs.writeFileSync('src/agent/orchestrator.ts', result, 'utf8');
console.log('DONE - writing replacement');

// Verify
const v = fs.readFileSync('src/agent/orchestrator.ts', 'utf8');
const vi = v.indexOf('private _stripCodeBlocks');
const vbrace = v.indexOf('{', vi);
let vdepth = 1;
let vpos = vbrace + 1;
let vcontent = '';
while (vdepth > 0 && vpos < v.length) {
  const ch = v[vpos];
  if (ch === '{') vdepth++;
  if (ch === '}') vdepth--;
  if (vdepth > 0) vcontent += ch;
  vpos++;
}
console.log('=== NEW CONTENT ===');
console.log(vcontent);
console.log('=== END NEW ===');

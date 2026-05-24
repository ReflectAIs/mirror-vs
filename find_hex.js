
const fs = require('fs');
const buf = fs.readFileSync('src/agent/tools/browser-tools.ts');
const str = buf.toString('utf8');
const idx = str.indexOf('Image successfully captured');
console.log('Index:', idx);
console.log('Context (escaped):', JSON.stringify(str.substring(idx - 40, idx + 80)));
console.log('---');
// Show first char codes
for (let i = 0; i < 5; i++) {
  console.log('Line', i, ':', JSON.stringify(str.split('\n')[i]));
}

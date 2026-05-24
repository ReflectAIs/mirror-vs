 
const fs = require('fs');
const content = fs.readFileSync('src/agent/tools/browser-tools.ts', 'utf8');
const lines = content.split('\n');
const line96 = lines[95];
console.log('Line 96 char codes:');
for (let i = 0; i < line96.length; i++) {
  console.log(`  [${i}] '${line96[i]}' (${line96.charCodeAt(i)})`);
}

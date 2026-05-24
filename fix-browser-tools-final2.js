
const fs = require('fs');
const filePath = 'src/agent/tools/browser-tools.ts';
let content = fs.readFileSync(filePath, 'utf8');

// Read lines 94-97 using line splitting
const lines = content.split('\n');
console.log('Total lines:', lines.length);
for (let i = 90; i < Math.min(lines.length, 105); i++) {
  console.log(`Line ${i+1}:`, JSON.stringify(lines[i]));
}

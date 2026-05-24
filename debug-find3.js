
const fs = require('fs');
const content = fs.readFileSync('src/agent/tools/browser-tools.ts', 'utf8');
console.log('Last 200 chars:', JSON.stringify(content.slice(-200)));
// Find "taken successfully"
const tsIdx = content.indexOf('taken successfully');
console.log('taken successfully at:', tsIdx);
if (tsIdx > -1) {
  console.log('Context:', JSON.stringify(content.substring(tsIdx - 50, tsIdx + 50)));
}

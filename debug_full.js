
const fs = require('fs');
let c2 = fs.readFileSync('src/agent/orchestrator.ts', 'utf8');
let count = 0;
let idx = 0;
while ((idx = c2.indexOf('Image successfully captured', idx)) !== -1) {
  count++;
  console.log('Occurrence ' + count + ' at ' + idx + ': ' + JSON.stringify(c2.substring(idx - 5, idx + 70)));
  idx++;
}
console.log('Total: ' + count);

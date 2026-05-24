
const fs = require('fs');
const c = fs.readFileSync('src/agent/orchestrator.ts', 'utf8');
const lines = c.split('\n');
console.log('Line 658:', lines[657]);
console.log('Character codes:');
for (let i = 0; i < lines[657].length; i++) {
  console.log('  [' + i + '] ' + lines[657][i] + ' (' + lines[657].charCodeAt(i) + ')');
}

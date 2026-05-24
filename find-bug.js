
const fs = require('fs');
const c = fs.readFileSync('src/agent/orchestrator.ts', 'utf8');
const matches = [];
let idx = -1;
while ((idx = c.indexOf('result.match', idx + 1)) !== -1) {
  matches.push({ idx, snippet: c.substring(idx, idx + 120) });
}
console.log(JSON.stringify(matches, null, 2));

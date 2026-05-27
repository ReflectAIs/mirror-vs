const fs = require('fs');
const content = fs.readFileSync('src/agent/orchestrator.ts', 'utf8');
const lines = content.split('\n');
for (let i = 505; i < 520; i++) {
  console.log((i+1) + ': ' + JSON.stringify(lines[i]).replace(/\\\\/g, '\\'));
}

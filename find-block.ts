
const fs = require('fs');
var c = fs.readFileSync('src/agent/orchestrator.ts', 'utf8');
var idx = c.lastIndexOf('Remove fenced code');
console.log(c.substring(idx - 50, idx + 300));

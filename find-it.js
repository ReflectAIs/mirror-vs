
const fs = require('fs');
var c = fs.readFileSync('src/agent/orchestrator.ts', 'utf8');
var idx = c.indexOf('Remove fenced code');
var start = idx - 80;
var end = idx + 250;
console.log('=== LINES ' + (c.slice(0,start).split('\n').length) + '-' + (c.slice(0,end).split('\n').length) + ' ===');
console.log(c.substring(start, end));
process.exit(0);

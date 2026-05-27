const fs = require('fs');
const content = fs.readFileSync('src/agent/orchestrator.ts', 'utf8');
const lines = content.split('\n');
console.log('LINE 509 RAW:');
console.log(JSON.stringify(lines[508]));
console.log('LINE 509 UNICODE:');
console.log(lines[508].split('').map(c => c.charCodeAt(0).toString(16)).join(' '));

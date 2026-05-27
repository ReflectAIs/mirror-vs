const fs = require('fs');
const c = fs.readFileSync('src/agent/orchestrator.ts', 'utf8');
const lines = c.split('\n');
// This is the actual file content - not cached
console.log('Has Base64:', lines[508].includes('Base64'));
console.log('Has Image:', lines[508].includes('Image'));
console.log('Line 509 actual:', JSON.stringify(lines[508]));

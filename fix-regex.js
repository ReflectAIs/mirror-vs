
const fs = require('fs');
const c = fs.readFileSync('src/agent/orchestrator.ts', 'utf8');
const lines = c.split('\n');
const line451 = lines[450]; // 0-indexed
console.log('Line 451:', JSON.stringify(line451));
const idx = line451.indexOf('vision model');
console.log('Found "vision model" at', idx);
console.log('After vision model:', JSON.stringify(line451.substring(idx + 12, idx + 20)));

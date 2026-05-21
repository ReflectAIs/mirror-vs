
const fs = require('fs');
const p = 'src/agent/orchestrator.ts';
let c = fs.readFileSync(p, 'utf8');

// The broken regex line: const match = result.match(/\(Image successfully captured and sent to vision model);
// Fix: const visionMatch = result.match(/\(Image successfully captured and sent to vision model\)/);

// Find it - the raw bytes have a backslash before the open paren
const searchStr = 'result.match(/\\\\(Image successfully captured and sent to vision model);';
const replaceStr = 'const visionMatch = result.match(/\\\\(Image successfully captured and sent to vision model\\\\)/);';

console.log('Searching for:', JSON.stringify(searchStr));
console.log('Found:', c.includes(searchStr));

// Also try without the const match part
const search2 = 'match = result.match(/\\\\(Image successfully captured and sent to vision model);';
console.log('Search2 found:', c.includes(search2));

// Check the raw bytes
const idx = c.indexOf('vision model');
console.log('Context around first vision model:', JSON.stringify(c.substring(idx - 30, idx + 25)));

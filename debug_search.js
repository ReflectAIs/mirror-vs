
const fs = require('fs');

// Search for the exact pattern
let c1 = fs.readFileSync('src/agent/tools/browser-tools.ts', 'utf8');
let idx = c1.indexOf('Image successfully captured');
if (idx >= 0) {
  console.log('Found at index', idx);
  console.log('Context:', JSON.stringify(c1.substring(idx, idx + 80)));
}

let c2 = fs.readFileSync('src/agent/orchestrator.ts', 'utf8');
idx = c2.indexOf('Image successfully captured');
if (idx >= 0) {
  console.log('Orchestrator found at index', idx);
  console.log('Context:', JSON.stringify(c2.substring(idx, idx + 100)));
}

// Also search with regex pattern
idx = c2.indexOf('(/\\\\(Image');
if (idx >= 0) {
  console.log('Regex pattern found at index', idx);
  console.log('Context:', JSON.stringify(c2.substring(idx, idx + 80)));
}


const fs = require('fs');
const content = fs.readFileSync('src/agent/tools/browser-tools.ts', 'utf8');
// Find the position of the LAST occurrence of "sent to vision model"
const last = content.lastIndexOf('sent to vision model');
console.log('Last occurrence at:', last);
console.log('Context:', JSON.stringify(content.substring(last - 100, last + 100)));
// Show everything after last
console.log('After last:', JSON.stringify(content.substring(last)));

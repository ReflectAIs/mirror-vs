
const fs = require('fs');
const content = fs.readFileSync('src/agent/tools/browser-tools.ts', 'utf8');
const lines = content.split('\n');
const line96 = lines[95];
console.log('Line 96 raw:', JSON.stringify(line96));
console.log('Line 96 chars:', line96.length);

// Check if it ends with );
const endsWith = line96.endsWith(')`;');
console.log('Ends with )`; ?', endsWith);
const endsWith2 = line96.endsWith(')`');
console.log('Ends with )` ?', endsWith2);

// Also check what fix-browser-tools-final3.js is actually looking for
const oldLine96 = '(Image successfully captured and sent to vision model)`;';
console.log('Search string:', JSON.stringify(oldLine96));
console.log('Search string length:', oldLine96.length);
console.log('Line 96 includes search?', line96.includes(oldLine96));

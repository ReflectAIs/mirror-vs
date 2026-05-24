
const fs = require('fs');
const c = fs.readFileSync('src/agent/orchestrator.ts', 'utf8');

// In the file, the text is literally:  res.match(/\(Image successfully captured and sent to vision model);
// The backslash is an actual backslash character in the file
// In a JS string, to represent that, we use \\ for the backslash

const idx = c.indexOf('res.match');
console.log('Found at index:', idx);
console.log('Raw:', JSON.stringify(c.substring(idx, idx + 80)));

// Build the old string from the raw file content
const rawOld = c.substring(idx, idx + 70);
console.log('Old raw:', rawOld);

// Replace it
const rawNew = 'res.match(/\\(Base64 data hidden from output but sent to vision model: (.*)\\)/);';

const newC = c.substring(0, idx) + rawNew + c.substring(idx + rawOld.length);
fs.writeFileSync('src/agent/orchestrator.ts', newC, 'utf8');
console.log('Fixed line 636');

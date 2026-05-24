
const fs = require('fs');
const content = fs.readFileSync('src/agent/tools/browser-tools.ts', 'utf8');
// Check file signature
console.log('First 10 chars codes:', Array.from(content.slice(0, 10)).map(c => c.charCodeAt(0)));
// Check around "successfully" (index 4052)
console.log('Around 4052:', JSON.stringify(content.substring(4045, 4070)));
// Check if the file has BOM
const buf = fs.readFileSync('src/agent/tools/browser-tools.ts');
console.log('First 3 bytes:', buf[0], buf[1], buf[2]);

const fs = require('fs');
const buf = fs.readFileSync('src/agent/orchestrator.ts');
const lines = buf.toString().split('\n');
const line = lines[508]; // 0-indexed line 509
const bufLine = Buffer.from(line, 'utf8');
console.log('Buffer length:', bufLine.length);
console.log('String length:', line.length);

// Show bytes 35-70 of the buffer (around the regex area)
for (let i = 35; i < 70 && i < bufLine.length; i++) {
  process.stdout.write(bufLine[i].toString(16).padStart(2,'0') + ':' + String.fromCharCode(bufLine[i]) + ' ');
}
console.log();

// Show the full line as hex bytes
for (let i = 35; i < Math.min(80, bufLine.length); i++) {
  process.stdout.write(bufLine[i].toString(16).padStart(2,'0'));
}
console.log();

// Check if "Image" or "Base64" is in the raw buffer
const lineStr = bufLine.toString('utf8');
console.log('Contains "Image":', lineStr.includes('Image'));
console.log('Contains "Base64":', lineStr.includes('Base64'));
console.log('Raw line excerpt:', JSON.stringify(lineStr.substring(35, 80)));

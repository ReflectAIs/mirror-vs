
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'agent', 'tools', 'browser-tools.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Find the exact string "(Image successfully captured and sent to vision model)"
const oldStr = '(Image successfully captured and sent to vision model)';
const newStr = '(Base64 data hidden from output but sent to vision model: ${base64})';
const idx = content.indexOf(oldStr);
if (idx !== -1) {
  // Check what comes before this to make sure we're in the right place
  const before = content.substring(idx - 20, idx);
  console.log('Context before match:', JSON.stringify(before));
  console.log('Match found at index:', idx);
  content = content.substring(0, idx) + newStr + content.substring(idx + oldStr.length);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Fixed browser-tools.ts');
} else {
  // Check what's actually there around line 96
  console.log('ERROR: old string not found');
  const line96idx = content.indexOf('sent to vision model');
  if (line96idx !== -1) {
    console.log('Found near:', content.substring(line96idx - 30, line96idx + 60));
  }
}

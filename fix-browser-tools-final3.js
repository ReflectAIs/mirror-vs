
const fs = require('fs');
const filePath = 'src/agent/tools/browser-tools.ts';
let content = fs.readFileSync(filePath, 'utf8');

// Line 96: "(Image successfully captured and sent to vision model)`;"
// Replace with the new marker that includes base64
const oldLine96 = '(Image successfully captured and sent to vision model)`;';
const newLine96 = '(Base64 data hidden from output but sent to vision model: ${base64})`;';

if (content.includes(oldLine96)) {
  content = content.replace(oldLine96, newLine96);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('REPLACED successfully!');
} else {
  console.log('OLD line 96 not found. Looking for it...');
  const idx = content.indexOf('captured and sent to vision model');
  if (idx !== -1) {
    console.log('Found partial at', idx);
    console.log('Full context:', JSON.stringify(content.substring(idx - 10, idx + 50)));
  }
}

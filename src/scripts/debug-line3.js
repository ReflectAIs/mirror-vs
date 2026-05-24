const fs = require('fs');
const c = fs.readFileSync('src/webview/sidebar.js', 'utf8');
const lines = c.split('\n');
console.log('Total lines:', lines.length);
// Find the submitMessage function
const idx = c.indexOf('function submitMessage()');
const beforeNewline = c.lastIndexOf('\n', idx);
console.log('Index of submitMessage:', idx);
console.log('Line start index:', beforeNewline);
// Count lines up to that point
const upToMatch = c.substring(0, idx);
const lineNum = upToMatch.split('\n').length;
console.log('submitMessage is on line:', lineNum);
// Show surrounding lines
for (let i = lineNum - 3; i <= lineNum + 3 && i < lines.length; i++) {
  console.log();
}

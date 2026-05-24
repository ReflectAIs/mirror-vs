const fs = require('fs');
const c = fs.readFileSync('src/webview/sidebar.js', 'utf8');
const lines = c.split('\n');
for (let i = 506; i <= 510 && i < lines.length; i++) {
  console.log();
}
// Now check for the exact comment text
const commentIdx = c.indexOf('7. Core Message Submission');
if (commentIdx >= 0) {
  console.log('Found comment at:', commentIdx);
  console.log('Comment context:', JSON.stringify(c.substring(commentIdx-30, commentIdx+50)));
}

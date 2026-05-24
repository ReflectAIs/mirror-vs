
const fs = require('fs');
const filePath = 'src/agent/tools/browser-tools.ts';
let content = fs.readFileSync(filePath, 'utf8');

// Show exact byte content around the return statement
const retIdx = content.indexOf('return `');
if (retIdx !== -1) {
  console.log('Found return at index', retIdx);
  // Show from the comment above to end of the string
  const commentIdx = content.lastIndexOf('//', retIdx);
  console.log('Full return block:');
  console.log(JSON.stringify(content.substring(commentIdx, commentIdx + 300)));
}

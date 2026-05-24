const fs = require('fs');
const c = fs.readFileSync('src/webview/sidebar.js', 'utf8');

const idx = c.indexOf('Slash Command');
if (idx >= 0) {
  console.log('SUCCESS: Slash command support found at position', idx);
  console.log('Context:');
  console.log(c.substring(idx, idx + 300));
  console.log('...');
  // Verify the whole function is intact
  const funcEnd = c.indexOf('renderImageAttachments();', idx);
  console.log('Function ends at:', funcEnd);
  console.log('Function length:', funcEnd - idx + 27);
} else {
  console.log('FAILED: Slash command support not found');
  // Check if the original comment still exists
  const oldIdx = c.indexOf('Core Message Submission');
  console.log('Original comment found at:', oldIdx);
  if (oldIdx >= 0) {
    console.log('Context:', c.substring(oldIdx, oldIdx + 100));
  }
}

// Count submitMessage occurrences
let count = 0;
let pos = 0;
while ((pos = c.indexOf('function submitMessage()', pos)) >= 0) {
  count++;
  pos++;
}
console.log('Number of submitMessage functions:', count);

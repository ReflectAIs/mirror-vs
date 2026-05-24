
const fs = require('fs');
const content = fs.readFileSync('src/agent/tools/browser-tools.ts', 'utf8');
const marker = "(Image successfully captured and sent to vision model)";
const idx = content.indexOf(marker);
console.log('File length:', content.length);
console.log('Index of marker:', idx);
if (idx === -1) {
  // Find each word individually
  console.log('Image idx:', content.indexOf('Image'));
  console.log('successfully idx:', content.indexOf('successfully'));
  console.log('captured idx:', content.indexOf('captured'));
  console.log('sent to idx:', content.indexOf('sent to'));
  console.log('vision model idx:', content.indexOf('vision model'));
}

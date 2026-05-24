
const fs = require('fs');
const filePath = 'src/agent/tools/browser-tools.ts';
let content = fs.readFileSync(filePath, 'utf8');

// Check if the file has been corrupted with duplicate content
const returnIdx = content.lastIndexOf('return `');
console.log('Last return at:', returnIdx);

// Show the full content from the screenshot case to the end
const screenshotIdx = content.indexOf("browser_screenshot'");
const fromScreenshot = content.substring(screenshotIdx);
console.log('Full screenshot case length:', fromScreenshot.length);
console.log('Last 300 chars:');
console.log('---');
console.log(fromScreenshot.slice(-300));
console.log('---');

// If the file is corrupted (has both markers), rewrite just the screenshot case
const oldMarker = '(Image successfully captured and sent to vision model)';
const newMarker = '(Base64 data hidden from output but sent to vision model: ${base64})';

if (content.includes(oldMarker)) {
  console.log('Found OLD marker - replacing it!');
  content = content.replace(oldMarker, newMarker);
} else if (content.includes(newMarker)) {
  console.log('Already has NEW marker - no change needed');
} else {
  // Check what's at line 96 area
  const sentToIdx = content.lastIndexOf('sent to vision model');
  if (sentToIdx !== -1) {
    console.log('Found "sent to vision model" at', sentToIdx);
    console.log('Context:', content.substring(sentToIdx - 20, sentToIdx + 60));
  }
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done. New file length:', content.length);

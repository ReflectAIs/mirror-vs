
const fs = require('fs');
const filePath = 'src/agent/tools/browser-tools.ts';
let content = fs.readFileSync(filePath, 'utf8');

// Find the line "(Image successfully captured and sent to vision model)"
const marker = "(Image successfully captured and sent to vision model)";
const idx = content.indexOf(marker);
if (idx === -1) {
  console.log('Marker not found. Searching for parts...');
  // Try partial
  const part = "successfully captured and sent to vision model";
  const idx2 = content.indexOf(part);
  if (idx2 !== -1) {
    console.log('Partial found at', idx2);
    console.log('Context:', JSON.stringify(content.substring(idx2 - 50, idx2 + 100)));
  } else {
    console.log('Partial not found either.');
    console.log('Searching for "vision model"...');
    const idx3 = content.indexOf('vision model');
    if (idx3 !== -1) {
      console.log('"vision model" at', idx3);
      console.log('Context:', JSON.stringify(content.substring(idx3 - 80, idx3 + 40)));
    }
  }
} else {
  console.log('Found at index', idx);
  console.log('Context:', JSON.stringify(content.substring(idx - 20, idx + 60)));
}

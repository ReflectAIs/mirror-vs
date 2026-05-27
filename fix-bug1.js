const fs = require('fs');
const filePath = 'src/agent/orchestrator.ts';
let content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Find and fix the broken regex line
for (let i = 0; i < lines.length; i++) {
  // Look for: res.match(/\(Image successfully captured and sent to vision model);
  // The bug: no closing \) before the /
  if (lines[i].includes('res.match') && lines[i].includes('Image') && lines[i].includes('captured')) {
    lines[i] = lines[i].replace(
      "const match = res.match(/\\\\(Image successfully captured and sent to vision model);",
      "const hasScreenshot = /\\\\(Image successfully captured and sent to vision model\\\\)/.test(res);"
    );
  }
  
  // Fix images.push(match[1]) -> images.push("captured")
  if (lines[i].includes('images.push(match[1])')) {
    lines[i] = lines[i].replace('images.push(match[1])', 'images.push("captured")');
  }
  
  // Fix screenshotCapture base64
  if (lines[i].includes('screenshotCapture') && lines[i].includes('match[1]')) {
    lines[i] = lines[i].replace('base64: match[1]', 'base64: "captured"');
  }
  
  // Fix res.replace line  
  if (lines[i].includes('return res.replace(match[0]')) {
    lines[i] = '              return res.replace(/\\(Image successfully captured and sent to vision model\\)/g, "(Image captured)");';
  }
  
  // Fix: remove the `if (match) {` and replace with `if (hasScreenshot) {`
  // But res.match line already changed to const hasScreenshot, so matching if blocks:
  if (lines[i] === '            if (match) {') {
    lines[i] = '            if (hasScreenshot) {';
  }
}

content = lines.join('\n');
fs.writeFileSync(filePath, content, 'utf8');
console.log('Fix applied successfully');

// Verify the fix
const verify = fs.readFileSync(filePath, 'utf8');
if (verify.includes('hasScreenshot')) {
  console.log('Verified: Bug 1 fixed');
} else {
  console.log('Warning: Bug 1 may not be fixed correctly');
}

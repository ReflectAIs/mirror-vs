
const fs = require('fs');

// Read the file as bytes
const c = fs.readFileSync('src/agent/orchestrator.ts', 'utf8');

// Find the exact position of the buggy regex
const target = '(/\\\\\\(Image successfully captured and sent to vision model)';
// Actually, let's find it by searching for a unique substring
const idx = c.indexOf('Image successfully captured and sent to vision model');
if (idx === -1) {
  console.log('Pattern not found at all!');
  process.exit(1);
}

// Show the surrounding context for debugging
console.log('Found at index', idx);
console.log('Context:', c.substring(idx - 80, idx + 60));

// Now let's do the replacement by finding the exact regex line boundaries
const lineStart = c.lastIndexOf('\n', idx) + 1;
const lineEnd = c.indexOf('\n', idx);
const line = c.substring(lineStart, lineEnd);
console.log('Full line:', line);

// Build replacement
const replacement = line.replace(
  '/\\\\\\(Image successfully captured and sent to vision model)',
  '/\\\\(Base64 data hidden from output but sent to vision model: [^)]+\\\\)/'
);

console.log('Replacement:', replacement);
const newContent = c.substring(0, lineStart) + replacement + c.substring(lineEnd);
fs.writeFileSync('src/agent/orchestrator.ts', newContent, 'utf8');
console.log('Done');

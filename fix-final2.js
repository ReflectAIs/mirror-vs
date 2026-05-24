
const fs = require('fs');
const c = fs.readFileSync('src/agent/orchestrator.ts', 'utf8');

// Fix line 636: the extraction regex that currently has no capture group
// Old: res.match(/\(Image successfully captured and sent to vision model);
// New: res.match(/\(Base64 data hidden from output but sent to vision model: (.*)\)/);
const oldLine2 = 'const match = res.match(/\\(Image successfully captured and sent to vision model);';
const newLine2 = 'const match = res.match(/\\(Base64 data hidden from output but sent to vision model: (.*)\\)/);';

if (c.indexOf(oldLine2) !== -1) {
  c = c.replace(oldLine2, newLine2);
  console.log('Fixed line 636');
} else {
  console.log('WARN: line 636 old pattern not found');
  // Search for any occurrence
  const idx = c.indexOf('res.match');
  if (idx !== -1) {
    console.log('Found res.match at', idx, ':', c.substring(idx, idx + 100));
  }
}

fs.writeFileSync('src/agent/orchestrator.ts', c, 'utf8');
console.log('Done');


const fs = require('fs');

// ==========================================
// FIX 1: browser-tools.ts - Add base64 to screenshot result
// ==========================================
let bt = fs.readFileSync('src/agent/tools/browser-tools.ts', 'utf8');
// Find the screenshot return statement
const btTarget = '(Image successfully captured and sent to vision model)';
const btIdx = bt.indexOf(btTarget);
if (btIdx !== -1) {
  bt = bt.substring(0, btIdx) + '(Base64 data hidden from output but sent to vision model: ${base64})' + bt.substring(btIdx + btTarget.length);
  fs.writeFileSync('src/agent/tools/browser-tools.ts', bt, 'utf8');
  console.log('Fixed: browser-tools.ts - added base64 to result');
} else {
  console.log('WARN: browser-tools.ts target not found');
}

// ==========================================
// FIX 2: orchestrator.ts - Fix screenshot regexes
// ==========================================
let c = fs.readFileSync('src/agent/orchestrator.ts', 'utf8');

// Fix 2a: line 595 - the display cleaning regex
const oldRegex1 = '/\\\\(Image successfully captured and sent to vision model)';
const newRegex1 = '/\\\\(Base64 data hidden from output but sent to vision model: [^)]+\\\\)/';
if (c.indexOf(oldRegex1) !== -1) {
  c = c.replace(oldRegex1, newRegex1);
  console.log('Fixed: orchestrator.ts - regex1 (display cleaning)');
} else {
  console.log('WARN: orchestrator.ts regex1 not found');
  // Show what's actually there
  const idx = c.indexOf('result.match');
  if (idx !== -1) {
    const snippet = c.substring(idx + 13, idx + 70);
    console.log('Found snippet:', JSON.stringify(snippet));
  }
}

fs.writeFileSync('src/agent/orchestrator.ts', c, 'utf8');
console.log('Done');

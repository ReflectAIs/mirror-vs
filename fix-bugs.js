
const fs = require('fs');

// Fix 1: browser-tools.ts - lines 91-96
let c1 = fs.readFileSync('src/agent/tools/browser-tools.ts', 'utf8');
const idx91 = c1.indexOf('      // The orchestrator strips out the base64');
if (idx91 !== -1) {
  const line93start = c1.indexOf('      return', idx91);
  const line96end = c1.indexOf('`;', line93start) + 2;
  const old = c1.substring(line93start, line96end);
  const btChar = String.fromCharCode(96);
  const dollarBrace = String.fromCharCode(36) + String.fromCharCode(123);
  const newReturn = `      return ${btChar}${dollarBrace}fileSavedMsg}Screenshot taken successfully.\n${btChar}${dollarBrace}textSummary}\n(Image successfully captured and sent to vision model: data:image/png;base64,${dollarBrace}base64})${btChar};`;
  c1 = c1.substring(0, line93start) + newReturn + c1.substring(line96end);
  fs.writeFileSync('src/agent/tools/browser-tools.ts', c1, 'utf8');
  console.log('Fixed browser-tools.ts');
}

// Fix 2: orchestrator.ts - fix both regex patterns
let c2 = fs.readFileSync('src/agent/orchestrator.ts', 'utf8');

// Line ~573
c2 = c2.replace(
  'const match = result.match(/\\(Image successfully captured and sent to vision model);',
  'const match = result.match(/\\(Image successfully captured and sent to vision model: data:image\\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)\\)/);'
);

// Line ~614
c2 = c2.replace(
  'const match = res.match(/\\(Image successfully captured and sent to vision model);',
  'const match = res.match(/\\(Image successfully captured and sent to vision model: data:image\\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)\\)/);'
);

fs.writeFileSync('src/agent/orchestrator.ts', c2, 'utf8');
console.log('Fixed orchestrator.ts');

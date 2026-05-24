
const fs = require('fs');

// Fix 1: browser-tools.ts - embed base64 in the result string for vision extraction
// Fix 1: browser-tools.ts - lines 91-96
let c1 = fs.readFileSync('src/agent/tools/browser-tools.ts', 'utf8');

// Find the return statement
const retIdx = c1.indexOf('return `${fileSavedMsg}Screenshot taken successfully.');
if (retIdx !== -1) {
  const templateEnd = c1.indexOf('`;', retIdx);
  if (templateEnd !== -1) {
    // Build the new return using a simple string
    const newReturn = "      // Embed base64 for the orchestrator to extract as vision attachment\n" +
      "      const resultWithBase64 = fileSavedMsg\n" +
      '        ? `${fileSavedMsg}Screenshot taken successfully.\n' +
      "${textSummary}\n" +
      "(Image successfully captured and sent to vision model: data:image/png;base64,${base64})`\n" +
      '        : `Screenshot taken successfully.\n' +
      "${textSummary}\n" +
      "(Image successfully captured and sent to vision model: data:image/png;base64,${base64})`;\n" +
      "      return resultWithBase64;\n" +
      "    }";
    
    c1 = c1.substring(0, retIdx) + newReturn + c1.substring(templateEnd + 2);
    // Remove the old else branch if needed
    fs.writeFileSync('src/agent/tools/browser-tools.ts', c1, 'utf8');
    console.log('Fixed browser-tools.ts');
  }
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

// Fix 2: orchestrator.ts - fix both regexes
// Fix 2: orchestrator.ts - fix both regex patterns
let c2 = fs.readFileSync('src/agent/orchestrator.ts', 'utf8');

// Find both match lines
const lines = c2.split('\n');
let changes = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('const match = ') && line.includes(".match(/\\(Image successfully captured and sent to vision model)")) {
    const indent = line.match(/^\s*/)[0];
    lines[i] = indent + "const match = result.match(/\\(Image successfully captured and sent to vision model: data:image\\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)\\)/);";
    changes++;
  }
}
c2 = lines.join('\n');
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
console.log('Fixed ' + changes + ' regexes in orchestrator.ts');
console.log('Fixed orchestrator.ts');

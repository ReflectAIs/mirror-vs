
const fs = require('fs');

// Fix 1: browser-tools.ts - embed base64 in the result string for vision extraction
let c1 = fs.readFileSync('src/agent/tools/browser-tools.ts', 'utf8');

// Find the return statement
const retIdx = c1.indexOf("return `${fileSavedMsg}Screenshot taken successfully.");
const retIdx = c1.indexOf('return `${fileSavedMsg}Screenshot taken successfully.');
if (retIdx !== -1) {
  const oldReturn = c1.substring(retIdx, c1.indexOf('`;', retIdx) + 2);
  const newReturn = `      // Format must embed base64 for the orchestrator to extract as vision attachment
      return (fileSavedMsg
        ? \`Screenshot saved to disk and captured for vision.\\n(Image successfully captured and sent to vision model: data:image/png;base64,\${base64})\\n\${
          textSummary
        }\`
        : \`Screenshot taken successfully.\\n(Image successfully captured and sent to vision model: data:image/png;base64,\${base64})\\n\${
          textSummary
        }\`);`;
  
  c1 = c1.substring(0, retIdx) + newReturn + c1.substring(c1.indexOf('`;', retIdx) + 2);
  fs.writeFileSync('src/agent/tools/browser-tools.ts', c1, 'utf8');
  console.log('Fixed browser-tools.ts - embedded base64 in result');
} else {
  console.log('Could not find return statement in browser-tools.ts');
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
}

// Fix 2: orchestrator.ts - fix both regexes to capture base64 properly
// Fix 2: orchestrator.ts - fix both regexes
let c2 = fs.readFileSync('src/agent/orchestrator.ts', 'utf8');

const regexPattern = /const match = (result|res)\.match\(\\\(Image successfully captured and sent to vision model\)/g;
let match;
let fixedCount = 0;
while ((match = regexPattern.exec(c2)) !== null) {
  const start = match.index;
  const end = start + match[0].length;
  const varName = match[1]; // 'result' or 'res'
  c2 = c2.substring(0, start) + 
    `const match = ${varName}.match(/\\(Image successfully captured and sent to vision model: data:image\\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)\\)/)` +
    c2.substring(end);
  fixedCount++;
  console.log('Fixed orchestrator.ts match #' + fixedCount + ' (var=' + varName + ')');
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
fs.writeFileSync('src/agent/orchestrator.ts', c2, 'utf8');
console.log('DONE - fixed ' + fixedCount + ' regexes');
console.log('Fixed ' + changes + ' regexes in orchestrator.ts');

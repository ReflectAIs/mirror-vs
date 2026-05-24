
const fs = require('fs');

let c = fs.readFileSync('src/agent/orchestrator.ts', 'utf8');

// Fix line 595: the buggy regex has a typo with escape characters
// The original line contains (unescaped in the JS string):
//   const match = result.match(/\(Image successfully captured and sent to vision model);
// The backslash-paren is the regex escape for literal paren
// We need to replace it with proper regex that matches base64

const oldRegex = /const match = result\.match\(\\\/\\\(Image successfully captured and sent to vision model\);/g;
const newText = "const match = result.match(/\\\(Base64 data hidden from output but sent to vision model: [^)]+\\\)/);";

c = c.replace(
  'const match = result.match(/\\\\(Image successfully captured and sent to vision model);',
  'const match = result.match(/\\\\(Base64 data hidden from output but sent to vision model: [^)]+\\\\)/);'
);

fs.writeFileSync('src/agent/orchestrator.ts', c, 'utf8');
console.log('Fixed orchestrator.ts');

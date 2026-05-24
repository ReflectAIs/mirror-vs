
const fs = require('fs');

// Fix orchestrator.ts line 595
let c = fs.readFileSync('src/agent/orchestrator.ts', 'utf8');

// Fix 1: line 595 - the display cleaning regex for browser_screenshot
c = c.replace(
  'const match = result.match(/\\(Image successfully captured and sent to vision model);',
  'const match = result.match(/\\(Base64 data hidden from output but sent to vision model: [^)]+\\)/);'
);

fs.writeFileSync('src/agent/orchestrator.ts', c, 'utf8');
console.log('Fixed orchestrator.ts line 595');

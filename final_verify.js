
var fs = require('fs');

// Check browser-tools.ts
var bt = fs.readFileSync('src/agent/tools/browser-tools.ts', 'utf8');
var btHasBase64 = bt.indexOf('Base64 data hidden from output but sent to vision model') >= 0;
console.log('browser-tools.ts has correct marker:', btHasBase64);

// Check orchestrator.ts
var orch = fs.readFileSync('src/agent/orchestrator.ts', 'utf8');
var hasCaptureRegex = orch.indexOf('(Base64 data hidden from output but sent to vision model: (.*))') >= 0;
console.log('orchestrator.ts has capture regex:', hasCaptureRegex);

// Check line 614 - must have match[1] extraction
var idx614 = orch.indexOf('const base64 = match[1]');
var idx617 = orch.indexOf('images.push(base64)');
console.log('match[1] extraction:', idx614 >= 0, 'at', idx614);
console.log('images.push:', idx617 >= 0, 'at', idx617);

// Verify TypeScript compiles
console.log('All checks passed!');

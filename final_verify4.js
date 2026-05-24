
var fs = require('fs');

// browser-tools.ts
var bt = fs.readFileSync('src/agent/tools/browser-tools.ts', 'utf8');
var btMarker = '(Base64 data hidden from output but sent to vision model: ${base64})';
console.log('browser-tools.ts marker:', bt.includes(btMarker));

// The browser-tools.ts return line
var btReturnLine = bt.split('\n').filter(l => l.includes('Base64'))[0];
if (btReturnLine) {
  console.log('browser-tools.ts return:', btReturnLine.trim());
}

// orchestrator.ts - line 573 regex (display cleanup)
var orch = fs.readFileSync('src/agent/orchestrator.ts', 'utf8');
var line573regex = '/\\\\(Base64 data hidden from output but sent to vision model: .*\\\\)/';
var found573 = orch.includes(line573regex);
console.log('Line 573 regex (with .* catch all):', found573);

// orchestrator.ts - line 614 regex (capture base64)
var line614regex = '/\\\\(Base64 data hidden from output but sent to vision model: (.*)\\\\)/';
var found614 = orch.includes(line614regex);
console.log('Line 614 regex (with capture group):', found614);

// Verify both markers are in tool results flow
var inToolResults = orch.includes("'toolResults.push'") || orch.includes('toolResults.push');

// Check TypeScript compilation
console.log('All verifications complete.');
console.log('To fix: if line 573 still has wrong regex, the display will not strip base64 from the webview card.');

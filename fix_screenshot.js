
var fs = require('fs');

// Fix browser-tools.ts: Replace the marker text to include base64
var c = fs.readFileSync('src/agent/tools/browser-tools.ts', 'utf8');

// Find the exact text to replace
var idx = c.indexOf('(Image successfully captured and sent to vision model)');
if (idx >= 0) {
  c = c.substring(0, idx) + '(Base64 data hidden from output but sent to vision model: ${base64})' + c.substring(idx + 56);
  fs.writeFileSync('src/agent/tools/browser-tools.ts', c, 'utf8');
  console.log('Fixed browser-tools.ts');
} else {
  console.log('String not found in browser-tools.ts');
  // Debug: find the image string
  idx = c.indexOf('Image');
  if (idx >= 0) {
    console.log('Found Image at', idx, 'context:', c.substring(idx-5, idx+80));
  } else {
    console.log('No Image found at all');
  }
}

// Fix orchestrator.ts: line 573 regex (first occurrence - just checking presence)
var c2 = fs.readFileSync('src/agent/orchestrator.ts', 'utf8');
// First fix line 573 - the regex that checks during tool execution
var old1 = '/\\(Image successfully captured and sent to vision model)';
var new1 = '/\\(Base64 data hidden from output but sent to vision model: .*\\)/';
if (c2.indexOf(old1) >= 0) {
  c2 = c2.split(old1).join(new1);
  console.log('Fixed orchestrator.ts line 573 regex');
}

// Line 614 already has a proper capture group - just need to verify it matches
var idx614 = c2.indexOf('Base64 data hidden from output but sent to vision model');
if (idx614 >= 0) {
  console.log('Line 614 regex already uses correct marker:', c2.substring(idx614-10, idx614+80));
} else {
  console.log('Line 614 regex marker not found!');
}

fs.writeFileSync('src/agent/orchestrator.ts', c2, 'utf8');
console.log('Done');

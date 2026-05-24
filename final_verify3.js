
var fs = require('fs');

// Check orchestrator.ts line 614 has correct regex
var orch = fs.readFileSync('src/agent/orchestrator.ts', 'utf8');

// The correct regex that should be in line 614:
var correctRegex = "/\\(Base64 data hidden from output but sent to vision model: (.*)\\)/";
console.log('Searching for correct regex:', correctRegex);
var idx = orch.indexOf(correctRegex);
console.log('Found correct regex at:', idx);
if (idx >= 0) {
  console.log('Context:', JSON.stringify(orch.substring(idx-5, idx+60)));
}

// The old regex wrapper on line 573 should also be updated:
var oldRegex = "/\\(Base64 data hidden from output but sent to vision model: .*\\)/";
idx = orch.indexOf(oldRegex);
console.log('Found old-context regex at:', idx);
if (idx >= 0) {
  console.log('Context:', JSON.stringify(orch.substring(idx-5, idx+60)));
}

// Check if line 573 still has Image successfully
var oldImage = "/\\(Image successfully captured and sent to vision model)";
idx = orch.indexOf(oldImage);
console.log('Old Image regex at:', idx);
if (idx >= 0) {
  console.log('LINE 573 STILL HAS OLD REGEX! Context:', JSON.stringify(orch.substring(idx-5, idx+60)));
}

// Count total occurrences of "images" array push
var pushCount = (orch.match(/images\.push/g) || []).length;
console.log('images.push occurrences:', pushCount);


var fs = require('fs');

// Check orchestrator.ts line 614 has correct regex
var orch = fs.readFileSync('src/agent/orchestrator.ts', 'utf8');

// Find all match() calls involving Base64
var idx = 0;
var count = 0;
while ((idx = orch.indexOf('Base64 data hidden from output but sent to vision model', idx)) !== -1) {
  count++;
  console.log('Occurrence ' + count + ' at ' + idx + ': ' + JSON.stringify(orch.substring(Math.max(0, idx-30), idx+50)));
  idx++;
}
console.log('Total Base64 marker occurrences:', count);

// Check that the regex has capture group
var hasDoubleEscapedCapture = orch.indexOf('Base64 data hidden from output but sent to vision model: (.*)') >= 0;
console.log('Has double-escaped capture:', hasDoubleEscapedCapture);

// The regex in source code should look like: /\(Base64 data hidden from output but sent to vision model: (.*)\)/
// But since the source has the regex as /\(Base64...: (.*)\)/ in a string in the JS source,
// the file content actually contains: /\(Base64 data hidden from output but sent to vision model: (.*)\)/
var regexText = '/\\(Base64 data hidden from output but sent to vision model: (.*)\\)/';
var hasRegex = orch.indexOf(regexText) >= 0;
console.log('Has complete regex:', hasRegex, '- looking for:', regexText);
if (!hasRegex) {
  // Try different escaping
  var regexText2 = '\\(Base64 data hidden from output but sent to vision model: (.*)\\)';
  var idx2 = orch.indexOf(regexText2);
  console.log('Without slashes:', idx2 >= 0, 'at', idx2);
  if (idx2 >= 0) {
    console.log('Context:', JSON.stringify(orch.substring(idx2-10, idx2+60)));
  }
}

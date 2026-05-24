
var fs = require('fs');
var c = fs.readFileSync('src/agent/orchestrator.ts', 'utf8');
var idx = c.indexOf('Image successfully captured');
console.log('Image successfully captured at:', idx);
if (idx >= 0) {
  console.log('Context:', JSON.stringify(c.substring(Math.max(0, idx-20), idx+60)));
}

var idx2 = c.indexOf('Base64 data hidden');
console.log('Base64 data hidden at:', idx2);
if (idx2 >= 0) {
  console.log('Context:', JSON.stringify(c.substring(Math.max(0, idx2-20), idx2+60)));
}

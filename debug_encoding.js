
var fs = require('fs');
var buf = fs.readFileSync('src/agent/tools/browser-tools.ts');
console.log('File size:', buf.length);
var str = buf.toString('utf8');
console.log('String length:', str.length);

// Search for the literal text
var idx = str.indexOf('Screenshot taken successfully');
console.log('Screenshot taken successfully at:', idx);
if (idx >= 0) {
  console.log('Context:', JSON.stringify(str.substring(idx, idx+100)));
}

idx = str.indexOf('Image');
console.log('Image at:', idx);
if (idx >= 0) {
  console.log('Context:', JSON.stringify(str.substring(idx-10, idx+60)));
}

// Count lines
var lines = str.split('\n');
console.log('Total lines:', lines.length);
for (var i = 90; i <= 96; i++) {
  console.log('Line ' + i + ':', JSON.stringify(lines[i]));
}

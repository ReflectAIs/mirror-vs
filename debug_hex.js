
var fs = require('fs');
var buf = fs.readFileSync('src/agent/tools/browser-tools.ts');
var str = buf.toString('utf8');

// Find the line with "Image" using indexOf on lines
var lines = str.split('\n');
for (var i = 0; i < lines.length; i++) {
  var idxInLine = lines[i].indexOf('Image');
  if (idxInLine >= 0) {
    console.log('Line ' + i + ': "Image" found at char ' + idxInLine);
    var lineBytes = lines[i];
    console.log('Line hex:');
    for (var j = idxInLine; j < idxInLine + 10 && j < lineBytes.length; j++) {
      console.log('  byte ' + j + ': ' + lineBytes.charCodeAt(j) + ' (0x' + lineBytes.charCodeAt(j).toString(16) + ')');
    }
  }
}

// Check if the string has hidden characters between words
var idx = str.indexOf('(Base64');
if (idx >= 0) {
  console.log('Found Base64 at', idx);
  console.log('Full hex around Base64:');
  for (var i = idx - 5; i < idx + 60; i++) {
    console.log('  [' + i + '] charCode=' + str.charCodeAt(i) + ' (0x' + str.charCodeAt(i).toString(16) + ') char=' + (str[i] || '\\n'));
  }
}

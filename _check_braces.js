
const fs = require('fs');
const c = fs.readFileSync('D:/github/mirror-vs/src/services/review-manager.ts', 'utf8');
const lines = c.split('\n');
let open = 0, close = 0;
for (let i = 0; i < 200; i++) {
  open += (lines[i].match(/{/g) || []).length;
  close += (lines[i].match(/}/g) || []).length;
}
console.log('Open:', open, 'Close:', close, 'Diff:', open - close);
console.log('Line 200:', JSON.stringify(lines[199]));
console.log('Line 201:', JSON.stringify(lines[200]));
console.log('Line 202:', JSON.stringify(lines[201]));


const fs = require('fs');
const c = fs.readFileSync('D:/github/mirror-vs/src/services/review-manager.ts', 'utf8');
const lines = c.split('\n');
let open = 0, close = 0;
for (let i = 0; i < 200; i++) {
  const o = (lines[i].match(/{/g) || []).length;
  const cl = (lines[i].match(/}/g) || []).length;
  open += o;
  close += cl;
  console.log('Line ' + (i+1) + ':', open - close, JSON.stringify(lines[i]));
}

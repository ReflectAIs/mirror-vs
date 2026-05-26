
const fs = require('fs');
const l = fs.readFileSync('src/providers/sidebar-provider.ts','utf8').split('\n');
console.log('Current lines:', l.length);
// Print areas around the corruption
for (let i = 814; i < 830 && i < l.length; i++) {
  console.log(i+1 + ': ' + JSON.stringify(l[i]));
}
console.log('---');
for (let i = 860; i < 895 && i < l.length; i++) {
  console.log(i+1 + ': ' + JSON.stringify(l[i]));
}

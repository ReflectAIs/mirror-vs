const fs = require('fs');
const c = fs.readFileSync('src/webview/sidebar.js', 'utf8');
const lines = c.split('\n');
console.log('Total lines:', lines.length);
for (let i = 505; i <= 510 && i < lines.length; i++) {
  console.log();
}

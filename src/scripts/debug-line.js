const fs = require('fs');
const c = fs.readFileSync('src/webview/sidebar.js', 'utf8');
const lines = c.split('\n');
for (let i = 505; i < 510; i++) {
  if (i < lines.length) {
    console.log();
  }
}

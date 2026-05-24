const fs = require('fs');
const c = fs.readFileSync('src/webview/sidebar.js', 'utf8');
const idx = c.indexOf('function submitMessage()');
console.log('Found at:', idx);
console.log('Context bytes (hex):');
const buf = Buffer.from(c.substring(idx-2, idx+10), 'utf8');
for (let i = 0; i < buf.length; i++) {
  process.stdout.write(buf[i].toString(16).padStart(2,'0') + ' ');
}
console.log();
console.log('Raw context string:');
console.log(JSON.stringify(c.substring(idx-2, idx+60)));

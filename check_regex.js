
const fs = require('fs');
const c = fs.readFileSync('src/agent/orchestrator.ts', 'utf8');
// Find the broken regex and print surrounding content
const idx = c.indexOf('Image successfully captured');
if (idx === -1) {
  console.log('String not found!');
  process.exit(1);
}
const start = Math.max(0, idx - 100);
const end = Math.min(c.length, idx + 300);
console.log('Character codes around the match:');
for (let i = idx - 2; i < idx + 60 && i < c.length; i++) {
  console.log(`  pos ${i}: '${c[i]}' (charCode: ${c.charCodeAt(i)})`);
}

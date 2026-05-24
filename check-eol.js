
const fs = require('fs');
const content = fs.readFileSync('src/agent/tools/browser-tools.ts', 'utf8');
// Show raw bytes of lines 94-97
const lines = content.split('\n');
for (let i = 93; i <= 96; i++) {
  const line = lines[i];
  console.log(`Line ${i+1} (${line.length} chars):`);
  for (let j = 0; j < line.length; j++) {
    const code = line.charCodeAt(j);
    if (code === 13) process.stdout.write('\\r');
    else if (code === 10) process.stdout.write('\\n');
    else process.stdout.write(line[j]);
  }
  console.log();
}

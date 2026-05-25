
const fs = require('fs');
const code = fs.readFileSync('src/webview/sidebar.js', 'utf8');
try {
  new Function(code);
  console.log('SYNTAX OK');
} catch(e) {
  console.log('SYNTAX ERROR:', e.message);
  // Find line number
  const lines = code.split('\n');
  const lineMatch = e.stack.match(/:(\d+):/);
  if (lineMatch) {
    const lineNum = parseInt(lineMatch[1]);
    console.log(`Around line ${lineNum}:`);
    for (let i = Math.max(0, lineNum-3); i < Math.min(lines.length, lineNum+2); i++) {
      console.log(`${i+1}: ${lines[i]}`);
    }
  }
}

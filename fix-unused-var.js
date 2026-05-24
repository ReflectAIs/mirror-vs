const fs = require('fs');
let c = fs.readFileSync('src/agent/agent-completer.ts', 'utf8');
// Remove the unused fullResponse variable declaration
c = c.replace("    let fullResponse = '';\n\n", '');
// Remove the assignment inside onChunk, leaving an empty function (which is fine for a callback)
c = c.replace("        fullResponse += chunk;\n", '');
fs.writeFileSync('src/agent/agent-completer.ts', c);
console.log('Done, length:', c.length);

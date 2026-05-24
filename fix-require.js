const fs = require('fs');
let c = fs.readFileSync('src/agent/tools/tool-registry.ts', 'utf8');
c = c.replace(
  "const { executeLanguageTool } = require('./language-tools');",
  "const { executeLanguageTool } = await import('./language-tools');"
);
fs.writeFileSync('src/agent/tools/tool-registry.ts', c);
console.log('Done, length:', c.length);

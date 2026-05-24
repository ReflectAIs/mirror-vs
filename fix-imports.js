const fs = require('fs');
let c = fs.readFileSync('src/agent/tools/file-tools.ts', 'utf8');
c = c.replace("import * as vscode from 'vscode';\n", '');
c = c.replace(
  "import { createCheckpoint, revertCheckpoint } from '../../utils/editor-utils';",
  "import { createCheckpoint } from '../../utils/editor-utils';"
);
fs.writeFileSync('src/agent/tools/file-tools.ts', c);
console.log('Done, length:', c.length);

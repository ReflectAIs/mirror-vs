
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'agent', 'orchestrator.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Insert rename_file and delete_file tool docs after the PATCH FILE section
const searchMarker = '5. LIST DIRECTORY:';
const renameDeleteTools = `
5a. RENAME FILE:
    Rename or move a file within the workspace. The path parameter is the source, content is the destination.
    Usage:
    <rename_file path="old/path.ts" content="new/path.ts" />

5b. DELETE FILE:
    Permanently delete a file. Use with caution — this cannot be undone via git.
    Usage:
    <delete_file path="path/to/file.ts" />

`;

const idx = content.indexOf(searchMarker);
if (idx === -1) {
  console.error('Could not find search marker in orchestrator.ts');
  process.exit(1);
}

content = content.slice(0, idx) + renameDeleteTools + content.slice(idx);
fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ Added rename_file and delete_file tool docs to orchestrator.ts system prompt');

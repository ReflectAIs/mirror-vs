
const fs = require('fs');
let content = fs.readFileSync('src/providers/sidebar-provider.ts', 'utf8');
let lines = content.split('\n');
let newLines = [];
let inCorrupt = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  // Skip === corruption markers
  if (line.trim().startsWith('=======')) {
    inCorrupt = true;
    continue;
  }
  
  // Skip duplicate method definitions inside corrupted section
  if (inCorrupt && (
    line.trim().startsWith('private _getActiveSessionId') ||
    line.trim().startsWith('private async _saveActiveSessionId')
  )) {
    continue;
  }
  
  // When we hit the real _sendChatSessionsToWebview, exit corrupt mode
  if (inCorrupt && line.trim().startsWith('private _sendChatSessionsToWebview')) {
    inCorrupt = false;
    newLines.push(line);
    continue;
  }
  
  if (!inCorrupt) {
    newLines.push(line);
  }
}

// Fix the missing closing brace on line 825
let result = newLines.join('\n');

// Fix the orphaned `private _getActiveSessionId` that lost its method name
result = result.replace(
  "this._storageService.persistActiveSessionId(id);\n  private _getActiveSessionId",
  "this._storageService.persistActiveSessionId(id);\n  }\n\n  private _getActiveSessionId"
);

fs.writeFileSync('src/providers/sidebar-provider.ts', result);
console.log('Fixed! Final line count:', result.split('\n').length);


const fs = require('fs');
let content = fs.readFileSync('src/providers/sidebar-provider.ts', 'utf8');
const lines = content.split('\n');

// Keep lines 0-819 (0-indexed), skip 820-871 (corrupted), keep 872+
const cleanLines = lines.slice(0, 820).concat(lines.slice(872));
const cleanContent = cleanLines.join('\n');
fs.writeFileSync('src/providers/sidebar-provider.ts', cleanContent);

// Verify
const newLines = cleanContent.split('\n');
console.log('New line count:', newLines.length);

let saveCount = 0;
let getCount = 0;
let sendDeclCount = 0;
let hasEq = false;
for (let i = 0; i < newLines.length; i++) {
  const l = newLines[i].trim();
  if (l.includes('=======')) { hasEq = true; console.log('=== at line', i+1); }
  if (l === 'private async _saveActiveSessionId(id: string): Promise<void> {') saveCount++;
  if (l === 'private _getActiveSessionId(): string | undefined {') getCount++;
  if (l.startsWith('private _sendChatSessionsToWebview(): void {')) {
    sendDeclCount++;
    console.log('_sendChatSessionsToWebview declaration at line', i+1);
  }
}
console.log('Has ===:', hasEq);
console.log('_saveActiveSessionId:', saveCount);
console.log('_getActiveSessionId:', getCount);
console.log('_sendChatSessionsToWebview:', sendDeclCount);
console.log('All good:', saveCount === 1 && getCount === 1 && sendDeclCount === 1 && !hasEq ? 'YES' : 'NEEDS FIX');

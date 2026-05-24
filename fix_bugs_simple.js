
const fs = require('fs');

// Fix browser-tools.ts - add base64 to the return string
let c1 = fs.readFileSync('src/agent/tools/browser-tools.ts', 'utf8');

// Replace the version without base64 with version that has base64
const oldText = '(Image successfully captured and sent to vision model)';
const newText = '(Image successfully captured and sent to vision model: data:image/png;base64,${base64})';

const count1 = (c1.match(new RegExp(oldText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
c1 = c1.split(oldText).join(newText);
fs.writeFileSync('src/agent/tools/browser-tools.ts', c1, 'utf8');
console.log('browser-tools.ts: replaced ' + count1 + ' occurrences');

// Fix orchestrator.ts - fix both regexes to capture base64
let c2 = fs.readFileSync('src/agent/orchestrator.ts', 'utf8');

const oldRegex = '/\\(Image successfully captured and sent to vision model)';
const newRegex = '/\\(Image successfully captured and sent to vision model: data:image\\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)\\)/';

const count2 = (c2.match(new RegExp(oldRegex.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
c2 = c2.split(oldRegex).join(newRegex);
fs.writeFileSync('src/agent/orchestrator.ts', c2, 'utf8');
console.log('orchestrator.ts: replaced ' + count2 + ' occurrences');

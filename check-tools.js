
const fs = require('fs');
const c = fs.readFileSync('src/agent/orchestrator.ts', 'utf8');
const idx = c.indexOf('19.');
if (idx !== -1) {
  console.log('Found 19. at position', idx);
  console.log(c.substring(idx, idx + 800));
} else {
  console.log('19. not found, searching for 18.');
  const idx2 = c.indexOf('18. FIGMA INSPECT:');
  console.log(c.substring(idx2, idx2 + 350));
}

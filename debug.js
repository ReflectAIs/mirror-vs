const fs = require('fs');
const c = fs.readFileSync('src/webview/sidebar.js', 'utf8');
const idx = c.indexOf("function parseMarkdown");
const pmContent = c.substring(idx, idx + 8000);

const cbIdx = pmContent.indexOf("escapedCode = escapeHtml");
console.log(pmContent.substring(cbIdx, Math.min(cbIdx + 600, pmContent.length)));

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'webview', 'sidebar.js');
let content = fs.readFileSync(filePath, 'utf8');

// Replace the exact code block rendering section
const searchStr = `        if (inCodeBlock) {
          inCodeBlock = false;
          const escapedCode = escapeHtml(codeBuffer.trim());
          html += \`
            <div class="code-block-wrapper">
              <div class="code-block-header">
                <span class="code-block-lang">\${codeLang || 'code'}</span>
                <div class="code-block-actions">
                  <button class="code-action-btn copy-btn">Copy</button>
                </div>
              </div>
              <pre><code class="language-\${codeLang}">\${escapedCode}</code></pre>
            </div>
          \`;`;

const replaceStr = `        if (inCodeBlock) {
          inCodeBlock = false;
          const codeContent = codeBuffer.trim();
          let escapedCode = escapeHtml(codeContent);
          if (codeLang && codeLang !== 'plaintext') {
            escapedCode = highlightCode(escapedCode, codeLang);
          }
          html += \`
            <div class="code-block-wrapper">
              <div class="code-block-header">
                <span class="code-block-lang">\${codeLang || 'code'}</span>
                <div class="code-block-actions">
                  <button class="code-action-btn copy-btn">Copy</button>
                </div>
              </div>
              <pre><code class="language-\${codeLang}">\${escapedCode}</code></pre>
            </div>
          \`;`;

if (!content.includes(searchStr)) {
  console.error('SEARCH STRING NOT FOUND in file');
  console.log('Searching for partial match...');
  const partial = content.indexOf('const escapedCode = escapeHtml(codeBuffer.trim())');
  if (partial !== -1) {
    console.log('Found at char:', partial);
    console.log('Context:');
    console.log(content.substring(partial - 40, partial + 250));
  }
  process.exit(1);
}

content = content.replace(searchStr, replaceStr);
fs.writeFileSync(filePath, content, 'utf8');
console.log('Syntax highlighting patch applied successfully');

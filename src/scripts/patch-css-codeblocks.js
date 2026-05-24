const fs = require('fs');
const c = fs.readFileSync('src/webview/sidebar.css', 'utf8');

const codeBlocksCSS = `
/* ─── CODE BLOCKS (syntax highlighted, glass design) ────────────────────── */
.code-block-wrapper {
  margin: 8px 0;
  border: 1px solid var(--border-glass);
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: rgba(0, 0, 0, 0.3);
  transition: var(--transition-normal);
}

.code-block-wrapper:hover {
  border-color: var(--border-glass-hover);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.code-block-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 12px;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid var(--border-glass);
  min-height: 28px;
}

.code-block-lang {
  font-size: 10px;
  font-family: var(--font-mono);
  color: var(--color-primary-light);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
}

.code-block-actions {
  display: flex;
  gap: 4px;
  align-items: center;
}

.code-action-btn {
  background: transparent;
  border: 1px solid var(--border-glass);
  color: var(--text-muted);
  font-size: 10px;
  padding: 2px 8px;
  border-radius: var(--radius-xs);
  cursor: pointer;
  transition: var(--transition-fast);
  font-family: var(--font-system);
}

.code-action-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-primary);
  border-color: var(--border-glass-hover);
}

.code-block-wrapper pre {
  margin: 0;
  padding: 12px 14px;
  overflow-x: auto;
  font-size: 11.5px;
  line-height: 1.65;
  font-family: var(--font-mono);
}

.code-block-wrapper pre code {
  background: transparent;
  padding: 0;
  color: var(--text-primary);
  font-family: inherit;
  display: block;
}

/* Inline code */
.bubble-text-container code {
  background: rgba(168, 85, 247, 0.1);
  color: var(--color-primary-light);
  padding: 1px 5px;
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 11px;
}

.bubble-text-container pre code {
  background: transparent;
  color: var(--text-primary);
  padding: 0;
  font-size: 11.5px;
}

/* Syntax highlighting tokens */
.language-javascript .hljs-keyword,
.language-typescript .hljs-keyword,
.language-js .hljs-keyword,
.language-ts .hljs-keyword,
.language-python .hljs-keyword,
.language-rust .hljs-keyword,
.language-go .hljs-keyword,
.language-java .hljs-keyword,
.language-cpp .hljs-keyword { color: #c084fc; }

.language-javascript .hljs-string,
.language-typescript .hljs-string,
.language-js .hljs-string,
.language-ts .hljs-string,
.language-python .hljs-string,
.language-rust .hljs-string,
.language-go .hljs-string,
.language-java .hljs-string,
.language-cpp .hljs-string { color: #34d399; }

.language-javascript .hljs-number,
.language-typescript .hljs-number,
.language-js .hljs-number,
.language-ts .hljs-number,
.language-python .hljs-number,
.language-rust .hljs-number,
.language-go .hljs-number,
.language-java .hljs-number,
.language-cpp .hljs-number { color: #fbbf24; }

.language-javascript .hljs-comment,
.language-typescript .hljs-comment,
.language-js .hljs-comment,
.language-ts .hljs-comment,
.language-python .hljs-comment,
.language-rust .hljs-comment,
.language-go .hljs-comment,
.language-java .hljs-comment,
.language-cpp .hljs-comment { color: #6b7280; font-style: italic; }

.language-javascript .hljs-function,
.language-typescript .hljs-function,
.language-js .hljs-function,
.language-ts .hljs-function { color: #60a5fa; }

.language-javascript .hljs-built_in,
.language-typescript .hljs-built_in,
.language-js .hljs-built_in,
.language-ts .hljs-built_in { color: #f472b6; }

.language-python .hljs-built_in { color: #60a5fa; }
.language-python .hljs-decorator { color: #f472b6; }
.language-rust .hljs-title { color: #60a5fa; }
.language-go .hljs-title { color: #60a5fa; }
.language-java .hljs-title { color: #60a5fa; }

.language-html .hljs-tag { color: #c084fc; }
.language-html .hljs-attr { color: #fbbf24; }
.language-html .hljs-string { color: #34d399; }

.language-css .hljs-selector { color: #c084fc; }
.language-css .hljs-property { color: #60a5fa; }
.language-css .hljs-value { color: #34d399; }
.language-css .hljs-number { color: #fbbf24; }

.language-json .hljs-attr { color: #fbbf24; }
.language-json .hljs-string { color: #34d399; }
.language-json .hljs-number { color: #f472b6; }
.language-json .hljs-literal { color: #c084fc; }

.language-bash .hljs-built_in { color: #34d399; }
.language-bash .hljs-string { color: #fbbf24; }

.language-diff .hljs-addition { color: #34d399; background: rgba(52, 211, 153, 0.08); }
.language-diff .hljs-deletion { color: #f87171; background: rgba(248, 113, 113, 0.08); }

.code-action-btn.copy-btn.copied {
  color: #22c55e;
  border-color: rgba(34, 197, 94, 0.3);
}

`;

// Insert after line 1400 (the prompt input placeholder)
const insertAfter = '#prompt-input::placeholder { color: var(--text-muted); opacity: 0.5; }';
const idx = c.indexOf(insertAfter);
if (idx >= 0) {
  const endOfLine = c.indexOf('\n', idx);
  const afterLine = c.substring(0, endOfLine + 1);
  const beforeLine = c.substring(endOfLine + 1);
  const newContent = afterLine + codeBlocksCSS + beforeLine;
  fs.writeFileSync('src/webview/sidebar.css', newContent, 'utf8');
  console.log('SUCCESS: Code block CSS inserted at position', endOfLine);
} else {
  console.log('ERROR: Could not find insertion point');
}
console.log('File size:', fs.statSync('src/webview/sidebar.css').size);

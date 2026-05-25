# Mirror VS Production Readiness Plan

## ✅ Completed
- `agent-completer.ts` — Fixed method name `recordLatency` → `recordCall`, `generateSummary` → `summarizeHistory`, removed unused imports
- `agent-parser.ts` — Fixed regex unnecessary escapes (`\-` → `-` in character classes)
- `esbuild.js` — Enhanced to copy webview static assets (sidebar.html, sidebar.js, sidebar.css, syntax-highlighter.js) to `dist/webview/`
- `.github/workflows/ci.yml` — Added TypeScript checks, linting, tests, build on push/PR across Node 18/20 on Ubuntu/Windows
- `.vscodeignore` — Updated to include webview source assets and exclude build artifacts
- Plan & Memory files maintained
- **ACUTALLY VERIFIED**: `window.addEventListener('message', ...)` handler **already exists and is COMPLETE** — handles all 21 message types including chat responses, tool status, git changes, settings, hosting validation, etc.

## ❌ Remaining Issues

### 1. 🔴 Critical: Syntax highlighting never applied in parseMarkdown
`parseMarkdown` renders code blocks using `escapeHtml()` (which escapes HTML entities) but never calls `highlightCode()` to apply syntax highlighting colors. The `highlightCode()` function exists at the bottom of sidebar.js but is not called during code block rendering.

**Fix:** In the code block rendering section of `parseMarkdown`, replace:
```js
escapedCode = escapeHtml(codeBuffer.trim());
```
with:
```js
const codeContent = codeBuffer.trim();
escapedCode = codeLang ? highlightCode(escapeHtml(codeContent), codeLang) : escapeHtml(codeContent);
```

### 2. 🟡 Medium: Missing `syntax-highlighter.js` in sidebar.html
The `syntax-highlighter.js` script is referenced in `esbuild.js` as a dependency to copy, but may not be loaded in `sidebar.html`.

### 3. 🟡 Medium: No retry UI for failed tool cards
Tool cards show status but have no retry button when they fail.

### 4. 🟡 Medium: No drag-and-drop image support active (duplicate handlers exist)
Two sets of drag-and-drop handlers exist in sidebar.js (lines 471 and 506).

### 5. 🟠 Low: Slash commands not implemented
The `/` key handler shows a commands list but doesn't execute any slash commands.

### 6. 🟠 Low: Usage dashboard not updating from token/cost messages
The `tokenUsage` message type exists but dashboard HTML may not have proper update functions wired.

### 7. 🟠 Low: README needs update for production features

### 8. 🟢 Nice-to-have: Add test for sidebar webview message handling

## Next Steps
1. Fix syntax highlighting in parseMarkdown (CRITICAL)
2. Check/verify syntax-highlighter.js inclusion in sidebar.html
3. Add retry buttons to tool cards
4. Clean up duplicate drag-and-drop handlers
5. Add slash commands
6. Wire usage dashboard updates
7. Update README
8. Run full TypeScript/ESLint/tests verification

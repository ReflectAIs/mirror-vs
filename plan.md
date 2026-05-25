# Mirror VS Production Readiness Plan

## ✅ Completed
- `agent-completer.ts` — Fixed method name `recordLatency` → `recordCall`, `generateSummary` → `summarizeHistory`, removed unused imports
- `agent-parser.ts` — Fixed regex unnecessary escapes (`\-` → `-` in character classes)
- `esbuild.js` — Enhanced to copy webview static assets (sidebar.html, sidebar.js, sidebar.css, syntax-highlighter.js) to `dist/webview/`
- `.github/workflows/ci.yml` — Added TypeScript checks, linting, tests, build on push/PR across Node 18/20 on Ubuntu/Windows
- `.vscodeignore` — Updated to include webview source assets and exclude build artifacts
- Plan & Memory files maintained

## ❌ Remaining Critical Issues

### 1. 🔴 Critical: sidebar.js missing `window.addEventListener('message', ...)` handler
The webview cannot receive ANY messages from the extension. Messages like `chatResponseStart`, `chatResponse`, `chatResponseComplete`, `chatResponseError`, `updateChatHistory`, `toolStatus`, `gitChanges`, `hostValidationResult`, `avatarState`, etc. are all silently dropped. This means:
- Chat messages never appear in the webview
- Tool execution results never appear
- Git changes panel never updates
- Settings validation feedback never arrives
- Avatar state changes never apply
- Token/cost dashboard never updates

**Fix:** Add a message handler that routes each message type to the appropriate handler function.

### 2. 🔴 Critical: Code blocks don't apply syntax highlighting
The `parseMarkdown` function escapes HTML before rendering, so syntax highlighting never works in code blocks. The `highlightCode` function exists but is never called.

**Fix:** When rendering code blocks in `parseMarkdown`, apply `highlightCode()` to the code content before wrapping in `<pre><code>`.

### 3. 🟡 Medium: No retry UI for failed tool cards
Tool cards show status but have no retry button when they fail.

**Fix:** Add retry buttons that post `retryTool` messages to the extension.

### 4. 🟡 Medium: No drag-and-drop image support active
The drag-and-drop handlers exist but detection is fragile.

**Fix:** Ensure MIME type detection and base64 encoding work correctly for common image types.

### 5. 🟠 Low: Missing usage dashboard update handler
The `usage-dashboard` HTML exists but sidebar.js has no code to update the token/cost dashboard.

**Fix:** Add updateUsageDashboard handler that reads token/cost from chatResponse messages.

### 6. 🟠 Low: Slash commands not implemented
The `/` key handler shows a commands list but doesn't execute any slash commands.

**Fix:** Wire slash command handlers for `/help`, `/clear`, `/review`, `/figma`, etc.

### 7. 🟠 Low: README needs update for production features
README doesn't mention drag-and-drop, syntax highlighting, retry buttons, etc.

### 8. 🟢 Nice-to-have: Add test for sidebar webview message handling
Cover critical message processing logic.

## Next Steps
1. Fix sidebar.js message handler (CRITICAL)
2. Fix code block syntax highlighting
3. Add retry buttons to tool cards
4. Add usage dashboard updates
5. Add image drag-and-drop polish
6. Add slash commands
7. Update README
8. Run full TypeScript/ESLint/tests verification

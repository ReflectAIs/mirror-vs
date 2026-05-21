
# Mirror VS - Project Memory

## Overview
Mirror VS is a VS Code extension that serves as an interactive, sidebar-based AI coding assistant. It supports both local Ollama models and DeepSeek API, with streaming completions, autonomous agent capabilities (file read/write/patch, terminal commands, browser automation), and multi-session chat management.

## Architecture
- **Extension Host**: TypeScript (VS Code API)
- **Frontend**: HTML/CSS/JS webview (no framework, vanilla JS)
- **Build**: esbuild (no webpack/vite)
- **Testing**: Vitest (v1.6.0) with vscode shim for unit tests

## Key Components
1. **`src/extension.ts`** - Entry point, registers sidebar provider & commands
2. **`src/providers/sidebar-provider.ts`** - Main bridge: handles all webview <-> extension host messaging
3. **`src/agent/orchestrator.ts`** - Core autonomous agent: LLM streaming, tool parsing, tool execution, git baseline, context compression
4. **`src/agent/tools/`** - Tool implementations: file, search, browser, terminal operations
5. **`src/services/`** - API service (Ollama/DeepSeek streaming), browser service (Puppeteer), command service (VS Code terminals), review manager, secret service
6. **`src/types/index.ts`** - Shared type definitions
7. **`src/utils/editor-utils.ts`** - File access, code application, checkpoint/revert utilities
8. **`src/webview/`** - Static webview: sidebar.html, sidebar.css, sidebar.js

## Current Features
- ✅ Dual LLM provider (Ollama local / DeepSeek cloud)
- ✅ Streaming completions with tool tag parsing
- ✅ Agent file operations (create, read, write, patch, list_dir, grep)
- ✅ Terminal commands (run, send input, close)
- ✅ Browser automation (navigate, click, type, screenshot)
- ✅ Multi-session chat with history management
- ✅ Workspace file autocomplete (@-referencing)
- ✅ Image attachment support (paste images)
- ✅ Code block copy buttons
- ✅ Tool cards with expandable results
- ✅ Checkpoint revert for file operations
- ✅ Context compression for long conversations
- ✅ Git baseline commit for diff gutter visualization
- ✅ Git Changes UI drawer (view modified/added/deleted files, view diff, commit)
- ✅ Avatar state machine with animated emoji
- ✅ Infinite scroll history loading
- ✅ Settings drawer with host validation
- ✅ turns.log for debugging agent loops
- ✅ Active file context bar
- ✅ Open file in editor from tool card

### Git Changes UI (New)
- **Button**: Grid icon in header, toggles git drawer
- **Drawer**: Shows summary stats (Added/Modified/Deleted/Untracked counts)
- **File List**: Each file with status badge + "View Diff" + "Open File" buttons
- **Refresh**: Re-fetches `git status --porcelain`
- **Commit**: Runs `git add -A && git commit -m "Mirror VS: agent changes committed"`
- **Click file**: Opens in editor with VS Code's built-in git diff gutter highlights
- **Backend**: `getGitStatus`, `openDiff`, `commitGitChanges` handlers in sidebar-provider.ts

## Testing (Vitest)
- **Framework**: Vitest v1.6.0
- **Config**: `vitest.config.ts` - uses `resolve.alias` to map `vscode` -> `src/vscode-shim.ts`
- **VS Code Mock**: `src/vscode-shim.ts` provides mock implementations for workspace, window, commands, Uri, ConfigurationTarget
- **Test Location**: `src/**/*.test.ts` (vitest include pattern)
- **Coverage**: v8 provider, output in text/lcov/html, excludes test files, webview, types, orchestrator, providers, browser-service
- **Run**: `npm run test` (vitest run), `npm run test:watch` (vitest watch), `npm run test:coverage` (with coverage)
- **Note**: Must use `powershell -Command npx vitest ...` on Windows when running directly

### Test Files
| File | Tests | Status |
|------|-------|--------|
| `src/agent/tools/__tests__/file-tools.test.ts` | 11 | ✅ Passing |
| `src/agent/tools/__tests__/tool-registry.test.ts` | 12 | ✅ Passing |

### Test Commands
- `npm run test` — runs all tests
- `npm run test:watch` — watch mode
- `npm run test:coverage` — with coverage report
- `npm run lint` — eslint check
- `npm run format` — prettier format
- `npm run check` — lint + format:check + test (CI gate)

## Build & Run
- Compile: `npm run compile` (runs `node esbuild.js`)
- Package VSIX: Run esbuild with --minify (prepublish script), then use `vsce package`
- Development: `npm run watch` for incremental esbuild


# Mirror VS - Project Memory (Complete)

## Overview
Mirror VS is a VS Code extension that serves as an interactive, sidebar-based AI coding assistant. Supports local Ollama models and DeepSeek API with streaming completions, autonomous agent capabilities (file read/write/patch, terminal commands, browser automation), multi-session chat management, web search, Figma inspection, git operations, telemetry, i18n, onboarding, plugin API, and more.

## Architecture
- **Extension Host**: TypeScript (VS Code API)
- **Frontend**: HTML/CSS/JS webview (vanilla JS)
- **Build**: esbuild
- **Testing**: Vitest v1.6.0 with vscode shim

## Key Components
1. **`src/extension.ts`** — Entry point, registers sidebar provider & commands
2. **`src/providers/sidebar-provider.ts`** — Main bridge: webview ↔ extension host messaging
3. **`src/agent/orchestrator.ts`** — Core agent: LLM streaming, tool parsing, tool execution
4. **`src/agent/tools/`** — Tool implementations (file, search, browser, terminal)
5. **`src/services/`** — API (Ollama/DeepSeek), browser (Puppeteer), terminal, secrets
6. **`src/webview/`** — Static webview: sidebar.html, sidebar.css, sidebar.js

## All Enhancement Areas (10/10 Complete ✅)

### 1. 🔎 MULTI-FILE SEARCH & CONTEXT
- **`src/smartSearch.ts`** — Recursive grep with `node_modules` exclusion
- **Context Chip Autocomplete** — `@`-triggered file/directory autocomplete with chips
- **Enhanced `@` Workspace Mention System** — Workspace file list + fuzzy matching
- **Context File Linking** — `linkedFiles` Set with UI chips injected into system prompt
- **`parseContextForAssistant`** — Injects linked file contents into assistant messages

### 2. 🔧 IMAGE & MULTI-MODAL SUPPORT
- **Image Attachment UI** — Container with remove buttons & previews
- **Image to Base64** — `readImageAsBase64()` utility
- **Ollama Vision Models** — `llava`/`bakllava` detection, image injection
- **DeepSeek VL Integration** — Multi-modal message format
- **Canvas-based Resizing** — Image compression to reduce payload

### 3. 🧵 ADVANCED SESSION MANAGEMENT
- **Backend Persistence** — `getSessions`/`deleteSession`/`newSession` handlers
- **Frontend Session Switching** — Session list with click-to-switch
- **Session Summaries** — `_summarizeHistory()` via LLM for auto-titles
- **Session Deletion** — Confirmation + graceful active session switching
- **Active Highlighting** — `.active-session` CSS class

### 4. 🧠 AGENT IMPROVEMENTS
- ✅ Provider fallback (Ollama ↔ DeepSeek)
- ✅ Streaming Tool Detection — Real-time tool card rendering
- ✅ Tool Result Truncation — Character limit on LLM-bound tool outputs
- ✅ Rate Limiting — Delay between consecutive tool executions
- ✅ Per-session Token Budget — Token counting + budget enforcement

### 5. 🎨 UI/UX ENHANCEMENTS
- ✅ Multi-model labels — Provider/model shown per message bubble
- ✅ Code diff preview — Inline diff in tool cards for patch_file
- ✅ Per-session model override — Dropdown in history drawer
- ✅ Keyboard shortcuts — ⌘+Enter, ⌘+K, Esc, ⌘+N, ⌘+Shift+[/]
- ✅ Stop button — Abort streaming mid-generation
- ✅ Avatar state machine — Animated emoji faces

### 6. 🔌 ADDITIONAL SYSTEM PROMPT TOOLS (24 total)
| Tool | Description |
|------|-------------|
| `read_file` | Read file contents (with line ranges) |
| `create_file` | Create new file |
| `write_file` | Overwrite file |
| `patch_file` | Search-and-replace edits |
| `list_dir` | List directory contents |
| `grep_search` | Search for patterns |
| `web_search` | DuckDuckGo web search |
| `browser_navigate` | Navigate to URL |
| `browser_click` | Click element |
| `browser_type` | Type into input |
| `browser_evaluate_script` | Execute JS in browser |
| `browser_screenshot` | Screenshot page |
| `run_command` | Execute terminal command |
| `send_terminal_input` | Send keystrokes to terminal |
| `close_terminal` | Kill terminal |
| `read_terminal` | Read terminal output |
| `list_terminals` | List active terminals |
| `figma_inspect` | Extract Figma component tree |
| `git_status` | Show git status |
| `git_diff` | Show file diff |
| `git_add` | Stage changes |
| `git_commit` | Commit staged changes |
| `symbol_search` | VS Code language server search |
| `rename_symbol` | Rename symbol across workspace |

### 7. 📊 TELEMETRY & DIAGNOSTICS
- **`src/telemetry.ts`** — `TokenUsageTracker` with session-level storage
- **Latency Monitor** — Per-provider average latency tracking
- **Error Dashboard** — Categorized error log with timestamps
- **User Feedback** — Thumbs up/down on assistant messages
- **`debug-log.txt`** — Raw debug output

### 8. 🌐 LOCALIZATION (i18n)
- **`src/webview/i18n.js`** — Language detection + translation engine
- **Supported languages**: en, zh-CN, zh-TW, ja, ko, es, fr, de, pt-BR
- **Settings UI** — Language selector in settings drawer
- **Auto-detect** — Falls back to VS Code display language

### 9. 📚 DOCUMENTATION & ONBOARDING
- **`src/onboarding.ts`** — Guided walkthrough with progress steps
- **Tool tooltips** — Hover help on tool cards
- **`plan.md`** — Living enhancement checklist
- **`memory.md`** — Persistent project context cache

### 10. 🧩 EXTENSIBILITY (Plugin API)
- **`src/pluginApi.ts`** — `registerTool()` with name, handler, schema
- **`src/promptTemplates.ts`** — Template CRUD with variable substitution
- **`src/userCommands.ts`** — Map custom commands to agent actions
- **Plugin example**: `ExampleSearchPlugin` built into pluginApi.ts

## Testing
- **Framework**: Vitest v1.6.0
- **Config**: `vitest.config.ts` with vscode shim alias
- **Test files**: `src/agent/tools/__tests__/file-tools.test.ts` (11 tests), `tool-registry.test.ts` (12 tests)
- **Commands**: `npm run test`, `npm run test:watch`, `npm run test:coverage`

## Build & CI/CD
- **Build**: `npm run compile` (esbuild) → clean compilation ✅
- **Package**: `vsce package` via GitHub Actions on tags matching `v*`
- **CI**: Ubuntu + Node.js 18/20 matrix, runs `compile → lint → format:check → test`
- **Run**: F5 in VS Code launches extension dev host

## Source Structure


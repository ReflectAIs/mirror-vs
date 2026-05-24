
# Mirror VS v0.0.9 — Comprehensive Project Analysis & Enhancement Roadmap

## Current State

✅ **Build Status**: Compiles successfully via esbuild (`npm run compile` passes)
✅ **Core Architecture**: VS Code extension with sidebar webview ↔ orchestrator ↔ tool registry ↔ LLM providers (Ollama + DeepSeek)
✅ **Screenshot Base64 Pipeline**: FIXED — browser-tools.ts correctly embeds base64, orchestrator.ts extracts it via regex and sends to vision models
✅ **Git Integration**: Full diff/review/accept/reject pipeline works with inline diff viewer in webview
✅ **Tool Set**: 18 tools (file ops, browser automation, search, terminal, figma, git)

---

## 🔴 Critical Issues (Blocking v0.1.0 Release)

### 1. Test Coverage: <5% — No Safety Net
- **Files with 0 tests**: `orchestrator.ts` (1382 lines), `sidebar-provider.ts`, `browser-service.ts`, `api-service.ts`, all tool files
- **Risk**: Any refactor is blind. No regression detection.
- **Fix**: Add unit tests for orchestrator, browser-tools, file-tools, api-service. Integration test for end-to-end tool pipeline.

### 2. Massive Orchestrator — Single Point of Failure
- **1382 lines** in `orchestrator.ts` violates Single Responsibility Principle
- Combines: system prompt generation, streaming, tool parsing, tool execution, context compression, error recovery, telemetry
- **Fix**: Split into: `AgentSession` (state mgmt), `AgentCompleter` (streaming), `AgentParser` (tool extraction), `AgentExecutor` (tool orchestrator)

### 3. No Inline Completions (Missing Major Feature)
- No `InlineCompletionItemProvider` registered in extension.ts
- Users MUST open sidebar for every interaction — friction is high
- **Fix**: Register a quick-chat inline provider that triggers on `ctrl+shift+m` / comment prefix

### 4. No Token Budget / Cost Control for DeepSeek
- No user-facing token counter or cost tracker in UI
- DeepSeek API calls can run up bills with no warning
- The `tokenUsage` message type exists but is never displayed in sidebar.js
- **Fix**: Add token/cost dashboard in webview, implement hard cost caps per session

### 5. Message Type Mismatch — Silent Failures
- `cancelStream`, `revertHistory`, `acceptAllReviews` emitted by webview but not in `WebviewToExtensionMessage` type union
- Errors logged to console but user sees nothing
- **Fix**: Add missing types and ensure handlers respond with error feedback

---

## 🟡 Medium Priority (Should Have for v0.1.0)

### 6. Missing File Tools: rename + delete
- `file-tools.ts` has read, create, write, patch, listDir
- **Missing**: `rename_file`, `delete_file` — two of the most basic file operations
- **Fix**: Add both to file-tools.ts, tool-registry.ts, and orchestrator system prompt

### 7. No Slash Commands
- No `/fix`, `/explain`, `/test`, `/refactor` quick commands
- Users must describe intent fully every time
- **Fix**: Add command detection in sidebar.js, route to orchestrator with pre-prompted system messages

### 8. No CI/CD Pipeline
- No GitHub Actions workflow
- No automated lint + test + build gates
- **Fix**: Create `.github/workflows/ci.yml` with lint → test → compile steps

### 9. Input Validation / Safety Controls
- No allowlist for terminal commands (risk: `rm -rf /`)
- No file path allowlist (risk: writing to system directories)
- **Fix**: Add safe command list and path sandboxing in `getSafePath` and `terminal-tools.ts`

### 10. Avatar State — Not Connected to Real Events
- `buddy-container` avatar cycles idle emojis but never transitions to thinking/coding/tool_calling states
- The `setAvatarState` function exists in sidebar.js but orchestrator.ts never calls it via `postMessage`
- **Fix**: Send avatar state transitions from orchestrator.ts to webview

---

## 🟢 Low Priority (Nice to Have)

### 11. Chat Virtualization
- Long sessions render 100s of DOM `<div>` elements — performance degrades over time
- **Fix**: Implement virtual scrolling with DOM recycling (render only ~50 visible messages)

### 12. Keyboard Accessibility
- No ARIA labels, no `role` attributes, no focus management
- Screen readers cannot navigate the sidebar
- **Fix**: Add `aria-*` attributes, proper tab order, focus trapping in modals

### 13. Token Usage Dashboard
- `tokenUsage` message type is wired in orchestrator.ts but sidebar.js never renders it
- **Fix**: Add a usage dashboard card in chat-messages showing input/output tokens, estimated cost, and per-session budget

### 14. Live Host Validation
- `validateHost` message type exists and is debounced in sidebar.js
- But orchestrator.ts has no handler for it — validation never runs
- **Fix**: Add `case 'validateHost':` in sidebar-provider.ts message handler

### 15. Figma Key Persistence
- Figma API key input exists in settings drawer but is never saved/persisted
- The `figmaKey` is sent to `saveSettings` but orchestrator never retrieves it
- **Fix**: Add figma key to secret-storage-service and wire it up

### 16. README — Out of Date
- Still references v0.0.1 features, doesn't mention Figma/Git tools or DeepSeek support
- **Fix**: Update with current feature list, screenshots, setup instructions

---

## 🔧 Already Fixed (Post-v0.0.9)

| Issue | Status | Details |
|-------|--------|---------|
| esbuild.js missing | ✅ Fixed | Created, `npm run compile` passes |
| Screenshot base64 pipeline | ✅ Fixed | browser-tools.ts embeds base64, orchestrator.ts extracts + sends to vision |
| File corruption from fix scripts | ✅ Fixed | All temporary scripts removed, files verified correct |
| Auto-close malformed tool tags | ✅ Implemented | `autoCloseToolTags()` + `getCleanedToolResponse()` in orchestrator |
| Git baseline ensure | ✅ Implemented | `_ensureGitBaseline()` auto-inits git repo + commits baseline |
| Context compression | ✅ Implemented | `_summarizeHistory()` with configurable maxTurns/turnsToRetain |
| Tool tag inside code block filtering | ✅ Implemented | `_stripCodeBlocks()` prevents false tag detection |
| One-tool-per-turn enforcement | ✅ Implemented | Parser sorts by position, returns only earliest tool tag |
| Malformed tag recovery | ✅ Implemented | Up to 3 retries with feedback messages |
| Terminal state management | ✅ Implemented | Terminal tracking in CommandService |

---

## 📊 Project Metrics

| Metric | Value |
|--------|-------|
| Total TypeScript files | 22 |
| Lines of code (source) | ~6,500 |
| Orchestrator size | 1,382 lines |
| Test files | 4 (all minimal) |
| Test coverage | <5% |
| ESLint warnings | ~85 |
| Tools available | 18 |
| Build time | ~2s |
| Last clean build | ✅ Passes |

---

## 🎯 Recommended v0.1.0 Sprint Plan

### Sprint 1: Quality Foundation (3-5 days)
1. Orchestrator decomposition → 4 files
2. Unit tests for all decomposed modules
3. Integration test for tool pipeline
4. Fix message type mismatches
5. Add CI pipeline

### Sprint 2: Safety & UX (3-5 days)
6. Command/filename validation & sandboxing
7. Token budget & cost control UI
8. Avatar state integration
9. Figma key persistence
10. Live host validation handler

### Sprint 3: Feature Complete (3-5 days)
11. Inline completions provider
12. rename_file + delete_file tools
13. Slash commands (/fix, /explain, /test)
14. Chat virtualization
15. README update

### Estimated timeline: 9-15 days for v0.1.0

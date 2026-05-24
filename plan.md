
# Mirror VS — Deep Project Analysis & Enhancement Roadmap

## Project Overview

Mirror VS (v0.0.9) is a VS Code extension providing an autonomous AI coding assistant in the sidebar. It supports Ollama (local) and DeepSeek (API) providers with 12+ workspace tools, git-backed review/revert, and streaming chat.

---

## ✅ Fixed Issues

### ✅ Build Script (esbuild.js) — Restored & Working
- Created `esbuild.js` (was missing)
- `npm run compile` now builds successfully to `dist/extension.js`
- Supports `--watch` and `--minify` flags

---

## 🔴 Critical Issues Found

### 1. Bug: Browser Screenshot Base64 Extraction Broken
**File**: `src/agent/orchestrator.ts`  
The regex `\(Image successfully captured and sent to vision model)` has **no capture group** for base64 data, but `match[1]` is accessed. Screenshots are never extracted/transmitted.

### 2. Bug: `cancelStream` & `revertHistory` Type Mismatch
**Files**: Types vs sidebar-provider handler  
These message types are emitted by webview but not in the `WebviewToExtensionMessage` union. The handler silently ignores them.

### 3. Missing Coverage: <5% Test Coverage
- 0 tests for orchestrator (1382 lines)
- 0 tests for sidebar-provider
- 0 tests for all 10+ services
- No integration or E2E tests

### 4. Missing Feature: No Inline Completions
No `InlineCompletionItemProvider` registered. Users must open sidebar for every interaction.

### 5. Missing Feature: No Diff Review UI
`review-manager.ts` exists but no visual diff viewer in the webview.

### 6. Missing Tool: `rename_file` & `delete_file`
File toolset incomplete.

---

## 🟡 Medium Priority

### 7. Decompose orchestrator (1382 → ~400 lines)
Massive single file violates SRP. Needs splitting into AgentSession, AgentCompleter, AgentExecutor, AgentParser.

### 8. Add `/` slash commands
`/fix`, `/explain`, `/test`, `/refactor` for quick actions.

### 9. Input validation & cost controls
No allowlist/blocklist for commands. No token budget enforcement for DeepSeek API (cost explosion risk).

### 10. CI/CD pipeline
No GitHub Actions, no automated quality gates.

---

## 🟢 Quick Wins

### 11. Token usage display in UI
`tokenUsage` message type exists but no UI display.

### 12. Keyboard accessibility audit
No ARIA labels, role attributes, or screen reader support.

### 13. Chat virtualization
Long sessions render 100s of DOM nodes. Needs virtual scrolling.

---

## Action Items (0.1.0 Release)

| # | Task | Priority | Effort | Status |
|---|------|----------|--------|--------|
| 0 | Fix build script (esbuild.js missing) | 🔴 Critical | 🟢 Low | ✅ Done |
| 1 | Fix screenshot base64 extraction | 🔴 Critical | 🟢 Low | ⬜ |
| 2 | Fix message type mismatch | 🔴 Critical | 🟢 Low | ⬜ |
| 3 | Add test suite | 🔴 Critical | 🔴 High | ⬜ |
| 4 | Add inline completions | 🔴 Critical | 🟡 Medium | ⬜ |
| 5 | Add diff review UI | 🔴 Critical | 🟡 Medium | ⬜ |
| 6 | Add rename/delete tools | 🟡 Medium | 🟢 Low | ⬜ |
| 7 | Decompose orchestrator | 🟡 Medium | 🔴 High | ⬜ |
| 8 | Add slash commands | 🟡 Medium | 🟡 Medium | ⬜ |
| 9 | CI/CD pipeline | 🟡 Medium | 🟡 Medium | ⬜ |
| 10 | Input validation | 🟡 Medium | 🟡 Medium | ⬜ |
| 11 | Token usage display | 🟢 Low | 🟢 Low | ⬜ |
| 12 | Accessibility basics | 🟢 Low | 🟡 Medium | ⬜ |


# Mirror VS Project Memory

## Current Build Status: ✅ Compiles Successfully
- `node esbuild.js` → Build completed
- No TypeScript errors on build

## Project Version: v0.0.9
- VS Code extension: sidebar webview ↔ orchestrator ↔ tool registry ↔ LLM providers
- Providers: Ollama (local) + DeepSeek (cloud API)
- 18 tools available

## Fixed Issues (Current Session)
1. ✅ `types/index.ts` — Added `cancelStream`, `revertHistory`, `acceptReview`, `rejectReview`, `diffReview`, `prevChange`, `nextChange` to `WebviewToExtensionMessage`
2. ✅ `agent/types.ts` — Added `rename_file` and `delete_file` to ToolCall type
3. ✅ `file-tools.ts` — Added rename/move and delete handlers
4. ✅ `tool-registry.ts` — Routes rename_file and delete_file to file-tools; fixed duplicate `list_dir` line
5. ✅ `orchestrator.ts` — Added rename_file and delete_file tool docs to system prompt
6. ✅ `orchestrator.ts` — Added `_sendAvatarState()` method with proper event transitions
7. ✅ `types/index.ts` — Added `avatarState` to `ExtensionToWebviewMessage`
8. ✅ `sidebar.js` — Added `avatarState` case to the message listener switch

## Completed Refactoring (Current Session)
- ✅ **Orchestrator decomposition**: `orchestrator.ts` split into 4 focused modules:
  - `agent-session.ts` — Session state management (history, summarization trigger)
  - `agent-completer.ts` — LLM streaming completion calls, context summarization
  - `agent-parser.ts` — Tool call XML parsing, code block stripping, tag validation
  - `orchestrator.ts` — Orchestrator main loop (delegates to the above modules)
- ✅ **All 4 modules compile with zero TypeScript errors**

## Still To Fix / Enhance
- **Token usage dashboard**: sidebar.js has `tokenUsage` handler but UI elements may not exist
- **Figma key**: Saved to secrets, retrieved in orchestrator — working
- **Host validation**: handler exists in sidebar-provider.ts — working
- **Test coverage**: <5%, no safety net
- **Orchestrator size**: Now reduced from 1,382 lines to ~400 lines
- **Inline completions**: Missing `InlineCompletionItemProvider`
- **CI/CD**: No GitHub Actions workflow
- **Slash commands**: Not implemented

## Key Files
- `src/extension.ts` — Extension entry point
- `src/providers/sidebar-provider.ts` — Webview ↔ Extension message relay
- `src/agent/orchestrator.ts` — Core AI agent loop (~400 lines)
- `src/agent/agent-session.ts` — Session state & history management
- `src/agent/agent-completer.ts` — LLM streaming completion
- `src/agent/agent-parser.ts` — Tool call parsing
- `src/agent/tools/tool-registry.ts` — Routes tools to executors
- `src/agent/tools/file-tools.ts` — File operations
- `src/webview/sidebar.js` — Webview UI (2,140 lines)
- `src/types/index.ts` — Shared type definitions
- `src/services/` — API, browser, command, figma, localization, rate-limiter, review-manager, secret, storage, telemetry services

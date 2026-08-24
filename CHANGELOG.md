# Change Log

All notable changes to the "Mirror VS" extension will be documented in this file.

## [0.7.6] - 2026-08-24

### Fixed

- **Tab Switching Queue Fix**: Fixed an issue where switching to a newly created empty tab while another task was active in a different tab would incorrectly route messages to the queue instead of sending them as a new task.

## [0.7.5] - 2026-08-21

### Fixed

- **Model Infinite Loop on Background Commands & Conversational Answers**: Fixed an issue where the model would go into an infinite loop of `noToolsUsed` errors when replying with pure conversational text or when background terminal processes were active.
- **Immediate Single-Enter Send During Terminal Execution**: Fixed the issue where users had to send messages twice when a terminal command was running (due to `command_output` being improperly excluded from active ask responses).

## [0.7.4] - 2026-08-21

### Added

- **One-Step Ollama Auto-Setup**: Automatically downloads and pulls the required embedding model (`nomic-embed-text`) via the local Ollama instance during One-Click Auto-Setup if not already installed, complete with VS Code progress status.
- **10-Minute Background Process Alert**: Automatically wakes up the model with a progress notice if a long-running detached background terminal process continues running past 10 minutes.

### Fixed

- **Vision Input Crashes on Non-Vision Custom Models**: Automatically detects non-vision models (such as `deepseek-v4-flash-0731`, `llama-3.1`, `qwen2.5-coder`) when using the Custom/OpenAI-compatible provider and safely filters image blocks into descriptive text placeholders to prevent 400 Bad Request errors.

## [0.7.3] - 2026-08-21

### Added

- **One-Click Codebase Indexing Auto-Setup**: Clicking the ⚡ One-Click Auto-Setup button in the Code Index panel now automatically downloads and starts the local Qdrant vector database with zero manual prerequisites — the local DB is bootstrapped on demand and the index begins immediately.

### Fixed

- **Code Index Startup Crash (`fd: null` stdio)**: Fixed a crash that occurred during codebase indexing initialization where spawning the local Qdrant process with a `WriteStream` whose file descriptor was still `null` (not yet opened) caused `TypeError: The argument 'stdio' is invalid`. The fix awaits the stream's `open` event before spawning so the fd is always valid; falls back to `"ignore"` if the log file can't be created.
- **Missing `nativeArgs` for Parameter-less Tools**: Tools that take no required parameters (`get_workspace_file_tree`, `get_workspace_pulse`) and tools with all-optional parameters (`get_git_status`, `read_session_context`, `search_mcp_tools`) were incorrectly failing with `Invalid tool call: missing nativeArgs` when called by some LLMs (e.g. Fireworks DeepSeek) that stream empty argument payloads. Added explicit parser cases in `NativeToolCallParser` for all six affected tools so they default to `{}` instead of crashing.
- **First Message Edit via Enter Key**: Fixed the first-message edit mode in `TaskHeader` where pressing Enter did not submit — only clicking the send button did. Added an explicit early-return for `isEditMode` in the `handleKeyDown` handler.
- **Message Queue During Tool Execution**: Fixed a race condition where messages typed while the model was executing a tool call (reading files, running commands) would bypass the queue and interrupt the active tool instead of being deferred. Messages are now always queued when `isStreaming` is `true`.

## [0.7.2] - 2026-08-21

### Added

- **Automatic Visual Diff Review Tab**: Integrated automatic visual diff editor (`vscode.diff`) for proposed file modifications so deletions and additions are cleanly rendered in side-by-side / inline red and green views without overlapping or offset text decorations.

### Fixed

- **Sidebar Live Run/Deny Button Visibility**: Synchronized `activeTerminals` execution state with deep-compare effect dependencies in `useChatMessages` to ensure interactive terminal buttons disappear immediately when autonomous commands start executing.
- **Startup Blank Chat View on Session Restore**: Awaited `task.startRestoredTask()` before webview state posting to resolve intermittent blank chat panel loading on extension restart.
- **Diff Editor Line Alignment**: Cleaned up inline file review decorations to eliminate spurious red background tinting across unaffected code lines.

## [0.7.1] - 2026-08-20

### Added

- **Cross-Workspace Sessions & Chat Branching**: Users can now branch/fork an active chat or past history item into another workspace folder seamlessly without losing valuable architectural and conversation context, with an interactive choice prompt in Task History.
- **Reactive Terminal Background Completion**: Added automatic background process completion callbacks to wake up the model via `task.injectInBetweenMessage()` when long-running terminal processes exit.
- **Fireworks AI Token Loop Breaker**: Real-time `StreamDegenerationDetector` that intercepts infinite single-token and n-gram phrase repetition loops during streaming, plus frequency and presence penalties for Fireworks inference.
- **Session Tutorial & Shared Context Inspector**: Interactive tutorial modal on how Sessions and SubSession Tabs work, plus an Inspector dialog showing shared notes and sibling tab summaries.
- **In-Between Message Steering**: When tasks are streaming, queued messages can be force-sent to steer the model mid-execution.
- **Super-Cute Mascot Expressions & Polish**: Expanded lively Kaomoji micro-expressions, reactive animations, and developer humor across status modes.
- **Firebase & CLI Loop Breakers**: Enhanced repetition detector and execution prompt to prevent models from looping on repeated failing or interactive CLI commands like Firebase, with exemptions for polling utilities (`sleep`, `echo`, `cat`, `ps`).
- **ComfyUI Server Startup & Copy Tools**: Added a **Start ComfyUI Server** button and browser link to launch ComfyUI directly from the Workflow Browser, along with an error copy action button with checkmark status feedback.

### Fixed

- **Session Tab Isolation & Dynamic Header Title**: Fixed TabBar scoping so switching sessions cleanly isolates tabs to the active session and dynamically updates the session header title in the chat toolbar.
- **Terminal Run/Deny Button Suppression**: Suppressed unnecessary Run/Deny action buttons when a terminal command has already started running and is streaming output.
- **File Changes Panel Height & Scroll**: Added a `max-h-[300px]` height boundary with vertical scroll in the file changes panel to prevent expanded diffs from taking up the entire screen.
- **ComfyUI Auto-Setup Duplicate Runs**: Added a backend execution mutex lock and persistent extension state synchronization to prevent concurrent setups and retain progress indicators when switching settings tabs.
- **Mascot Speech Bubble Clipping & Layering**: Increased quote speech bubble z-index to `z-[99999]` and adjusted container overflow rules to prevent the mascot text from getting hidden or clipped behind windows on Windows.
- **Restoration of Previous Active Tab**: Prevented automatically spawning blank new tabs on startup, ensuring the last active task tab is properly restored instead.

### Changed

- **Destructive Command Rules**: Permitted safe deletion of temporary files/directories (`/tmp`, `os.tmpdir()`, `scratch/`, build caches) while preserving safeguards against root and system deletions.
- **Git Diff Visuals**: Upgraded unified diffs with high-contrast vivid green background/borders for additions and vivid red for removals across both dark and light themes.
- **Modernized Fireworks AI**: Integrated dynamic model discovery and updated default model to `kimi-k2p5`.
- **Force Process Tree Termination**: Guaranteed robust cleanup of hung child processes and terminals using comprehensive process-tree termination.
- **Default Multi-Tab UI Interface**: Promoted the `multiTab` experiment to core features; enabled it by default and added a global setting checkbox to let users "Disable multi-tab interface".
- **Tab Terminology Update**: Rebranded destructive prompts and buttons from "Delete Session" to "Delete Tab" to match the actual tabbed chat interface.
- **Mascot Speech Bubble Hover Duration**: Increased Click Quote persistence duration from `1400ms` to `4500ms` to let users read mascot comments comfortably.

## [0.7.0] - 2026-08-17

### Added

- **DeepInfra Provider**: New chat provider using Anthropic's compatible endpoint (`https://api.deepinfra.com/anthropic`) with prompt-cache-hit support. Sends `cache_control` on the system prompt and last two user messages, parses `cache_creation`/`cache_read` input tokens, and computes cost via `calculateApiCostAnthropic`. Registered across the types package, API factory, [`ProfileValidator`](src/shared/ProfileValidator.ts), webview settings (constants, provider component, ApiOptions, useSelectedModel), and all 18 i18n locales (reactivated from the retired list). Backed by [`deepinfra.ts`](src/api/providers/deepinfra.ts) and [`DeepInfra.tsx`](webview-ui/src/components/settings/providers/DeepInfra.tsx).
- **Session Context Sharing**: New [`SessionContextManager`](src/core/session/SessionContextManager.ts) that persists a compact summary per `sessionId` and exposes it to sibling sessions via the `read_session_context` tool, giving the model awareness of sibling sessions when context is shared.
- **Inline Free-Form Model Selection**: Added a free-form model selection input near the chat text area for the Custom API provider, letting users type any model name without opening settings in [`ChatTextArea.tsx`](webview-ui/src/components/chat/ChatTextArea.tsx).
- **Marketing Page**: Added the Mirror VS product advertising page under [`marketing/mirror-vs-product-advertising.md`](marketing/mirror-vs-product-advertising.md).

### Fixed

- **Complete Translations Across All Locales**: Finished translations for every locale file and removed unused files — all locales now carry the full key set (including DeepInfra entries and missing settings keys).

### Changed

- **Full Test Suite Green**: Made the complete test suite pass (5687 passing, 0 failures), including new coverage for DeepInfra and the inline model selector.

## [0.6.10] - 2026-08-16

### Fixed

- **DeepSeek Thinking Mode Lost on Resume**: Fixed serialization of DeepSeek `reasoning_content` when rebuilding the conversation history on task resume. The thinking blocks are now preserved for assistant messages in [`TaskApiRequest`](src/core/task/TaskApiRequest.ts:972), so DeepSeek reasoning is restored correctly after a resume.

## [0.6.8] - 2026-08-07

### Added

- **Brain Explorer Panel**: New "Brain" view (database icon in the chat toolbar) that shows every file the AI currently holds in active memory. Files can be toggled to **Cold Storage** to exclude them from prompt contexts (saving tokens) or forgotten entirely. Backed by new `hot`/`cold` `storage_tier` on context metadata, new `forgetContextFile` / `toggleContextFileStorageTier` webview messages, and [`FileContextTracker.forgetFile()`](src/core/context-tracking/FileContextTracker.ts:267) / [`FileContextTracker.toggleFileStorageTier()`](src/core/context-tracking/FileContextTracker.ts:284). Cold-tier files are skipped when building the prompt context in [`FileContextTracker`](src/core/context-tracking/FileContextTracker.ts:230).
- **Session Analytics Panel**: New "Analytics" view (graph icon in the chat toolbar) that aggregates task history into total cost, total tokens, and per-model/per-mode breakdowns, computed from [`AnalyticsView`](webview-ui/src/components/analytics/AnalyticsView.tsx:9).
- **Concise-Thinking Prompt Rule**: Added a rule instructing the model to keep `<thinking>`/planning blocks to 1–2 minimal sentences for speed and token efficiency in [`rules.ts`](src/core/prompts/sections/rules.ts:89).
- **Mascot Badge Interactions**: The mascot badge now cycles expressions/quotes on click with a bounce animation and shows a hover tooltip with the current quote in [`MascotBadge`](webview-ui/src/components/chat/MascotBadge.tsx:90).

### Changed

- **CLI Formatting**: Prettier-normalized object/expression formatting across [`extension-host.ts`](apps/cli/src/agent/extension-host.ts:234) and [`run.ts`](apps/cli/src/commands/cli/run.ts:56) (no behavior change).

## [0.6.7] - 2026-07-29

### Fixed

- **Blank Page on Extension Startup**: Removed the [`restoreSessionTabs()`](src/core/webview/MirrorProvider.ts:1643) call from [`handleWebviewDidLaunch()`](src/core/webview/handlers/taskHandler.ts:13). Previously, it created an idle `Task` (`startTask: false`) from the newest history item, which produced a tab with no conversation loaded — just a blank page. With session-based history grouping, users load specific tasks by clicking session groups in the history view, or create fresh tabs via the "+" button (which generates a new session). The persisted session ID is still restored via `getOrCreateSession()` so new tasks inherit the correct `sessionId` for grouping.

- **Git Auto-Approval Bypassing Disabled Setting**: Moved git command check **before** autonomous mode check in [`checkAutoApproval()`](src/core/auto-approval/index.ts:69). Previously, `autonomousMode === true` returned `{ decision: "approve" }` for ALL commands at line 71-73, completely bypassing the `alwaysAllowGitCommit` toggle. Git operations (commit, push, add, pull, merge, rebase, etc.) now always respect the explicit `alwaysAllowGitCommit` setting — even in autonomous mode, git is never silently auto-approved unless the user has explicitly enabled it. The duplicate dead git check in the old `ask === "command"` block was removed.

- **TabBar "+" Button Not Creating a New Session**: Fixed [`handleNewTask()`](src/core/webview/handlers/taskHandler.ts:97) to detect when the TabBar "+" button is clicked with empty text and no images. The handler now calls `provider.createSession()` to generate a fresh `sessionId` before creating the idle task, ensuring the new tab appears as its own session in history instead of being absorbed into the current session.

- **Legacy Tasks Invisible After Session Grouping Migration**: Fixed [`buildSessionGroups()`](webview-ui/src/components/history/useGroupedTasks.ts:28) which had `if (!sid) continue` dropping all pre-existing history tasks that lack a `sessionId`. Each legacy task now gets a `__legacy__<id>` synthetic session ID, creating singleton sessions that display the task text as their session name.

- **Session Restore Restoring All Historical Tabs**: Fixed [`restoreSessionTabs()`](src/core/webview/MirrorProvider.ts:1638) which was restoring ALL historical session tabs into the tab bar instead of only the newest/focused tab. Now only the single focused tab is restored on session load.

- **SSH Hanging on Authentication Failure**: Added password caching in [`SshSessionRegistry`](src/core/tools/helpers/SshSessionRegistry.ts:216) — passwords are now cached per `host:port` key on first connect and automatically reused on reconnect, preventing SSH from entering a non-interactive password prompt loop (which would hang forever since stdin is `/dev/null`). Also added [auth failure detection](src/core/tools/helpers/SshSessionRegistry.ts:136) that monitors stdout/stderr for patterns like `"Permission denied"`, `"authentication failed"`, and `"connection refused"`, immediately rejecting the connection promise instead of waiting for the 10-second timeout.

- **SSH Output Flooding Context Window**: Integrated [`OutputInterceptor`](src/integrations/terminal/OutputInterceptor.ts:58) into [`SshSessionTool`](src/core/tools/SshSessionTool.ts:67) — large SSH command outputs are now truncated using the same head/tail preview buffer strategy as `execute_command`. The first 50% of the preview budget shows the beginning of output, the last 50% shows the end, and the middle is dropped. Full output is spilled to a persisted artifact file (`{taskDir}/command-output/cmd-{executionId}.txt`) accessible via the [`read_command_output`](src/core/tools/ReadCommandOutputTool.ts:85) tool with offset/limit/search support. Also fixed a TypeScript type error where `let toolResponse: string` was incompatible with the `ToolResponse` return type of `formatResponse.toolResult()`.

- **PARALLEL_TOOL_READS Experiment Not Showing in Settings UI**: Fixed locale key mismatch across all 18 locale files — the settings JSON keys used `CONCURRENT_FILE_READS` but the code constant in [`experiments.ts`](src/shared/experiments.ts:16) is `PARALLEL_TOOL_READS`. The `ExperimentalFeature` component looks up translations dynamically via `settings.experimental.{experimentKey}.{name,description}`, so the stale key caused the parallel tool reads toggle to render without any visible name or description. Updated English title to _"Parallel tool reads (experimental)"_ with a proper description explaining the performance impact.

- **Keyboard Shortcuts Not Firing While Mirror VS Is Focused**: VS Code's `when`-clause keybindings (`activeWebviewPanelId` / `focusedView`) do NOT reliably match when focus is inside a webview iframe (microsoft/vscode#61762), so `Ctrl+N` / `Ctrl+Shift+N` / `Ctrl+W` were still handled by VS Code (New File / New Window / Close Editor). Added a webview-level `keydown` listener in [`useShortcutKeys()`](webview-ui/src/hooks/useShortcutKeys.ts:1) mounted from [`App.tsx`](webview-ui/src/App.tsx:53) that intercepts these combos while Mirror VS is focused, calls `preventDefault()` so the native VS Code action never runs, and posts the equivalent `WebviewMessage` (`newTask` / `clearTask` / `closeTaskTab`). Shortcuts: `Ctrl/Cmd+N` or `Ctrl/Cmd+T` new tab, `Ctrl/Cmd+Shift+N` new session, `Ctrl/Cmd+W` close active tab. The commands (`mirror-vs.newTab`, `mirror-vs.newSession`, `mirror-vs.closeTab`) registered in [`registerCommands.ts`](src/activate/registerCommands.ts:126) and contributed in [`src/package.json`](src/package.json:49) remain available as backup for users who rebind them via the Keyboard Shortcuts editor.

- **Closing a Tab Does Not Activate Its Previous Tab**: When closing the active tab (via the tab bar X or `Ctrl/Cmd+W`), the extension relied on whatever task happened to end up at the top of the mirror stack after the pop, which is not guaranteed to be the closed tab's predecessor (tasks can be parked in `backgroundTasks` mid-stream, and tabs are ordered by `createdAt`). Updated [`closeTask()`](src/core/webview/MirrorProvider.ts:660) to capture the tab-bar order before removal, determine the closed tab's position, and — when closing the active tab — explicitly focus its previous tab (falling back to the next tab when closing the first one) via [`switchToTask()`](src/core/webview/MirrorProvider.ts:599). This gives browser-like behavior: closing a tab activates the tab immediately before it. Closing a non-active tab leaves the active tab unchanged.

- **Concurrent Tabs Failing With "The provider couldn't process the request as made"**: When 2-3 tabs ran simultaneously, every tab transmitted its streaming request at the same instant, tripping the provider's overload protection (Anthropic HTTP 529 `overloaded_error`). Added a global cross-tab request gate in [`Task.acquireGlobalRequestGate()`](src/core/task/Task.ts:328) that serializes request _transmission_ across all tabs: each [`attemptApiRequest()`](src/core/task/TaskApiRequest.ts:316) acquires the gate and holds it until the provider accepts the request (first chunk) or it fails, so tabs queue instead of firing together — then streaming continues fully in parallel. Also made transient provider capacity errors (529 overloaded, 429 rate limit, 503 unavailable) auto-retry with exponential backoff via [`isTransientProviderError()`](src/core/task/transient-error.ts:10) even when auto-approval is disabled, in both the first-chunk path ([`attemptApiRequest()`](src/core/task/TaskApiRequest.ts:705)) and the mid-stream path ([`recursivelyMakeMirrorRequests()`](src/core/task/TaskMainLoop.ts:870)), so concurrent multi-tab use no longer dumps the raw error on the user.

### Changed

- **SSH Tool Documentation Updated**: The [`ssh_session`](src/core/prompts/tools/native-tools/ssh_session.ts) tool prompt now documents password caching behavior (the model no longer needs to pass the password on reconnect) and the output truncation pattern with artifact_id for `read_command_output` access.

## [0.6.6] - 2026-07-22

### Fixed

- **SSH Session Disconnecting Immediately After Connect**: Removed stale `SshSessionRegistry.removeSession()` calls from `close`/`error` event handlers in [`SshSessionRegistry.ts`](src/core/tools/helpers/SshSessionRegistry.ts:73). When `handleKillTerminal` killed an old session and deleted its map entry, the old session's asynchronous `close` event would fire later and call `removeSession(this.host, this.port)` — which operates by host:port key, not object reference — accidentally finding and killing any new session created at the same host:port. The `isDead` flag is sufficient for all cleanup; `getOrCreateSession()` and `getSessions()` already check it.

- **ANSI Escape Sequences Bleeding Into SSH Output**: Added [`stripAnsi()`](src/core/tools/helpers/SshSessionRegistry.ts:4) to strip CSI sequences (e.g. cursor show/hide `?25h`, cursor up `?251A`), OSC sequences, and control characters from SSH stdout/stderr output so command results are cleanly parseable by the model.

### Changed

- **SSH Tool Description Warns Against Never-Exiting Commands**: Added prominent rule #2 in the [`ssh_session`](src/core/prompts/tools/native-tools/ssh_session.ts:3) tool description warning the model to NEVER run foreground processes that run indefinitely (e.g. `docker compose up` without `-d`, `tail -f`, `ping`, `watch`), with explicit guidance to use detached/one-shot alternatives instead.

## [0.6.5] - 2026-07-22

### Fixed

- **SSH Kill Terminal Not Unblocking the Model**: Killing an SSH session via the terminal badge now properly aborts the current task's terminal process. Previously, [`handleKillTerminal`](src/core/webview/handlers/taskHandler.ts:156) called [`SshSessionRegistry.removeSession()`](src/core/tools/helpers/SshSessionRegistry.ts:172) → `session.close()` → `child.kill()` (SIGTERM), but never resolved the `abortPromise` in [`Promise.race`](src/core/tools/SshSessionTool.ts:125). Since the kill handler now also calls `task.handleTerminalOperation("abort")` → `sshProcess.abort()` → `triggerAbort()` → the `abortPromise` resolves, allowing the model to unblock with `"[Command execution aborted by user]"` instead of hanging forever.

### Added

- **Screenshots Saved to Disk with URL Labels**: Both [`BrowserScreenshotTool`](src/core/tools/BrowserTools.ts:232) and [`RenderPreviewTool`](src/core/tools/BrowserTools.ts:401) now save screenshots to `.mirror-vs/screenshots/` with URL-derived filenames via the existing [`saveScreenshot()`](src/core/tools/BrowserTools.ts:97) utility (updated to accept an optional `label` parameter). Added [`BrowserService.getCurrentUrl()`](src/services/browser-service.ts:425) to retrieve the page URL for labeling. The tool result includes the saved file path so the model can reference screenshots by filename when creating documents.

## [0.6.4] - 2026-07-21

### Fixed

- **`alwaysAllowBrowser` not persisting after refresh**: Added `alwaysAllowBrowser` to the destructuring in `getStateToPostToWebview()` in [`MirrorProviderState.ts`](src/core/webview/MirrorProviderState.ts:159) — it was present in the return object but never extracted from global state.
- **Global auto-approval On/Off toggle could never enable**: The message router at [`messageRouter.ts`](src/core/webview/messageRouter.ts:390) was calling `handleAutoApprovalEnabled(provider)` without passing `message.bool`, so the handler always received `undefined` → defaulted to `false`, making it impossible to turn auto-approval back on after disabling it.

### Changed

- **AutoApproveDropdown redesign**: Compact chip layout with slim header, inline On/Off pill, Settings button, and flex-wrap chip grid. Removed separate footer bar with Select All/None buttons.

## [0.6.3] - 2026-07-21

### Added

- **Kill Running Terminals & SSH Sessions**: Added kill buttons (OctagonX icon, hidden until hover) to each terminal row in the [`TerminalStatusBadge`](webview-ui/src/components/chat/TerminalStatusBadge.tsx:125) popover. SSH sessions now appear in the active terminals list (Server icon) alongside VSCode terminals (Terminal icon). New [`handleKillTerminal`](src/core/webview/handlers/taskHandler.ts:156) backend handler routes kills to [`TerminalRegistry.killTerminal()`](src/integrations/terminal/TerminalRegistry.ts:330) or [`SshSessionRegistry.removeSession()`](src/core/tools/helpers/SshSessionRegistry.ts:172) using deterministic negative IDs from host:port hashes. Added [`SshSessionRegistry.getSessions()`](src/core/tools/helpers/SshSessionRegistry.ts:181) to expose live SSH sessions. Added `type`, `host`, `port` fields to [`TerminalInfo`](packages/types/src/vscode-extension-host.ts:286), `"killTerminal"` to [`WebviewMessage.type`](packages/types/src/vscode-extension-host.ts:481), and `terminalId`/`terminalType` payload fields. Badge always visible now — shows "—" when no terminals active.

- **Browser Tool Chat Rendering**: Added 8 browser tool rendering cases to [`ChatRow.tsx`](webview-ui/src/components/chat/ChatRow.tsx:1062) — `browserNavigate`, `browserClick`, `browserType`, `browserScreenshot`, `browserScroll`, `browserSelect`, `browserEvaluate`, and `renderPreview`. Each renders a header with tool-specific icon (globe, debug, edit, camera, move, check, terminal, preview) and relevant parameters. Previously all browser tool calls fell through to `default: return null` and were invisible in the chat history.

- **Browser Tool Approvals in MirrorSayTool**: Added all 8 browser tool names (`browserNavigate`, `browserClick`, `browserType`, `browserScreenshot`, `browserScroll`, `browserSelect`, `browserEvaluate`, `renderPreview`) to the [`MirrorSayTool`](packages/types/src/vscode-extension-host.ts:819) `tool` union type, with browser-specific properties (`url`, `selector`, `text`, `direction`, `amount`, `value`, `script`, `width`, `height`).

- **Browser Tool Auto-Approval**: Added `alwaysAllowBrowser` toggle throughout the full auto-approval chain — [`GlobalSettings`](packages/types/src/global-settings.ts:114) schema, [`ExtensionState`](webview-ui/src/context/ExtensionStateContext.tsx:31) context, [`AutoApproveToggle`](webview-ui/src/components/settings/AutoApproveToggle.tsx:7) config, [`AutoApproveDropdown`](webview-ui/src/components/chat/AutoApproveDropdown.tsx:21) popover, [`AutoApproveSettings`](webview-ui/src/components/settings/AutoApproveSettings.tsx:21) props, and [`useAutoApprovalToggles`](webview-ui/src/hooks/useAutoApprovalToggles.ts:8) / [`useAutoApprovalState`](webview-ui/src/hooks/useAutoApprovalState.ts:3) hooks. Includes English i18n keys under `settings.autoApprove.browser` and `chat.browser.*` namespaces.

- **Browser Chat Translation Keys**: Added 16 translation keys under the `browser` namespace in [`en/chat.json`](webview-ui/src/i18n/locales/en/chat.json:487) — `wantsTo*` and `did*` variants for each of the 8 browser tools.

- **Persistent SSH Session Tool (`ssh_session`)**: New native persistent shell process channel supporting `connect`, `execute`, and `disconnect` actions. Maintains remote connections alive across turns to prevent SSH rate-limiting or firewall blocks caused by repeated authentication attempts. Includes a stdout completion sentinel (`__SSH_COMMAND_FINISHED__ $?`) to securely capture output and return codes without closing the connection. Integrated into `NativeToolCallParser` for native streaming and validation.

### Changed

- **Auto-Approve Popover Design**: Redesigned [`AutoApproveDropdown`](webview-ui/src/components/chat/AutoApproveDropdown.tsx:152) with proper VS Code theme colors — `bg-vscode-dropdown-background`, `border-vscode-dropdown-border`, `text-vscode-foreground`. Reduced popover width to `w-[min(400px,calc(100vw-2rem))]`, improved spacing and typography with section headers, centered icon layout, and border separator between settings and global toggle.

- **Auto-Approve Toggle Design**: Replaced [`AutoApproveToggle`](webview-ui/src/components/settings/AutoApproveToggle.tsx:92) Button `variant` prop with manual `className`-based styling. Enabled state: `bg-vscode-button-background text-vscode-button-foreground shadow-sm border`. Disabled state: `bg-transparent text-vscode-foreground border border-vscode-dropdown-border/40`. Icon opacity: 100% (enabled) vs 60% (disabled) for clearer visual state differentiation.

- **Browser Navigation Timeouts**: Reduced [`browser-service.ts`](src/services/browser-service.ts:239) navigate timeout from 30s to 10s (`page.goto` timeout) and hard wait from 10s to 3s, preventing 40-second hangs on connection failures.

### Fixed

- **Tesseract.js OCR Bundling & Extension Host Fallback**: Fixed Tesseract worker and WASM core module bundling in [`packages/build/src/esbuild.ts`](packages/build/src/esbuild.ts:138) to copy full `tesseract.js/src`, `tesseract.js-core`, and runtime dependencies (`regenerator-runtime`, `wasm-feature-detect`, `zlibjs`, `bmp-js`, `is-url`) into `src/dist/tesseract-worker` and `src/dist/node_modules/`. Resolved runtime `MODULE_NOT_FOUND` worker crashes in VS Code Extension Host. Lowered extracted text length filter threshold from `> 20` to `> 0` in [`image-cleaning.ts`](src/api/transform/image-cleaning.ts:120) to retain short UI text and labels.

- **Interactive SSH Command Hanging & SIGINT Abort Support**: Updated `SshSessionRegistry.ts` command execution format from multiline `{ command } </dev/null` to single-line subshell `(command) </dev/null` to prevent interactive SSH shell sessions from hanging at secondary `>` prompts. Implemented `session.abort()` sending `\x03` (Ctrl+C / SIGINT) to `stdin` and registered `SshTerminalProcess` on `task.terminalProcess` to enable instant UI termination of active SSH commands.

- **Terminal Command UI Stop Button**: Updated `ChatView.tsx` to set `isStreaming={isStreaming || mirrorAsk === "command_output"}` on `ChatTextArea`, ensuring the UI Send/Stop button morphs to a functional Stop button whenever background or terminal tool commands are executing.

- **Screenshots Not Sent to Vision Model**: Fixed both [`BrowserScreenshotTool`](src/core/tools/BrowserTools.ts:198) and [`RenderPreviewTool`](src/core/tools/BrowserTools.ts:335) passing base64 screenshot data as plain text embedded in a string literal — despite claiming "(Base64 data hidden from output but sent to vision model)". `pushToolResult` only extracts image blocks from `Array<Anthropic.ImageBlockParam>` entries; plain strings produce zero image blocks. Now passes proper `{ type: "image", source: { type: "base64", media_type: "image/png", data } }` blocks alongside text blocks, so screenshots actually reach the model's vision system.

- **Auto-Approval Not Persisting After Browser Toggle**: Fixed root cause in [`MirrorProviderState.getState()`](src/core/webview/MirrorProviderState.ts:366) missing `alwaysAllowBrowser` in its return object. All other `alwaysAllow*` fields (ReadOnly, Write, Execute, Mcp, ModeSwitch, Subtasks, FollowupQuestions) were present, but `alwaysAllowBrowser` was omitted. The value WAS being saved to VS Code global state via `handleUpdateSettings`, but `getState()` never returned it → `checkAutoApproval()` always saw `undefined` → defaulted to `false`.

- **ERR_CONNECTION_REFUSED Browser Hangs**: Added specific [`ERR_CONNECTION_REFUSED`](src/services/browser-service.ts:256) error handling in browser navigation, providing a clear, actionable error message instead of a generic timeout when the target server isn't running.

- **Non-Vision Model Safety**: Confirmed [`maybeRemoveImageBlocks`](src/api/transform/image-cleaning.ts:6) properly strips image blocks for models without vision support (e.g. DeepSeek has `supportsImages: false`), converting them to `"[Referenced image in conversation]"` text placeholders before API requests.

- **Orchestrator Hangs When Sending Images to Non-Vision Models**: Fixed a critical ordering bug in [`TaskApiRequest.ts`](src/core/task/TaskApiRequest.ts:527) where the `AbortController` was created 72 lines _after_ `maybeRemoveImageBlocks()` — meaning Tesseract.js OCR could hang indefinitely on large user-attached images with no way for the user to cancel. The abort controller is now created _before_ `maybeRemoveImageBlocks`, and the OCR call is wrapped in a `Promise.race` with the abort signal so `cancelTask` actually works during OCR. Additionally added a 30-second timeout to the Tesseract.js `recognize()` call in [`image-cleaning.ts`](src/api/transform/image-cleaning.ts:82) so that even without user cancellation, a stuck OCR worker won't block the API request forever — it gracefully falls back to a text reference on timeout.

### Changed

- **Image Attach/Paste Unlocked for Non-Vision Models**: [`shouldDisableImages`](webview-ui/src/components/chat/hooks/useChatMessages.tsx:964) no longer gates on `!model?.supportsImages` — the OCR fallback for non-vision models already handles images at API-request time. Users can now attach (via the Image icon button at the bottom-right of the textarea) and paste (via clipboard paste handler in [`ChatTextArea.tsx`](webview-ui/src/components/chat/ChatTextArea.tsx:688)) images regardless of model vision capability. Also fixed the same guard in edit mode [`ChatRow.tsx`](webview-ui/src/components/chat/ChatRow.tsx:1529) inline editing. The max images per message limit (20) is still enforced.

### Added

- **DOM Page Text in Browser Screenshots**: Both [`BrowserScreenshotTool`](src/core/tools/BrowserTools.ts:222) and [`RenderPreviewTool`](src/core/tools/BrowserTools.ts:393) now include the page's DOM `textContent` in the tool result text block (under `--- Page Text Content ---`), giving the model readable page content alongside the screenshot image. Extracted from Puppeteer's `document.body.innerText` — no additional overhead.

- **Lightweight OCR Fallback for Non-Vision Models**: [`maybeRemoveImageBlocks`](src/api/transform/image-cleaning.ts:40) is now `async` and uses [Tesseract.js](https://github.com/naptha/tesseract.js) to OCR screenshots when the model doesn't support images. When DOM page text is present and substantive (≥50 chars), the image is replaced with a brief text reference. When DOM text is empty or insufficient (e.g. canvas/iframe-heavy pages), OCR extracts text from the base64 screenshot data. Vision models pass through completely unaffected — zero OCR cost. OCR errors are caught gracefully with fallback text. Both call sites ([`TaskApiRequest.ts:526`](src/core/task/TaskApiRequest.ts:526), [`condense/index.ts:308`](src/core/condense/index.ts:308)) have `await` added.

### Changed

- **`maybeRemoveImageBlocks` is Now Async**: Signature changed from `function maybeRemoveImageBlocks(...): ApiMessage[]` to `async function maybeRemoveImageBlocks(...): Promise<ApiMessage[]>`. Added lazy OCR via Tesseract.js at API-request time, so vision models never pay OCR latency. Added 4 new unit tests covering OCR success, empty OCR result, OCR error, and short-DOM-text-with-OCR-fallback scenarios.

## [0.6.2] - 2026-07-19

### Added

- **Persistent SSH Session Tool (`ssh_session`)**: Introduced a native persistent shell process channel supporting `connect`, `execute`, and `disconnect` actions. Maintains remote connections alive across turns to prevent SSH rate-limiting or firewall blocks caused by repeated authentication attempts. Includes a stdout completion sentinel (`__SSH_COMMAND_FINISHED__ $?`) to securely capture output and return codes without closing the connection. Integrated into `NativeToolCallParser` for native streaming and validation.

- **Multi-Anchor Visual Tracking**: New scroll anchoring system that tracks ALL rendered `[data-index]` elements' visual positions each frame via RAF polling loop. Compensates for content growth below the viewport during streaming by accumulating sub-pixel drift across frames (∼0.033px/frame) and applying scroll compensation when the accumulator crosses ±1px. Anti-oscillation ensures post-compensation positions become the next frame's baseline. Includes a drift accumulator (`driftAccumulatorRef`) that prevents sub-pixel drift from silently accumulating without ever triggering compensation.

- **`data-ts` Attribute for Stable Element Keying**: Added `data-ts={message.ts}` to [`ChatRow`](webview-ui/src/components/chat/ChatRow.tsx:144) and `data-ts={task.ts}` to [`TaskHeader`](webview-ui/src/components/chat/TaskHeader.tsx:39). The anchor system now prefers `data-ts` keys (timestamps) over Virtuoso's recycled `data-index` keys, providing stable identity across DOM node recycling.

- **User Scroll Intent Detection**: All scroll input handlers (wheel, pointer drag, keyboard) now timestamp a shared `lastUserScrollInputRef` on ANY scroll motion in ANY direction. The RAF loop uses a 150ms grace period after the last input timestamp to detect active user scrolling and pause compensation, preventing the system from fighting user-initiated scrolling.

- **`overflow-anchor: none` CSS**: Added [`overflow-anchor: none`](webview-ui/src/index.css:624) to scrollable containers to disable the browser's native scroll anchoring, which was competing with the custom implementation.

- **Scroll-to-Bottom Click Guard**: Added `isClickingScrollToBottomRef` to prevent spurious `atBottomStateChange(false)` signals during the scroll-to-bottom button click sequence from triggering unintended phase transitions.

### Changed

- **`handleRowHeightChange` Always Pins in Anchored Follow**: Removed the `isStreaming` gate from the force-pin condition — when in `ANCHORED_FOLLOWING` phase, row height changes now always trigger a scroll-to-bottom, regardless of streaming state.

- **`atBottomStateChangeCallback` Logic Restructured**: Merged pointer-scroll and isStreaming branches into a unified `!isAtBottom` handling path. Removed `isStreaming` dependency from the callback, preventing stale closure issues. Early return added for `isClickingScrollToBottomRef` to avoid racing with button-initiated scroll-to-bottom.

- **Removed `rangeChanged` from Virtuoso Props**: Deleted the unused [`rangeChanged={handleRangeChanged}`](webview-ui/src/components/chat/ChatView.tsx:371) prop from the Virtuoso component, cleaning up a stale callback reference.

### Fixed

- **Content Shifting Up During Streaming**: Multi-Anchor Visual Tracking with drift accumulator compensates for content growth below the viewport in real time, preventing the visual content shift (Bug 2). The drift accumulator solves the sub-pixel problem where individual per-frame deltas (∼0.033px) are too small for a raw threshold but accumulate significantly over 30+ frames.

- **Scroll Lock During Downward Scrolling**: Previously, only upward scroll events timestamped `lastUserScrollInputRef`, causing the RAF loop to fight downward scrolling. All handlers now timestamp any scroll motion, allowing the 150ms grace period to suppress compensation during active scrolling.

- **Keyboard Scroll Not Recognized**: The keyboard handler now includes `PageDown` and `ArrowDown` in its scroll-intent detection, ensuring downward keyboard scrolling also timestamps `lastUserScrollInputRef`.

## [0.6.1] - 2026-07-18

### Added

- **MirrorHero Mascot Upgrade**: Enhanced the welcome screen mascot with 3 new moods — `silly` (wink + tongue out), `love` (heart eyes with floating hearts), and `surprised` (wide O mouth with shake animation). Added pupil tracking that follows cursor position on hover. Introduced auto-blink every 3-4 seconds and a double-click celebration animation with sparkle bursts. The mood cycle now rotates through all 7 moods instead of 4.

- **New Chat UI Components**: Extracted [`ChatActionBar`](webview-ui/src/components/chat/ChatActionBar.tsx) and [`ChatToolbar`](webview-ui/src/components/chat/ChatToolbar.tsx) as standalone components from the monolithic [`ChatView`](webview-ui/src/components/chat/ChatView.tsx). Added [`ChatWelcomeContent`](webview-ui/src/components/chat/ChatWelcomeContent.tsx) for the empty-state welcome screen. Chat message logic extracted into the [`useChatMessages`](webview-ui/src/components/chat/hooks/useChatMessages.tsx) hook with 1,872 lines of dedicated message orchestration.

### Changed

- **Massive Task & Provider Refactor**: Decomposed the monolithic [`Task`](src/core/task/Task.ts) (3,730→~300 lines) and [`MirrorProvider`](src/core/webview/MirrorProvider.ts) (2,035→~300 lines) classes into 17 modular domain-specific service files. New modules include [`TaskApiRequest`](src/core/task/TaskApiRequest.ts), [`TaskLifecycle`](src/core/task/TaskLifecycle.ts), [`TaskMainLoop`](src/core/task/TaskMainLoop.ts), [`TaskUserInteraction`](src/core/task/TaskUserInteraction.ts), [`TaskConversationHistory`](src/core/task/TaskConversationHistory.ts), [`TaskContextManagement`](src/core/task/TaskContextManagement.ts), [`TaskGetters`](src/core/task/TaskGetters.ts), [`TaskToolTracking`](src/core/task/TaskToolTracking.ts), [`TaskMirrorMessages`](src/core/task/TaskMirrorMessages.ts). Webview side decomposed into [`MirrorProviderDelegation`](src/core/webview/MirrorProviderDelegation.ts), [`MirrorProviderState`](src/core/webview/MirrorProviderState.ts), [`MirrorProviderHelpers`](src/core/webview/MirrorProviderHelpers.ts), [`MirrorProviderProfileManager`](src/core/webview/MirrorProviderProfileManager.ts), [`MirrorProviderSessions`](src/core/webview/MirrorProviderSessions.ts), [`MirrorProviderTaskHistory`](src/core/webview/MirrorProviderTaskHistory.ts), [`MirrorProviderTaskLifecycle`](src/core/webview/MirrorProviderTaskLifecycle.ts), and [`MirrorProviderWebview`](src/core/webview/MirrorProviderWebview.ts). Across 24 files: ~9,600 insertions, ~7,500 deletions (+2,100 net lines).

### Fixed

- **Double-send bug**: Messages responding to interactive asks (`followup`, `tool`, etc.) were both queued on the frontend and auto-drained by the extension, causing the same message to appear in both the chat and the queue. Fixed in 3 places: (1) [`handleSendMessage`](webview-ui/src/components/chat/hooks/useChatMessages.tsx:746) queue guard — restored `isRespondingToAsk` exclusion so non-terminal asks bypass the queue; (2) [`messageWillQueue`](webview-ui/src/components/chat/hooks/useChatMessages.tsx:654) — same logic for UI indicator; (3) [`tryDrainQueuedMessage`](src/core/task/TaskUserInteraction.ts:366) — restricted auto-drain to only `completion_result`/`resume_completed_task` (terminal asks); interactive asks never auto-drain. Terminal commands (`command`, `command_output`) still queue messages as expected.
- **Newline at EOF in [`package.json`](src/package.json)**: Added missing trailing newline for POSIX compliance.

## [0.6.0] - 2026-07-16

### Added

- **Pipeline System for ComfyUI Workflows**: Introduced a full pipeline architecture for image generation. Pipelines are discoverable from built-in, global (`~/.mirror/pipelines/`), and project (`.mirror/pipelines/`) sources via a new `PipelineRegistry`. Supports 7 pipeline types: txt2img, txt2img-flash, img2img, inpaint, outpaint, upscale, and remove-bg. Includes auto-selection with user override through `GenerateImageParams.pipeline`.
- **Pipeline Settings UI**: New `PipelineSettings` component in Settings > Experimental > Image Generation for browsing, importing, deleting, and setting default pipelines.
- **Workflow Format Normalization**: `WorkflowEngine.normalizeWorkflow()` handles both legacy (array-based) and modern (object-based) ComfyUI workflow formats with format-aware prompt injection.
- **WorkflowEngine Refactoring**: All 6 task methods (`generate`, `img2img`, `inpaint`, `outpaint`, `upscale`, `removeBg`) use `PipelineRegistry.resolve()` instead of hardcoded `loadWorkflowSync()`.
- **Pipeline Webview Handlers**: New `pipelineMessageHandler` with `requestPipelines`, `importPipeline`, `deletePipeline`, `setDefaultPipeline` operations, wired into the message router.
- **Audio & Video Workflow Support**: Added `txt2audio.json` and `txt2video.json` built-in workflows. Updated `pipeline-meta.json` with audio and video pipeline definitions. Extended `HardwareDetector` with audio/video hardware requirements and detection logic.
- **Per-Pipeline Experiments**: Added 8 new experiment types (`TXT2IMG`, `IMG2IMG`, `INPAINT`, `OUTPAINT`, `UPSCALE`, `REMOVE_BG`, `TXT2AUDIO`, `TXT2VIDEO`) replacing the single `IMAGE_GENERATION` toggle. Each pipeline type can be independently enabled/disabled via the experiment system.
- **OpenRouter Cloud Generation**: New `OpenRouterRuntime` class supporting cloud-based generation for all pipeline types (txt2img, img2img, inpaint, outpaint, upscale, remove-bg, txt2audio, txt2video). Integrated into the message router with secure API key storage.
- **Per-Type Provider Selection**: Each pipeline channel now has its own provider dropdown (Local ComfyUI / Cloud OpenRouter) and model/pipeline selector, enabling mixed configurations (e.g., txt2img via OpenRouter, img2img via ComfyUI).

### Changed

- **ImageGenerationSettings UI Redesign**: Overhauled the settings page with an info guide section, logical grouping into Image Pipelines (6 types) and Media Pipelines (2 types), inline pipeline import dialog (AlertDialog with Textarea), and per-channel descriptions for clearer understanding. Each channel card now has an "Import" link and button, eliminating the need to switch to the Pipelines tab.
- **Translation System Update**: Added 13 new i18n keys for guide text, pipeline group labels, and import dialog. Updated locale file structure with new `imageGeneration` and `experimental.*` entries.

### Fixed

- **Connection-Based Prompt Injection for ComfyUI Workflows**: Fixed the "hands" bug where image generation always produced hand-related artifacts regardless of the prompt. [`injectPrompt`](src/services/image-runtime/workflows/engine.ts:438) and [`injectNegativePrompt`](src/services/image-runtime/workflows/engine.ts:482) now trace KSampler/SamplerCustom `positive`/`negative` connections instead of relying on `_meta.title` labels. User-imported pipelines from ComfyUI may have CLIPTextEncode node titles that don't match their wiring — this caused the negative prompt text (`"deformed, extra fingers"`) to be used as positive conditioning, making the model generate hand artifacts. Connection-based lookup follows the actual data flow, matching how ComfyUI processes prompts.

- **Missing Experiment Translation Keys**: Added 8 missing translation entries (`TXT2IMG` through `TXT2VIDEO`) with `name` and `description` fields to the English locale. Previously, the `ExperimentalFeature` component rendered raw translation keys as UI text because these keys were absent from all 18 locale files.

- **LLM Model Picker Snap-Back**: Fixed the native `<select>` dropdown for DeepSeek/Claude/Ollama models near the chat input jumping back to the previous selection immediately after choosing a new model. The root cause was `handleModelChange` calling `postStateToWebview()`, which pushed the full extension state back to the webview. `setProviderSettings()` cleared all non-secret ProviderSettings keys first, then applied only the partial modelChange fields — `mergeExtensionState()` replaced the webview's complete `apiConfiguration` with this partial version, causing `useSelectedModel()` to recompute and the controlled `<select>` to snap back. Fix: removed the `postStateToWebview()` call since the webview already has the correct local value.

- **VSCodeDropdown Race Condition in Image Gen Settings**: Fixed a FAST web component race condition where the image generation model dropdown would sometimes reset to a stale value. Applied a local buffer state + key remount pattern to isolate the dropdown from live prop updates.

- **Text-to-Audio Pipeline Not Exposed to LLM**: Fixed the `generate_image` tool definition and capabilities section omitting audio generation from the LLM's tool schema. The tool description now explicitly mentions "generate audio clips from text descriptions", with a `"txt2audio"` pipeline example. `capabilities.ts` updated to mention audio generation alongside image generation.

- **ComfyUI Audio Output Handling**: Fixed `ComfyUIProvider.pollForResult()` only reading `output.images` but not `output.audio` from ComfyUI history responses. `SaveAudio` nodes return audio under `output.audio` with `{ filename, subfolder, type }`. The poller now iterates audio outputs, fetches via `/view` endpoint, and returns `data:audio/wav;base64,...` data URLs.

- **GenerateImageTool Audio Support**: Fixed `GenerateImageTool.ts` rejecting `data:audio/...` data URLs. Added `audioMatch` regex alongside `imageMatch`, proper audio file extension handling (`.wav`, `.mp3`, `.flac`, `.ogg`, `.aac`, `.m4a`, `.webm`), and text-based reporting for audio results (since audio can't be rendered in an image viewer).

- **Generate-then-Edit Model Confusion**: Fixed the LLM creating a completely new image instead of editing the previously-generated one when the user asks to modify it (e.g. "make it a sketch"). Added a `CRITICAL` section to the `generate_image` tool description with explicit instructions and 3 concrete examples demonstrating the generate → edit chaining pattern. Updated `capabilities.ts` with a bold callout about requiring the `image` parameter for edits, and added `"img2img"` to the listed available pipelines.

- **Pipeline Badge in Frontend Chat Messages**: Added `pipeline` and `inputImage` fields to the `MirrorSayTool` interface in `vscode-extension-host.ts`. The `GenerateImageTool` approval message now includes `pipeline: pipelineType` (with value `"img2img"`, `"txt2img"`, etc.) and `inputImage` path when editing. `ChatRow.tsx` renders a styled pipeline badge and input image indicator in both the approval prompt and the completed/done message.

- **ComfyUI Error Categorization**: Added `prompt_outputs_failed_validation` error pattern to `comfyui-errors.ts` with `workflow_validation` category and actionable suggestion. Fixed JSON error parser to handle flat `{type, message}` error objects from ComfyUI (previously only handled nested `{error: ...}` responses).

- **False-Positive SIGTERM Error Suppression**: Fixed `RuntimeManager` emitting "Process exited with code null (signal SIGTERM)" errors on every intentional ComfyUI shutdown. Changed exit code check from `code !== 0` to `code !== null && code !== 0`, so signal-based kills (clean shutdown) no longer trigger error events.

- **Failed Pipeline Model Identification**: When a pipeline fails during image generation, the error message and structured LLM payload now include the pipeline slug and model name (e.g. `Pipeline "txt2img-flash" with model "sd_xl_turbo" failed: ...`), so users know exactly which pipeline configuration to fix in ComfyUI.

- **Model-Aware Pipeline Auto-Select for Turbo Models**: Fixed `PipelineRegistry.autoSelect()` only checking prompt keywords (e.g. "fast") when auto-selecting a pipeline, completely ignoring the model name. When a turbo model (e.g. `sd_xl_turbo`, `sdxl_turbo`) is selected, the system now automatically picks a compatible pipeline (e.g. `txt2img-flash` with SamplerCustom + SDTurboScheduler) instead of the standard `txt2img` pipeline (KSampler), preventing `prompt_outputs_failed_validation` errors. Threaded the model name through `resolveWorkflow()` in both `ComfyUIProvider` and `ComfyCloudProvider`.

### Removed

- **Global Pipeline Allowlist**: Removed the global pipeline allowlist UI section, security tokens section, and per-model pipeline assignment from experimental settings. Users now import pipelines per-channel and manage them independently.

- **Builtin Pipelines**: Removed all default (builtin) pipeline discovery (`discoverBuiltin()` no longer loads from workflows directory). Pipelines must be explicitly imported by the user. Updated `pipeline-registry` tests to reflect zero builtins on initialization.

### Added

- **Active Terminal Popover**: The terminal status badge next to session artifacts is now clickable and opens a popover listing all actively running terminals, showing terminal ID, current command, working directory, and task association. Added `TerminalInfo` interface and `activeTerminals` state to `ExtensionState`.

- **Per-Pipeline Delete Buttons**: Added delete button per pipeline in each channel section of `ImageGenerationSettings`, allowing users to remove imported pipelines directly from the channel card without switching to the Pipelines tab.

### Changed

- **PipelineImport Behavior**: `importPipeline()` no longer auto-selects the imported pipeline as the user default. The user must explicitly set a default per channel if desired.

## [0.5.6] - 2026-07-12

### Changed

- **Documentation Tone Overhaul**: Rewrote all provider and available-tools documentation with a friendlier, more approachable tone — balancing clarity with personality.
- **Branding Consistency**: Updated naming and references across documentation, locale README files, test snapshots, and internal scripts for consistent branding.
- **Publish Script Branch Naming**: Updated branch name prefix in the types package publish script to match current naming conventions.

### Removed

- **Deprecated Image Assets**: Removed stale image files and references from the MCP documentation that were no longer in use.

## [0.5.3] - 2026-07-10

### Added

- **Web Search Tool**: Added a new `web_search` native tool enabling the assistant to perform live web searches via DuckDuckGo HTML endpoint. The tool parses result snippets and returns the top 5 results with URLs, giving the assistant real-time web access during task execution. Includes a new `WebSearchTool` class, prompt registration under `native-tools`, proper tool-use type definitions, and integration with `MirrorProvider` and `webviewMessageHandler`.
- **Web Search Type Definitions**: Added `web_search` to the shared tool types (`tools.ts`), `task.ts`, and `mode.ts` type systems to ensure proper tool routing and validation.
- **modelChange Message Type**: Added a new `modelChange` message type to the `WebviewMessage` interface in `vscode-extension-host.ts`, with handler support in `webviewMessageHandler.ts` and `ChatView.tsx` for seamless model switching updates from the webview.
- **Cancel Button on Auto-Approve Countdown Timer**: Added a visible Cancel (XCircle icon) button on the follow-up auto-approve countdown timer bar in `FollowUpSuggest`. Users can now manually cancel the auto-approve countdown via click, which triggers `cancelAutoApprovalTimeout()` to clear the pending timeout. Includes i18n support with a `cancelTimer` translation key.
- **Queued Message Auto-Processing After Task Completion**: Added automatic processing of queued messages after each task loop completes. When `didEndLoop` is detected in `initiateTaskLoop()`, one queued message is dequeued and submitted as user feedback wrapped in `<user_message>` tags, enabling sequential queue draining without blocking.
- **Session Rename in Chat Header**: Added inline session rename directly in the ChatView header. Click the session name (or "Unnamed session") next to the Mirror VS branding to edit it inline — Enter to save, Escape to cancel.
- **i18n Keys for Session Rename**: Added `namePlaceholder`, `renameTooltip`, and `unnamed` translation keys under the `chat:task` namespace.

### Removed

- **Conversation Mode**: Removed the `💬 Conversation` mode definition from `packages/types/src/mode.ts`, the special `alwaysAvailable` bypass in `src/core/tools/validateToolUse.ts`, and all associated test cases from both `modes.spec.ts` and `validateToolUse.spec.ts`.
- **Session Grouping from History View**: Removed `SessionGroupItem` and the `SessionGroup` abstraction entirely. History tasks are now rendered directly as `TaskGroupItem` lists without session wrapping, matching the correct architecture where sessions are individual entities containing sequential tasks.

### Changed

- **Approve/Reject Preserve Input Text**: Approve and Reject buttons now preserve the user's input text in the text area after clicking, allowing users to continue editing and send it later via Enter or the Send button instead of losing their draft.
- **HistoryView Simplified**: Removed `useExtensionState`, `vscode`, `SessionGroup` type, and `SessionGroupItem` imports. Removed `handleRenameSession`, `sessionGroupsWithSelection`, and `toggleSessionExpand` logic. Tasks render directly via `TaskGroupItem` from `useGroupedTasks().groups`.
- **useGroupedTasks Cleaned**: Removed `buildSessionGroups()`, `collectAllSubtasks()`, `expandedSessionIds` state, `sessionNames` parameter, and `toggleSessionExpand` callback.
- `useGroupedTasks()` now returns only `{ groups, flatTasks, toggleExpand, isSearchMode }`.
- **Code Cleanup**: Minor cleanup across task services and webview message handling, removing unused `MessageQueueService` imports and streamlining type references.

### Fixed

- **UI Grayed-Out After Idle/Inactive Time**: Fixed the model input area getting stuck in a disabled state after webview suspension or extended idle periods. `sendingDisabled` now resets via a sync `useEffect` when streaming stops (`isStreaming` → `false`) and via the `didBecomeVisible` handler on webview visibility restoration, ensuring the chat input reliably returns to an active state.
- **Approve/Reject Buttons Sending Input Text**: Fixed Approve and Reject buttons no longer bundling the input box text with the button response. Button responses are now sent independently without touching the input buffer.

## [0.5.2] - 2026-07-09

### Added

- **Custom API Provider Model Resolution**: The `useSelectedModel` hook now properly resolves model ID and info for the custom API provider, enabling seamless UI integration for custom OpenAI-compatible providers.
- **Custom API Key Secrecy**: `customApiKey` is now included in the secret state keys list, ensuring it's handled securely across all state persistence operations.
- **Custom Provider Config Detection**: `checkExistApiConfig` now correctly detects `customBaseUrl` and `customModelId` as valid configuration values, preventing false "not configured" warnings.

### Changed

- **Simplified Task Header**: Heavily streamlined the task header component by removing the statistics panel, context window progress bar, cache metrics, cost breakdown, condensed context button, model activity indicator, and todo list display. The header now focuses on task metadata and navigation controls only.
- **Model Selector in Chat Footer**: Replaced the full ModelPicker popover (with search, pricing, and custom model management) with a compact native `<select>` dropdown in the ChatTextArea footer bar, directly replacing the old ApiConfigSelector popup for quicker model switching.
- **Todo Button Always Visible**: The todo list button in the header is now unconditionally rendered, giving users constant access to view active todos even when none have been set yet.
- **Task Queue Drain Simplification**: Removed the automatic message queue draining during ask/tool approval states in `Task.ts`, simplifying the flow-control logic and preventing unintended auto-responses to queued messages.

### Fixed

- **Custom Models in Dropdown**: The model dropdown now reads both custom models and deleted default models from `localStorage` (keys used by the old ModelPicker), ensuring custom models appear and deleted models are correctly filtered out.
- **Sticky Message Overlap**: Fixed overlapping sticky messages by implementing scroll-position-based tracking with a memoized Virtuoso Item component. Only one message can be sticky at a time, anchored to the last user message at the current scroll position.

## [0.5.1] - 2026-07-08

### Added

- **Custom API Provider**: Added support for fully custom OpenAI-compatible API providers, supporting custom base URLs, API keys, and model IDs.

### Revamped

- **UX Layout Refinement**: Redesigned the "You Said" feedback bubbles and batch file permissions into unified card components. Relocated action buttons (revert, edit, delete) to the card headers to prevent layout shifting and scrollbar overlap issues.

## [0.5.0] - 2026-07-07

### Revamped

- **Major Engine & Architecture Overhaul**: Re-architected the Mirror VS core execution engine and configuration pipeline from the ground up. Restructured all state management, custom mode capabilities, and schemas while delivering a completely revamped, cybernetic blue-to-cyan premium user interface.

## [0.4.2] - 2025-07-22

### Added

- **Browser Tools Config Gate**: Browser navigation tools are now conditionally available based on the `browserToolsEnabled` configuration flag. When disabled, tool schemas are stripped from the LLM's function declarations at the prompt level and intercepted at runtime with a clear system error, preventing wasted tokens and guiding the model toward alternative approaches (file/terminal tools).
- **Abort Signal Support for Parallel Tool Execution**: Orchestrator's `_executeToolsInParallel` now uses `Promise.race` with an abort signal handler, allowing clean task cancellation when the user triggers a stop.
- **Infinite Scroll End Detection**: The `history-loading-trigger` element is now removed once all chat history has been loaded, preventing unnecessary observer cycles.

### Changed

- **Orchestrator Action Count Accuracy**: The sidebar's worked-accordion action count now reads from actual DOM `.tool-card` elements via `querySelectorAll`, ensuring the count matches what's visually rendered rather than relying on a separate counter.
- **Infinite Scroll Scroll-Protection**: A `preserveScroll` flag now disables smooth scroll behavior during history insertion to prevent jarring viewport jumps. A programmatic-scroll sentinel flag (`isProgrammaticScroll`) prevents recursive loading when `scrollTop` is set programmatically.
- **Empty Assistant Response Handling**: When the orchestrator receives an empty assistant response, a system notice is now pushed to history reminding the model to either output a walkthrough summary (if done) or invoke a tool (if still working), along with an early save of the chat history before the continue loop resumes.

### Fixed

- **IntersectionObserver Registration Timing**: The history-loading observer is now registered with a 150ms delay after DOM rebuild, ensuring layout has fully stabilized before observing triggers.

## [0.4.1] - 2025-07-22

### Added

- **New Agent Tools**: Added `run_script` and `run_server` tool support in `agent-parser.ts`, enabling the agent to execute arbitrary scripts and launch long-running servers through dedicated tool call tags with optional terminal naming.
- **Agent Parser Enhancement**: `read_terminal` now accepts `terminal_name` as an optional (rather than required) attribute, defaulting to an empty string if omitted.
- **Agent Parser Flexibility**: `run_command` tool calls now support an optional `terminal_name` attribute for named terminal targeting.

### Changed

- **Welcome Card Redesign**: Simplified the welcome screen with a cleaner, more focused layout — removed feature boxes and decorative glow effects for a minimal, centered design with a beta notice and streamlined messaging.
- **CSS Color System Refinement**: Updated the dark theme color palette with deeper backgrounds (`--bg-deep: #030305`, `--bg-surface: #07070b`), softer blue-primary gradient (`#2563eb → #38bdf8`), and reduced-contrast text hierarchy for improved readability and reduced eye strain.
- **Border & Glass Effects**: Reduced border opacity and glow intensity across all glass-morphism elements for a more subtle, premium appearance.
- **Scroll Behavior**: All `scrollChatToBottom()` calls now pass `true` to force-smooth scroll on message arrival, eliminating jarring jumps during streaming updates.

### Removed

- **Welcome Card Features Section**: Removed the three-feature item list (Context-Aware, Apply Code Instantly, Dual Provider) from the welcome card to reduce clutter and focus on the core value proposition.
- **Welcome Card Glow Animation**: Removed the `welcome-glow` rotating radial gradient element and its associated keyframe animation, simplifying the welcome animation to a clean fade-in-slide-up.

## [0.4.0] - 2025-07-18

### Added

- **Smart Quote & Unquoted Attribute Parsing**: `agent-parser.ts` now handles curly/smart double quotes (`"..."`), curly single quotes (`'...'`), and unquoted values in tool call attributes, improving compatibility with LLM outputs that use typographic quotes.
- **Loop Action Tracking for Repetition Detection**: `orchestrator.ts` now registers tool action keys (name + target) with the loop detector, enabling earlier detection of repetitive tool call patterns.
- **Context Compaction Strategy 5**: Added intelligent summarization of older conversation history when approaching the budget threshold, preserving high-signal content while trimming low-value exchanges.
- **Intermediate Assistant Annotations in UI**: `05-message-handlers.js` now renders intermediate assistant commentary (non-tool-call text between tool calls) as styled annotation blocks inside the Worked accordion, showing the agent's reasoning inline.
- **Tool Card Duration Display**: Historical tool cards in the sidebar now show duration and action count labels (e.g., "Worked (3 actions) in 4.2s", "Failed (1 action)").
- **Structured Agent Memory Output**: Agent memory service now returns memories as structured JSON (`getPersistentMemoryObject()`) with categorized lists (conventions, architectureDecisions, knownPatterns, userPreferences, notes) for clearer LLM consumption.
- **Contextual Memory Goal**: `getContextString()` now accepts an optional `currentGoal` parameter, injecting it into memory context.
- **Streaming Suppression for Tool Loops**: `agent-completer.ts` suppresses intermediate streaming chunks for subsequent tool-loop turns.

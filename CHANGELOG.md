# Change Log

All notable changes to the "Mirror VS" extension will be documented in this file.

## [0.5.3] - 2026-07-09

### Added

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

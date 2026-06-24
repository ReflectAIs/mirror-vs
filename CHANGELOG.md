
# Change Log

All notable changes to the "Mirror VS" extension will be documented in this file.

## [0.2.15] - 2025-07-17

### Fixed
- **Screenshot Base64 Extraction**: Fixed regex mismatches in orchestrator.ts where screenshot base64 data was not being extracted and forwarded to the vision model. Both the display-result cleaning regex and the image-extraction pipeline regex were matching an outdated return format from browser-tools.ts, causing match[1] to be undefined and the vision model to never receive screenshot data.
- **Fuzzy Patch Robustness**: Improved normalizeLineFuzzy() in file-tools.ts to strip backslash characters before comparison, preventing false mismatches when SEARCH blocks contain escaped special characters. Includes new test case verifying fuzzy patch success with backslash-containing content.

## [0.2.14] - 2025-07-17

### Added
- **🏗️ Orchestrator Modularization**: Decomposed the ~1800-line `orchestrator.ts` monolith into focused, testable modules:
  - `state-machine.ts` — `AgentState`/`TaskMode` enums, `determineTaskMode()`, `detectActiveSymptom()`, `canDescribePatch()`, `hasSufficientJSEvidence()`, `isErrorDirectlyLocalized()`, `hasEnoughInformationForReview()`
  - `control-loop-guard.ts` — Tool validation, search budget enforcement, re-read detection, architecture scope locking
  - `rewrite-engine.ts` — `selectHighestValueTool()`, `rewriteResponseToSingleTool()`, `logRewriteTelemetryToFile()` for multi-tool response rewriting
  - `project-map.ts` — `generateLightweightProjectMap()` for workspace-aware context generation
  - `verification-runner.ts` — `runWorkspaceVerification()` for automated post-patch build/lint/test verification
- **🛠️ History Tools**: New `history-tools.ts` module with `executeHistoryTool()` — enables the agent to review and manage conversation history programmatically
- **🏭 Mock LLM Infrastructure**: `src/services/providers/__mocks__/mock-llm.ts` providing a configurable mock streaming LLM for reliable integration testing
- **📝 Logger Service**: New `logger-service.ts` for structured, file-based logging across agent modules
- **🧪 Extended Test Suite**:
  - Integration tests (`integration.test.ts`) — full orchestrator loop with mock LLM (168+ lines)
  - Orchestrator unit tests (`orchestrator.test.ts`) — 162+ new test cases
  - Tool unit tests: `browser-tools.test.ts`, `language-tools.test.ts`, `terminal-tools.test.ts` covering file ops, browser navigation, and terminal execution
  - History tools tests (`history-tools.test.ts`) — 62 lines covering history management
  - Context compactor tests — refined with additional edge cases
- **🔬 Walkthrough Auto-Detection**: `detectAndNormalizeWalkthrough()` in `orchestrator.ts` automatically wraps agent responses in `<walkthrough>` tags when the model mentions "walkthrough" or uses completion verbiage with structural formatting (lists, headings)

### Changed
- **📦 Version**: 0.2.12 → 0.2.14
- **🔄 Tool Registry Refactoring**: `tool-registry.ts` overhauled with dynamic registration, `ALL_REGISTERED_TOOLS` array, and improved schema generation
- **🔧 Orchestrator Prompt Update**: `orchestrator-prompt.ts` updated with new tool specifications and improved system prompt construction
- **📐 Editor Utils**: `editor-utils.ts` refined with additional util patterns
- **📡 Browser Service**: `browser-service.ts` enhanced for more reliable web navigation
- **👁️ Sidebar Integration**: `sidebar.html`, `sidebar.js`, `05-message-handlers.js` updated with approval workflow UI and event handling for tool registration integration

### Removed
- **🗑️ Artifacts "Open in New Window" Button**: Removed the `artifact-open-in-panel` UI button and its associated `openArtifact` messaging from `sidebar.html`, `08-artifacts.js`, and `sidebar.js` — simplifies the artifacts drawer by dropping the unused VS Code panel opening flow
- **🔇 Failure Detector False-Positive Pattern**: Removed `/doesn'?t (?:exist|appear to be|seem to)/i` from `HELPLESS_PATTERNS` in `failure-detector.ts` — this regex was causing false-positive helplessness escalations when models legitimately described file existence checks

## [0.2.13] - 2025-07-17

### Added
- **🔄 Walkthrough Auto-Detection**: `detectAndNormalizeWalkthrough()` in `orchestrator.ts` automatically wraps agent responses in `<walkthrough>` tags when the model mentions "walkthrough" or uses completion verbiage with structural formatting (lists, headings) — no more missing walkthrough wraps from LLM forgetfulness
- **🧪 Integration Test — Walkthrough Fallback**: New test verifies the auto-wrap logic works end-to-end: when the model outputs "Here is my walkthrough of changes:" without tags, the orchestrator detects it, wraps it, creates the `walkthrough.md` file, and emits `loopComplete: true`
- **🔬 Unit Tests — `detectAndNormalizeWalkthrough`**: 8 new tests covering tag preservation, tool-execution bypass, keyword auto-wrap, preparatory expression avoidance, code-block/blockquote filtering, and casual verb usage filtering (97 test cases added to `orchestrator.test.ts`)

### Removed
- **🗑️ Artifacts "Open in New Window" Button**: Removed the `artifact-open-in-panel` UI button and its associated `openArtifact` messaging from `sidebar.html`, `08-artifacts.js`, and `sidebar.js` — simplifies the artifacts drawer by dropping the unused VS Code panel opening flow
- **🔇 Failure Detector False-Positive Pattern**: Removed `/doesn'?t (?:exist|appear to be|seem to)/i` from `HELPLESS_PATTERNS` in `failure-detector.ts` — this regex was causing false-positive helplessness escalations when models legitimately described file existence checks

## [0.2.12] - 2025-07-17

### Added
- **🧠 Smart Completion Detection**: `loopComplete` message now carries a `completed` boolean — notification toast and avatar celebration only trigger when the agent emits a `<walkthrough>` (implying genuine completion vs user abort)
- **✂️ Token Truncation Warning**: When generation hits the `max_tokens` limit (configurable via `mirror-vs.maxTokens`, default 8192), a warning message is appended: `⚠️ [Generation truncated: reached maximum output token limit.]` — applied in both streaming and non-streaming API paths
- **🏗️ Orchestrator Modularization**: Decomposed the 2416-line `orchestrator.ts` monolith into focused modules:
  - `state-machine.ts` — `AgentState`/`TaskMode` enums, transitions, symptom detection, commitment/patch-ready checks
  - `control-loop-guard.ts` — Tool validation, search budget, re-read detection, architecture scope locking
  - `project-map.ts` — Lightweight workspace structure map generation (extracted from private method)
  - `rewrite-engine.ts` — Tool ranking, telemetry logging, multi-tool response rewriting
  - `verification-runner.ts` — Post-patch compile/lint/test verification pipeline
- **📋 Single Source of Truth**: `ALL_REGISTERED_TOOLS` exported from `tool-registry.ts` — eliminates duplicate tool name lists across 4+ locations in the codebase
- **📊 Logger Service**: New `LoggerService` singleton with `DEBUG`/`INFO`/`WARN`/`ERROR` levels, VS Code Output Channel integration, and structured formatting — replaces scattered `console.log` calls
- **🧪 Expanded Test Suite**: Added 10 new orchestration tests (`orchestrator.test.ts`), 5 browser tool tests, 6 language tool tests, 9 terminal tool tests, and 1 integration test with mock LLM provider — total test count: 199 tests across 22 test files

### Changed
- **🔍 Smarter Review Editor Reuse**: When the current file is already open in the active editor, the review system no longer re-opens the diff or file editor — it applies decorations to existing visible splits instead
- **♻️ Orchestrator refactoring**: Reduced `orchestrator.ts` from 2416 to 1430 lines (-40%); removed duplicated tool execution blocks, centralized tool name lists, extracted state machine and guard logic

## [0.2.11] - 2025-07-16

### Added
- **🧠 Agent Memory Drawer**: New memory drawer panel with refresh/clear controls, category-based rendering (`convention`, `architecture`, `pattern`, `preference`, `note`), and per-entry deletion — accessible via the new memory icon button in the sidebar header
- **⚡ Token Usage & Cost Tracking**: Live real-time token usage bar showing input/output tokens and estimated cost, with context window utilization progress bar; resets on click
- **🗂️ Slash Command Picker**: Inline `/` command palette supporting `/fix`, `/explain`, `/test`, `/commit`, `/refactor`, `/review`, `/docs`, `/ask` with keyboard navigation and autocomplete
- **🗑️ delete_file Tool**: Agent can now permanently delete files with automatic checkpoint creation for revertability and user approval flow
- **📂 rename_file Tool**: Agent can rename/move files within the workspace with automatic parent directory creation and checkpoint support
- **🖼️ Image Vision Support**: Agent can read image files (PNG, JPG, GIF, WEBP) via `read_file` — images are auto-encoded to base64 and sent to the vision model
- **🔐 SecretService Singleton**: `SecretService.getInstance()` for shared access across the extension, with convenient `get()` alias method

### Changed
- **🌐 Browser Navigation Overhaul**: `BrowserService.navigate()` now returns `{title, textContent}` instead of plain string; timeout increased to 30s; wait time increased to 10s for JS-heavy/SPA pages
- **✨ Syntax Highlighting Fix**: Regex replacement for string literals changed from `$1` to `- **✨ Syntax Highlighting Fix**: Regex replacement for string literals changed from `$1` to `## [0.2.10] - 2025-07-16` across all syntax highlighters (JS/TS, Python, CSS, Bash, JSON, Diff) to correctly wrap the full string match` across all syntax highlighters (JS/TS, Python, CSS, Bash, JSON, Diff) to correctly wrap the full string match
- **📏 Context Compactor**: Type narrowing for `role` property in `sanitizeToolMessages` and `maybeCompact` to resolve TypeScript strict-mode errors
- **📋 Prompt Specs Updated**: `toolSpecifications.ts` now includes `delete_file` and `rename_file` tool documentation, plus image read support instructions

### Fixed
- **🔧 Context Usage Emission**: Orchestrator now emits `contextUsage` message to the webview with accurate `usedTokens` and `maxTokens` values

## [0.2.10] - 2025-07-16

### Added
- **Markdown Artifact Rendering**: Full markdown-to-HTML conversion with support for headers, lists, code blocks (with syntax highlighting), inline code, bold/italic, and links
- **Clickable File Paths in Artifacts**: File paths shown in markdown artifacts are clickable — clicking opens the file in VS Code (`openFile` message handling)

### Fixed
- **Markdown Code Block Escaping**: Code block content no longer gets mangled by inline markdown regex passes (uses placeholder-then-restore strategy)

### Changed
- **Artifact Panel Styling**: Refined header (32px compact), body padding (20px 24px), added text-overflow ellipsis, enabled scripts for markdown artifact type
- **Markdown Parsing**: Rewritten from simple regex to line-by-line processor for accurate header/list/path detection

## [0.2.9] - 2025-07-15

### Added
- **Systematic Reasoning Rules**: New agent prompt rules enforcing Zero-Guessing Lookup, Call-Hierarchy analysis, and AST/Symbol accuracy
- **Compilation-Driven Self-Correction**: Agent now runs immediate lint/compile checks after modifications, with diagnostic self-correction loop until builds are clean

### Fixed
- **Assistant Stopping/Give-Up Behavior**: Strengthened Failure Recovery rules with mandatory automatic retry loop (3 attempts minimum)
- **Tool Call Gating**: Corrected prompt to enforce EXACTLY ONE tool per turn for native function calling compatibility
- **Untrusted Source Data Filtering**: Fixed system/tool message rendering to strip `<<<UNTRUSTED_SOURCE_DATA>>>` guards and tool result prefixes before display

### Changed
- **PowerShell Compatibility**: System prompt now instructs agent to use `;` instead of `&&`/`||` for command chaining
- **Unused Font Files**: Removed dead font assets from the repository (Font Awesome files unused by the webview)
- **Artifact Panel Position**: Changed artifact webview panel from `ViewColumn.Beside` to `ViewColumn.Active` to avoid creating extra columns
- **Message Bubble Order**: Relocated `appendMessageBubble` function below `linkifyFilePaths` for correct hoisting/closure behavior
## [0.2.6] - 2025-06-13


### Added
- **Max Project Map Lines Setting**: New UI control in settings for configuring `mirror-vs.maxProjectMapLines` (default 250, range 10-5000)
- **Max Tool Output Length Default Changed**: Default value reduced from 20000 to 8000 for better context budgeting

### Changed
- **sidebar.js**: Synced all settings handling for `maxProjectMapLines` across both save handlers and updateSettings
- **CHANGELOG version sync**: Bumped to 0.2.6 matching package.json

## [0.0.8] - 2025-04-09

### Added
- **CI/CD Pipeline**: GitHub Actions workflow for automated testing and packaging
  - Runs tests, linting, and format checks on every push and PR
  - Automatically packages VSIX on version tags
  - Tested against Node.js 18 and 20
- **Figma Integration**: `figma_inspect` tool for extracting component tree data from Figma nodes
- **Document Analysis**: Support for parsing and analyzing structured documents
- **Test Orchestrator**: Enhanced test execution and reporting capabilities

### Changed
- **Build System**: ESBuild-based compilation with minification support
- **Project Organization**: Restructured services, tools, and utilities directories

### Fixed
- Various edge cases in tool parsing and execution pipeline

## [0.0.7] - 2025-10-17

### Added
- **Figma Integration**: Agent can now read and extract data from Figma documents
  - `figma_get_nodes` tool for fetching specific node data by ID
  - `figma_get_styles` tool for retrieving document styles
  - Support for Figma API key stored securely via VS Code secrets
- **Document Analysis Support**: New tools for parsing and analyzing structured documents
- **Test Orchestrator**: Enhanced test execution and reporting capabilities
- **Parsing Improvements**: Better parsing logic for tool tag extraction and validation

## [0.0.6] - 2025-10-16

### Added
- **CI/CD Pipeline**: GitHub Actions workflow for automated testing and packaging
  - Runs tests, linting, and format checks on every push and PR
  - Automatically packages VSIX on version tags
  - Tested against Node.js 18 and 20

## [0.0.5] - 2025-10-15

### Added
- **Web Search Tool**: `web_search` using DuckDuckGo for live documentation and information retrieval
- **Browser Evaluate Script Tool**: `browser_evaluate_script` for executing arbitrary JavaScript in browser context
- **Auto-save Browser Screenshots**: Screenshots automatically saved to `.mirror-vs/screenshots/` for documentation embedding
- **Figma Inspect Tool**: `figma_inspect` to fetch component tree from Figma node URLs and save as JSON

### Improved
- **Shell Environment Detection**: System prompt auto-detects Windows vs macOS/Linux for correct command syntax guidance

## [0.0.4] - 2025-10-14

### Added
- **Terminal Cards**: Click run_command tool cards to open the live VS Code terminal directly
- **Smart Terminal Reuse**: Terminal cards reveal existing agent-spawned terminals instead of creating new ones
- **Run Command Tool**: `run_command` for executing shell commands in the active workspace
- **CommandService**: Dedicated service for managing VS Code terminal instances from the agent
- **Active Terminals Context**: System prompt dynamically lists all running terminals with status indicators

### Fixed
- **Model Stops After "let me check"**: Stronger prompt rules with smart background timeout handling (60s for installs, 4s for servers)
- **Disappearing Browser Tools**: Fixed target bug and implemented stream early-abort for tool execution to prevent LLM hallucinations

## [0.0.3] - 2025-10-13

### Added
- **Browser Automation**: Full browser tool suite — navigate, click, type, screenshot
  - `browser_navigate` to open URLs
  - `browser_click` to interact with elements via CSS selectors
  - `browser_type` to fill input fields
  - `browser_screenshot` for visual verification of server states
- **Vision Support**: Browser screenshots displayed inline in chat history
- **Webview Badge Stream Indicator**: Live streaming status badge during generation
- **Dynamic Mode Decider**: Architecture that adapts agent behavior based on task context
- **Turn-by-Turn Metrics**: Debug logging to `debug-log.txt` for post-run analysis
- **Redundant Read Deduplicator**: Blocks duplicate read_file loops to save context tokens
- **Write-triggered Cache Eviction**: Automatic cache invalidation on file writes

### Changed
- **System Prompt Upgrade**: State-of-the-art agentic reasoning prompt with Chain-of-Thought thinking blocks and robust multi-tool rules
- **Architecture Refactor**: Streamlined high-performance Single-Agent Independent Developer architecture; removed all legacy multi-agent framework code
- **Max Turns Guard**: Increased `maxLoops` to 10 for longer autonomous interaction runs

### Fixed
- **Stop Button Reliability**: Converted to non-blocking spawn execution with instant process cancellation
- **DeepSeek Stream Cancellation**: Provider now properly cancels stream reader and releases connection on abort signal
- **Stream Early-Abortion Fix**: Optimized turn efficiency by removing aggressive early stream abortion that caused truncated messages and infinite loops

## [0.0.2] - 2025-10-12

### Added
- **DeepSeek Provider Support**: Connect to DeepSeek API (`deepseek-chat`, `deepseek-coder`) alongside local Ollama models
- **Multi-Provider Architecture**: Dual provider system with seamless switching between local and cloud LLMs
- **Provider Fallback Logic**: Automatic fallback if primary provider fails
- **AST Validation**: Optimized pipeline for small models (4B-9B) with AST-based tool validation
- **Strict Context Isolation**: Memory isolation between different chat sessions
- **Selective Context Garbage Collection**: Automatic cleanup of stale context with memory refresh on handoff

### Fixed
- **Read File Crash**: Resolved crash issue in `read_file` tool execution
- **Context Overflow**: Implemented selective context garbage collection to prevent token limits

## [0.0.1] - 2025-10-10

### Added
- **Initial Release**: Fully autonomous AI Pair Programmer for VS Code
- **Dual LLM Backend Support**: Ollama (local) and DeepSeek (cloud) providers
- **Streaming Completions**: Real-time token-by-token streaming responses
- **Multi-Session Chat Management**: Create, switch between, and delete chat sessions
- **Workspace File Operations Suite**:
  - `read_file` — Read file contents with optional line range support
  - `create_file` — Create new files with auto-directory creation
  - `write_file` — Write/replace entire file contents
  - `patch_file` — Precision SEARCH/REPLACE editing with git-safe diff-based changes
  - `list_dir` — List directory contents recursively
  - `grep_search` — Pattern search across workspace files
- **Git Protection System**:
  - Auto-checkpoint on every file operation
  - Diff gutter visualization (yellow/green/red highlights)
  - Accept/Reject/Compare changes workflow
  - Checkpoint revert with history tracking
- **Git Changes UI Drawer**:
  - Summary stats: Added / Modified / Deleted / Untracked counts
  - File list with status badges and action buttons
  - View diff, open file, commit, refresh operations
- **Context Compression**: Automatic summarization of older conversation turns after configurable turn threshold (default: 16)
- **Image Attachment Support**: Paste images directly into chat for vision-enabled models
- **Workspace File Autocomplete**: `@`-mention files in the workspace for context linking
- **Premium UI**:
  - Animated gradient header with glassmorphic backdrop blur
  - Logo integration in header and welcome card
  - Smooth spring animations (`cubic-bezier(0.34, 1.56, 0.64, 1)`)
  - Dark depth with radial gradient backgrounds and accent color glows
  - Micro-interactions: floating logo, hover scales, message entry animations, tool card pulse glow
  - Unified drawer system with X close buttons for settings, history, and git
  - Code block copy buttons
  - Tool cards with expandable/collapsible results
  - Avatar state machine with animated emoji
  - Infinite scroll history loading
- **Keyboard Shortcuts**:
  - `Ctrl+Shift+M` / `Cmd+Shift+M` — Focus sidebar
  - `Alt+Enter` / `Ctrl+Enter` — Accept changes
  - `Shift+Alt+Backspace` / `Ctrl+Backspace` — Reject changes
  - `Alt+K` / `Alt+J` — Previous/Next review change
- **Context Menu Integration**:
  - Right-click "Fix with Mirror VS" on selected code
  - Right-click "Explain with Mirror VS" on selected code
- **Configuration Settings**:
  - Provider selection (Ollama / DeepSeek)
  - Ollama host URL configuration
  - Default model selection per provider
  - Max turns before summarization
  - Turns to retain after compression
- **Secret Storage**: API keys stored securely via VS Code's SecretStorage API (OS credential manager)
- **Active File Context Bar**: Automatically detects and displays the active editor file
- **Turn Logging**: `turns.log` for debugging agent loop execution
- **Ollama Model Auto-Discovery**: Fetches available models from running Ollama instance
- **Host Validation**: Validates Ollama host connectivity before use

### Testing
- **Vitest Test Framework**: Configured with VS Code module shim (`src/vscode-shim.ts`)
- **Unit Tests**: 23 tests across file-tools and tool-registry test suites
- **Coverage Reports**: v8 provider with text, lcov, and HTML output

### Quality
- **ESLint**: Configured with TypeScript plugin and Prettier integration
- **Prettier**: 2-space indentation, single quotes, trailing commas
- **TypeScript**: Strict mode enabled
- **Build**: esbuild bundler with minification support


# Change Log

All notable changes to the "Mirror VS" extension will be documented in this file.

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

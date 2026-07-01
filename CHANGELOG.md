
# Change Log

All notable changes to the "Mirror VS" extension will be documented in this file.

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

### Changed

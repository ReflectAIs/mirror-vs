
# Mirror VS - Project Memory

## Overview
Mirror VS is a VS Code extension that serves as an interactive, sidebar-based AI coding assistant. It supports both local Ollama models and DeepSeek API, with streaming completions, autonomous agent capabilities (file read/write/patch, terminal commands, browser automation), and multi-session chat management.

## Architecture
- **Extension Host**: TypeScript (VS Code API)
- **Frontend**: HTML/CSS/JS webview (no framework, vanilla JS)
- **Build**: esbuild (no webpack/vite)
- **No Unit/Integration/E2E testing framework set up**

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
- ✅ Avatar state machine with animated emoji
- ✅ Infinite scroll history loading
- ✅ Settings drawer with host validation
- ✅ turns.log for debugging agent loops
- ✅ Active file context bar
- ✅ Open file in editor from tool card

## Build & Run
- Compile: `npm run compile` (runs `node esbuild.js`)
- Package VSIX: Run esbuild with --minify (prepublish script), then use `vsce package`
- Development: `npm run watch` for incremental esbuild

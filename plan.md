
# Mirror VS - Enhancement Opportunities Implementation

## Current Status: 🚧 Implementing All 10 Enhancement Areas

### 4. 🧠 AGENT IMPROVEMENTS
- [ ] Streaming Tool Detection optimization
- [ ] Tool Result Size truncation
- [ ] Rate limiting protection
- [x] Provider fallback logic (Already built via Ollama/DeepSeek switch)
- [ ] Per-session token budget enforcement

### 5. 🎨 UI/UX ENHANCEMENTS
- [ ] Multi-model chat: Show which model responded in each message bubble
- [ ] Code diff preview: Show inline diff for patch_file operations inside the tool card
- [ ] Model selection per chat: Allow per-session model override
- [ ] Keyboard shortcuts: ⌘+Enter to send, ⌘+K to clear, etc.

### 6. 🔌 ADDITIONAL TOOLS
- [ ] Git tool: `git_commit`, `git_status`, `git_diff` as built-in agent tools
- [ ] Web search integration for documentation
- [ ] Workspace symbol search via VS Code
- [ ] Variable rename/refactor using language server

### 7. 📊 TELEMETRY & DIAGNOSTICS
- [ ] Token usage tracking per session
- [ ] Latency metrics for LLM calls
- [ ] Error rate dashboard
- [ ] User feedback collection

### 8. 🌐 LOCALIZATION
- [ ] i18n support for the webview UI
- [ ] Multiple language support

### 9. 📚 DOCUMENTATION
- [ ] In-editor tutorial/onboarding walkthrough
- [ ] Tool-specific help tooltips
- [ ] API documentation generation

### 10. 🧩 EXTENSIBILITY
- [ ] Plugin/contribution API for custom tools
- [ ] Custom prompt templates
- [ ] User-defined commands

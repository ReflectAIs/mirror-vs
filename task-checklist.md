
# Orchestrator Decomposition — Active Task Checklist

## Goal
Split `src/agent/orchestrator.ts` (1,429 lines) into 4 focused files while preserving all existing functionality:
- `AgentSession` — state management
- `AgentParser` — tool extraction from LLM output
- `AgentCompleter` — streaming completion management
- `AgentOrchestrator` — orchestration (now much smaller)

## Checklist

### Phase 1: Create Extraction Files
- [ ] 1. Create `src/agent/agent-session.ts` — session state, git baseline, avatar state, settings, history management
- [ ] 2. Create `src/agent/agent-parser.ts` — `_parseToolCalls()`, `_stripCodeBlocks()`, `hasCompleteToolCall()`, `isTagFullyClosed()`, `autoCloseToolTags()`, `getCleanedToolResponse()`, `_sendToolStatusToWebview()`
- [ ] 3. Create `src/agent/agent-completer.ts` — `_getLLMCompletion()`, `_summarizeHistory()`

### Phase 2: Refactor Orchestrator
- [ ] 4. Rewrite `src/agent/orchestrator.ts` — import from new modules, keep only `handleMessageStream()` logic
- [ ] 5. Update `buildSystemPrompt()` — either keep in orchestrator or move to a shared location
- [ ] 6. Verify build compiles (`npm run compile`)

### Phase 3: Verify & Test
- [ ] 7. Run lint check (`npm run lint`)
- [ ] 8. Run tests (`npm test`)
- [ ] 9. Manual smoke test: start extension, send a message, verify streaming + tool execution works

## Progress Tracking
- [x] Read orchestrator.ts fully (1429 lines)
- [ ] Created agent-session.ts
- [ ] Created agent-parser.ts
- [ ] Created agent-completer.ts
- [ ] Rewritten orchestrator.ts
- [ ] Build passes

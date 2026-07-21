# Change Log

All notable changes to the "Mirror VS" extension will be documented in this file.

## [0.6.3] - 2026-07-21

### Added

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

- **Screenshots Not Sent to Vision Model**: Fixed both [`BrowserScreenshotTool`](src/core/tools/BrowserTools.ts:198) and [`RenderPreviewTool`](src/core/tools/BrowserTools.ts:335) passing base64 screenshot data as plain text embedded in a string literal — despite claiming "(Base64 data hidden from output but sent to vision model)". `pushToolResult` only extracts image blocks from `Array<Anthropic.ImageBlockParam>` entries; plain strings produce zero image blocks. Now passes proper `{ type: "image", source: { type: "base64", media_type: "image/png", data } }` blocks alongside text blocks, so screenshots actually reach the model's vision system.

- **Auto-Approval Not Persisting After Browser Toggle**: Fixed root cause in [`MirrorProviderState.getState()`](src/core/webview/MirrorProviderState.ts:366) missing `alwaysAllowBrowser` in its return object. All other `alwaysAllow*` fields (ReadOnly, Write, Execute, Mcp, ModeSwitch, Subtasks, FollowupQuestions) were present, but `alwaysAllowBrowser` was omitted. The value WAS being saved to VS Code global state via `handleUpdateSettings`, but `getState()` never returned it → `checkAutoApproval()` always saw `undefined` → defaulted to `false`.

- **ERR_CONNECTION_REFUSED Browser Hangs**: Added specific [`ERR_CONNECTION_REFUSED`](src/services/browser-service.ts:256) error handling in browser navigation, providing a clear, actionable error message instead of a generic timeout when the target server isn't running.

- **Non-Vision Model Safety**: Confirmed [`maybeRemoveImageBlocks`](src/api/transform/image-cleaning.ts:6) properly strips image blocks for models without vision support (e.g. DeepSeek has `supportsImages: false`), converting them to `"[Referenced image in conversation]"` text placeholders before API requests.

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

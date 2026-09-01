import { Anthropic } from "@anthropic-ai/sdk"
import { serializeError } from "serialize-error"
import pWaitFor from "p-wait-for"
import path from "path"

import {
	type MirrorMessage,
	type MirrorApiReqCancelReason,
	type MirrorApiReqInfo,
	type ToolName,
	MirrorVSEventName,
	getModelId,
	getApiProtocol,
	isRetiredProvider,
} from "@mirror-vs/types"

import { findLastIndex } from "../../shared/array"
import { formatResponse } from "../prompts/responses"
import { getEnvironmentDetails } from "../environment/getEnvironmentDetails"
import { processUserContentMentions } from "../mentions/processUserContentMentions"
import { presentAssistantMessage } from "../assistant-message"
import { NativeToolCallParser } from "../assistant-message/NativeToolCallParser"
import { calculateApiCostAnthropic, calculateApiCostOpenAI } from "../../shared/cost"
import { sanitizeToolUseId } from "../../utils/tool-id"
import { defaultModeSlug, getModeBySlug } from "../../shared/modes"
import { getCheckpointService } from "../checkpoints"
import { t } from "../../i18n"
import { listFiles } from "../../services/glob/list-files"

import type { ToolUse, ToolParamName } from "../../shared/tools"
import type { AssistantMessageContent } from "../assistant-message"
import type { GroundingSource } from "../../api/transform/stream"
import { Task } from "./Task"
import { isTransientProviderError } from "./transient-error"

// ────────────────────────────────────────────────────────────
//  Struggle Ledger — Auto-Recovery Engine
// ────────────────────────────────────────────────────────────

/**
 * Tracks repeated failures of the same pattern to prevent silent
 * infinite billing loops. If the same pattern fires 2+ times,
 * the task hard-aborts and escalates to the user.
 */
export interface StruggleEntry {
	pattern: string
	timestamps: number[]
	resolved: boolean
}

/**
 * Outcome of a {@link StruggleLedger.record} call.
 */
export interface StruggleRecordResult {
	shouldEscalate: boolean
	entry: StruggleEntry
}

/**
 * Thread-safe ledger that records tool-call failures by pattern.
 *
 * ## Lifecycle
 * 1. A tool call fails → `ledger.record("file_not_found")`
 * 2. If same pattern fires twice → `shouldEscalate = true`
 * 3. On success → `ledger.resolve("file_not_found")` clears the entry
 */
export class StruggleLedger {
	private entries: Map<string, StruggleEntry> = new Map()

	/**
	 * Record a failure for the given pattern.
	 * @returns `{ shouldEscalate: true }` if this is the **2nd** (or later) occurrence.
	 */
	record(pattern: string): StruggleRecordResult {
		const existing = this.entries.get(pattern)
		const entry: StruggleEntry = existing ?? { pattern, timestamps: [], resolved: false }
		entry.timestamps.push(Date.now())
		this.entries.set(pattern, entry)

		if (entry.timestamps.length >= 2) {
			entry.resolved = false
			return { shouldEscalate: true, entry }
		}
		return { shouldEscalate: false, entry }
	}

	/**
	 * Mark a pattern as resolved — typically called after a successful retry.
	 */
	resolve(pattern: string): void {
		const entry = this.entries.get(pattern)
		if (entry) {
			entry.resolved = true
		}
	}

	/**
	 * Return a snapshot of all tracked entries (for debugging / telemetry).
	 */
	snapshot(): StruggleEntry[] {
		return Array.from(this.entries.values())
	}
}

/**
 * A recovery strategy knows how to detect and auto-fix a specific mistake
 * pattern (e.g. `file_not_found` → list the parent directory).
 */
export interface RecoveryStrategy {
	pattern: RegExp
	action: (
		errorMessage: string,
		toolName: string,
		toolArgs: Record<string, unknown>,
		ledger: StruggleLedger,
	) => Promise<RecoveryAction>
}

/**
 * The result of running a {@link RecoveryStrategy}.
 * - `"escalate"` → hard-abort, ask the user for help
 * - `"retry"` → continue with adjusted arguments (the message will be fed back to the model)
 * - `"skip"` → not a recoverable error after all, let normal error handling proceed
 */
export type RecoveryAction =
	| { type: "escalate"; message: string }
	| { type: "retry"; message: string }
	| { type: "skip" }

/**
 * Built-in recovery strategies keyed by pattern name.
 *
 * ### `file_not_found`
 * Detects `ENOENT`, `file not found`, or similar filesystem errors.
 * On first occurrence: lists the parent directory and returns the first
 * file found as a corrected path (auto-fix).
 * On second occurrence: escalates to the user.
 */
export const RECOVERY_STRATEGIES: Record<string, RecoveryStrategy> = {
	file_not_found: {
		pattern: /ENOENT|file.*not found|no such file or directory/i,
		action: async (
			_errorMessage: string,
			_toolName: string,
			toolArgs: Record<string, unknown>,
			ledger: StruggleLedger,
		) => {
			const { shouldEscalate } = ledger.record("file_not_found")

			if (shouldEscalate) {
				return {
					type: "escalate" as const,
					message: "File not found after 2 retries. Please specify the correct file path.",
				}
			}

			// Auto-fix: list the parent directory so the model can pick the right file
			const filePath = (toolArgs as any)?.path ?? (toolArgs as any)?.file_path ?? ""
			const dir = path.dirname(String(filePath))
			try {
				const [files] = await listFiles(dir, false, 50)
				if (files.length > 0) {
					return {
						type: "retry" as const,
						message: `File "${filePath}" not found. Found files in "${dir}": ${files.slice(0, 10).join(", ")}${files.length > 10 ? `…and ${files.length - 10} more` : ""}`,
					}
				}
				return {
					type: "retry" as const,
					message: `File "${filePath}" not found. Directory "${dir}" appears empty or does not exist.`,
				}
			} catch {
				return {
					type: "retry" as const,
					message: `File "${filePath}" not found. Could not list directory "${dir}".`,
				}
			}
		},
	},
	module_not_found: {
		pattern: /cannot find module|no module named|module_not_found|pkg_resources\.distributionnotfound/i,
		action: async (
			errorMessage: string,
			_toolName: string,
			_toolArgs: Record<string, unknown>,
			ledger: StruggleLedger,
		) => {
			const { shouldEscalate } = ledger.record("module_not_found")
			if (shouldEscalate) {
				return {
					type: "escalate" as const,
					message:
						"Missing dependency could not be resolved automatically. Please check your package dependencies.",
				}
			}
			return {
				type: "retry" as const,
				message: `Missing dependency detected: ${errorMessage.slice(0, 300)}. Please install the required package or verify your environment configuration rather than repeating the failing command.`,
			}
		},
	},
	port_in_use: {
		pattern: /EADDRINUSE|address already in use|port.*already in use/i,
		action: async (
			errorMessage: string,
			_toolName: string,
			_toolArgs: Record<string, unknown>,
			ledger: StruggleLedger,
		) => {
			const { shouldEscalate } = ledger.record("port_in_use")
			if (shouldEscalate) {
				return {
					type: "escalate" as const,
					message:
						"Port is already in use by another process. Please terminate the conflicting process or choose another port.",
				}
			}
			return {
				type: "retry" as const,
				message: `Port conflict detected: ${errorMessage.slice(0, 200)}. Use a different port or check running terminals/processes.`,
			}
		},
	},
}

/**
 * Manages the main agentic loop of a Task — initiating the task loop and
 * recursively making mirror (LLM) requests.
 *
 * This is the highest-risk extraction from Task.ts.  It handles:
 * - The outer `initiateTaskLoop` that re-queues user feedback
 * - The inner `recursivelyMakeMirrorRequests` stack-based loop
 * - Streaming response processing (text, tool_use, reasoning, grounding)
 * - Inline usage capture from stream chunks
 * - Retry / backoff logic for streaming failures and empty responses
 */
export class TaskMainLoop {
	constructor(private readonly task: Task) {}

	// ──────────────────────────────────────────────────────
	//  initiateTaskLoop
	// ──────────────────────────────────────────────────────

	/**
	 * Kicks off the checkpoints initialization process in the background,
	 * then repeatedly calls `recursivelyMakeMirrorRequests` until the task
	 * completes or is aborted.
	 *
	 * When the inner loop returns `true` (didEndLoop) the method checks for
	 * queued user messages and feeds them back as new user content.
	 */
	async initiateTaskLoop(userContent: Anthropic.Messages.ContentBlockParam[]): Promise<void> {
		// Kicks off the checkpoints initialization process in the background.
		getCheckpointService(this.task)

		let nextUserContent = userContent
		let includeFileDetails = true

		// Reset abort and streaming flags to ensure clean loop execution
		this.task.abort = false
		this.task.abandoned = false
		this.task.abortReason = undefined
		this.task.didFinishAbortingStream = false
		this.task.isStreaming = false
		this.task.isWaitingForFirstChunk = false

		this.task.emit(MirrorVSEventName.TaskStarted)
		this.task.isLoopActive = true

		try {
			while (!this.task.abort) {
				const didEndLoop = await this.recursivelyMakeMirrorRequests(nextUserContent, includeFileDetails)
				includeFileDetails = false // We only need file details the first time.

				// The way this agentic loop works is that mirror will be given a
				// task that he then calls tools to complete. Unless there's an
				// attempt_completion call, we keep responding back to him with his
				// tool's responses until he either attempt_completion or does not
				// use anymore tools. If he does not use anymore tools, we ask him
				// to consider if he's completed the task and then call
				// attempt_completion, otherwise proceed with completing the task.
				// There is a MAX_REQUESTS_PER_TASK limit to prevent infinite
				// requests, but Mirror is prompted to finish the task as efficiently
				// as he can.

				if (didEndLoop) {
					// Process one queued message at a time after each task loop
					// completes. Instead of draining all messages at once, we take
					// one, submit it as a new user message, and continue the loop.
					// Subsequent queued messages are handled on the next iteration,
					// preventing mid-workflow interruptions while ensuring all
					// messages eventually get processed.
					const queued = this.task.messageQueueService.dequeueMessage()
					if (queued) {
						await this.task.say("user_feedback", queued.text, queued.images)

						const imageBlocks: Anthropic.ImageBlockParam[] = formatResponse.imageBlocks(queued.images)
						nextUserContent = [
							{ type: "text" as const, text: `<user_message>\n${queued.text}\n</user_message>` },
							...imageBlocks,
						]
						includeFileDetails = true
						continue
					}

					// For now a task never 'completes'. This will only happen if
					// the user hits max requests and denies resetting the count.
					break
				} else {
					nextUserContent = [{ type: "text", text: formatResponse.noToolsUsed() }]
				}
			}
		} finally {
			this.task.isLoopActive = false
		}
	}

	// ──────────────────────────────────────────────────────
	//  recursivelyMakeMirrorRequests
	// ──────────────────────────────────────────────────────

	public async recursivelyMakeMirrorRequests(
		userContent: Anthropic.Messages.ContentBlockParam[],
		includeFileDetails: boolean = false,
	): Promise<boolean> {
		interface StackItem {
			userContent: Anthropic.Messages.ContentBlockParam[]
			includeFileDetails: boolean
			retryAttempt?: number
			userMessageWasRemoved?: boolean // Track if user message was removed due to empty response
		}

		const stack: StackItem[] = [{ userContent, includeFileDetails, retryAttempt: 0 }]

		while (stack.length > 0) {
			const currentItem = stack.pop()!
			const currentUserContent = currentItem.userContent
			const currentIncludeFileDetails = currentItem.includeFileDetails

			if (this.task.abort) {
				throw new Error(
					`[MirrorVS#recursivelyMakeMirrorRequests] task ${this.task.taskId}.${this.task.instanceId} aborted`,
				)
			}

			// Drain any in-between steering messages sent by the user during execution
			while (this.task.inBetweenMessages.length > 0) {
				const inBetween = this.task.inBetweenMessages.shift()
				if (inBetween) {
					currentUserContent.push(
						{
							type: "text" as const,
							text: `<user_message>\n${inBetween.text}\n</user_message>`,
						},
						...formatResponse.imageBlocks(inBetween.images),
					)
				}
			}

			if (
				this.task.consecutiveMistakeLimit > 0 &&
				this.task.consecutiveMistakeCount >= this.task.consecutiveMistakeLimit
			) {
				const { response, text, images } = await this.task.ask(
					"mistake_limit_reached",
					t("common:errors.mistake_limit_guidance"),
				)

				if (response === "messageResponse") {
					currentUserContent.push(
						...[
							{ type: "text" as const, text: formatResponse.tooManyMistakes(text) },
							...formatResponse.imageBlocks(images),
						],
					)

					await this.task.say("user_feedback", text, images)
				}

				this.task.consecutiveMistakeCount = 0
			}

			// Getting verbose details is an expensive operation, it uses ripgrep to
			// top-down build file structure of project which for large projects can
			// take a few seconds. For the best UX we show a placeholder api_req_started
			// message with a loading spinner as this happens.

			// Determine API protocol based on provider and model
			const modelId = getModelId(this.task.apiConfiguration)
			const apiProvider = this.task.apiConfiguration.apiProvider
			const apiProtocol = getApiProtocol(
				apiProvider && !isRetiredProvider(apiProvider) ? apiProvider : undefined,
				modelId,
			)

			// Respect user-configured provider rate limiting BEFORE we emit api_req_started.
			// This prevents the UI from showing an "API Request..." spinner while we are
			// intentionally waiting due to the rate limit slider.
			//
			// NOTE: We also set Task.lastGlobalApiRequestTime here to reserve this slot
			// before we build environment details (which can take time).
			// This ensures subsequent requests (including subtasks) still honour the
			// provider rate-limit window.
			await this.task.maybeWaitForProviderRateLimit(currentItem.retryAttempt ?? 0)
			Task.lastGlobalApiRequestTime = performance.now()

			await this.task.say(
				"api_req_started",
				JSON.stringify({
					apiProtocol,
				}),
			)

			const provider = this.task.providerRef.deref()
			const state = provider ? await provider.getState() : undefined

			const showMirrorIgnoredFiles = state?.showMirrorIgnoredFiles ?? false
			const includeDiagnosticMessages = state?.includeDiagnosticMessages ?? true
			const maxDiagnosticMessages = state?.maxDiagnosticMessages ?? 50
			const currentMode = state?.mode ?? defaultModeSlug

			const { content: parsedUserContent, mode: slashCommandMode } = await processUserContentMentions({
				userContent: currentUserContent,
				cwd: this.task.cwd,
				fileContextTracker: this.task.fileContextTracker,
				mirrorIgnoreController: this.task.mirrorIgnoreController,
				showMirrorIgnoredFiles,
				includeDiagnosticMessages,
				maxDiagnosticMessages,
				skillsManager: provider?.getSkillsManager(),
				currentMode,
			})

			// Switch mode if specified in a slash command's frontmatter
			if (slashCommandMode) {
				const provider = this.task.providerRef.deref()
				if (provider) {
					const state = await provider.getState()
					const targetMode = getModeBySlug(slashCommandMode, state?.customModes)
					if (targetMode) {
						await provider.handleModeSwitch(slashCommandMode)
					}
				}
			}

			const environmentDetails = await getEnvironmentDetails(this.task, currentIncludeFileDetails, currentMode)

			// Remove any existing environment_details blocks before adding fresh ones.
			// This prevents duplicate environment details when resuming tasks,
			// where the old user message content may already contain environment details from the previous session.
			// We check for both opening and closing tags to ensure we're matching complete environment detail blocks,
			// not just mentions of the tag in regular content.
			const contentWithoutEnvDetails = parsedUserContent.filter((block) => {
				if (block.type === "text" && typeof block.text === "string") {
					// Check if this text block is a complete environment_details block
					// by verifying it starts with the opening tag and ends with the closing tag
					const isEnvironmentDetailsBlock =
						block.text.trim().startsWith("<environment_details>") &&
						block.text.trim().endsWith("</environment_details>")
					return !isEnvironmentDetailsBlock
				}
				return true
			})

			// Add environment details as its own text block, separate from tool
			// results.
			let finalUserContent = [...contentWithoutEnvDetails, { type: "text" as const, text: environmentDetails }]
			// Only add user message to conversation history if:
			// 1. This is the first attempt (retryAttempt === 0), AND
			// 2. The original userContent was not empty (empty signals delegation resume where
			//    the user message with tool_result and env details is already in history), OR
			// 3. The message was removed in a previous iteration (userMessageWasRemoved === true)
			// This prevents consecutive user messages while allowing re-add when needed
			const isEmptyUserContent = currentUserContent.length === 0
			const shouldAddUserMessage =
				((currentItem.retryAttempt ?? 0) === 0 && !isEmptyUserContent) || currentItem.userMessageWasRemoved
			if (shouldAddUserMessage) {
				await this.task.conversationHistory.addToApiConversationHistory({
					role: "user",
					content: finalUserContent,
				})
			}

			// Since we sent off a placeholder api_req_started message to update the
			// webview while waiting to actually start the API request (to load
			// potential details for example), we need to update the text of that
			// message.
			const lastApiReqIndex = findLastIndex(this.task.mirrorMessages, (m) => m.say === "api_req_started")

			this.task.mirrorMessages[lastApiReqIndex].text = JSON.stringify({
				apiProtocol,
			} satisfies MirrorApiReqInfo)

			await this.task.mirrorMessagesManager.saveMirrorMessages()
			await this.task.providerRef.deref()?.postStateToWebviewWithoutTaskHistory()

			try {
				let cacheWriteTokens = 0
				let cacheReadTokens = 0
				let inputTokens = 0
				let outputTokens = 0
				let totalCost: number | undefined

				// We can't use `api_req_finished` anymore since it's a unique case
				// where it could come after a streaming message (i.e. in the middle
				// of being updated or executed).
				// Fortunately `api_req_finished` was always parsed out for the GUI
				// anyways, so it remains solely for legacy purposes to keep track
				// of prices in tasks from history (it's worth removing a few months
				// from now).
				const updateApiReqMsg = (cancelReason?: MirrorApiReqCancelReason, streamingFailedMessage?: string) => {
					if (lastApiReqIndex < 0 || !this.task.mirrorMessages[lastApiReqIndex]) {
						return
					}

					const existingData = JSON.parse(this.task.mirrorMessages[lastApiReqIndex].text || "{}")

					// Calculate total tokens and cost using provider-aware function
					const modelId = getModelId(this.task.apiConfiguration)
					const apiProvider = this.task.apiConfiguration.apiProvider
					const apiProtocol = getApiProtocol(
						apiProvider && !isRetiredProvider(apiProvider) ? apiProvider : undefined,
						modelId,
					)

					const costResult =
						apiProtocol === "anthropic"
							? calculateApiCostAnthropic(
									streamModelInfo,
									inputTokens,
									outputTokens,
									cacheWriteTokens,
									cacheReadTokens,
								)
							: calculateApiCostOpenAI(
									streamModelInfo,
									inputTokens,
									outputTokens,
									cacheWriteTokens,
									cacheReadTokens,
								)

					this.task.mirrorMessages[lastApiReqIndex].text = JSON.stringify({
						...existingData,
						tokensIn: costResult.totalInputTokens,
						tokensOut: costResult.totalOutputTokens,
						cacheWrites: cacheWriteTokens,
						cacheReads: cacheReadTokens,
						cost: totalCost ?? costResult.totalCost,
						cancelReason,
						streamingFailedMessage,
					} satisfies MirrorApiReqInfo)
				}

				const abortStream = async (cancelReason: MirrorApiReqCancelReason, streamingFailedMessage?: string) => {
					if (this.task.diffViewProvider.isEditing) {
						await this.task.diffViewProvider.revertChanges() // closes diff view
					}

					// if last message is a partial we need to update and save it
					const lastMessage = this.task.mirrorMessages.at(-1)

					if (lastMessage && lastMessage.partial) {
						// lastMessage.ts = Date.now() DO NOT update ts since it is used as a key for virtuoso list
						lastMessage.partial = false
						// instead of streaming partialMessage events, we do a save and post like normal to persist to disk
					}

					// Update `api_req_started` to have cancelled and cost, so that
					// we can display the cost of the partial stream and the cancellation reason
					updateApiReqMsg(cancelReason, streamingFailedMessage)
					await this.task.mirrorMessagesManager.saveMirrorMessages()

					// Signals to provider that it can retrieve the saved messages
					// from disk, as abortTask can not be awaited on in nature.
					this.task.didFinishAbortingStream = true
				}

				// Reset streaming state for each new API request
				this.task.currentStreamingContentIndex = 0
				this.task.currentStreamingDidCheckpoint = false
				this.task.assistantMessageContent = []
				this.task.didCompleteReadingStream = false
				this.task.userMessageContent = []
				this.task.userMessageContentReady = false
				this.task.didRejectTool = false
				this.task.didAlreadyUseTool = false
				this.task.assistantMessageSavedToHistory = false
				// Reset tool failure flag for each new assistant turn - this ensures that tool failures
				// only prevent attempt_completion within the same assistant message, not across turns
				// (e.g., if a tool fails, then user sends a message saying "just complete anyway")
				this.task.didToolFailInCurrentTurn = false
				this.task.presentAssistantMessageLocked = false
				this.task.presentAssistantMessageHasPendingUpdates = false
				// No legacy text-stream tool parser.
				this.task.streamingToolCallIndices.clear()
				// Clear any leftover streaming tool call state from previous interrupted streams
				NativeToolCallParser.clearAllStreamingToolCalls()
				NativeToolCallParser.clearRawChunkState()

				await this.task.diffViewProvider.reset()

				// Cache model info once per API request to avoid repeated calls during streaming
				// This is especially important for tools and background usage collection
				this.task.cachedStreamingModel = this.task.api.getModel()
				const streamModelInfo = this.task.cachedStreamingModel.info
				const cachedModelId = this.task.cachedStreamingModel.id

				// Yields only if the first chunk is successful, otherwise will
				// allow the user to retry the request (most likely due to rate
				// limit error, which gets thrown on the first chunk).
				const stream = this.task.attemptApiRequest(currentItem.retryAttempt ?? 0, {
					skipProviderRateLimit: true,
				})
				let assistantMessage = ""
				let reasoningMessage = ""
				let pendingGroundingSources: GroundingSource[] = []
				this.task.isStreaming = true

				try {
					const iterator = stream[Symbol.asyncIterator]()

					// Helper to race iterator.next() with abort signal
					const nextChunkWithAbort = async () => {
						const nextPromise = iterator.next()

						// If we have an abort controller, race it with the next chunk
						if (this.task.currentRequestAbortController) {
							const abortPromise = new Promise<never>((_, reject) => {
								const signal = this.task.currentRequestAbortController!.signal
								if (signal.aborted) {
									reject(new Error("Request cancelled by user"))
								} else {
									signal.addEventListener("abort", () => {
										reject(new Error("Request cancelled by user"))
									})
								}
							})
							return await Promise.race([nextPromise, abortPromise])
						}

						// No abort controller, just return the next chunk normally
						return await nextPromise
					}

					let item = await nextChunkWithAbort()
					while (!item.done) {
						const chunk = item.value
						item = await nextChunkWithAbort()
						if (!chunk) {
							// Sometimes chunk is undefined, no idea that can cause
							// it, but this workaround seems to fix it.
							continue
						}

						switch (chunk.type) {
							case "reasoning": {
								reasoningMessage += chunk.text
								// Only apply formatting if the message contains sentence-ending punctuation followed by **
								let formattedReasoning = reasoningMessage
								if (reasoningMessage.includes("**")) {
									// Add line breaks before **Title** patterns that appear after sentence endings
									// This targets section headers like "...end of sentence.**Title Here**"
									// Handles periods, exclamation marks, and question marks
									formattedReasoning = reasoningMessage.replace(
										/([.!?])\*\*([^*\n]+)\*\*/g,
										"$1\n\n**$2**",
									)
								}
								await this.task.say("reasoning", formattedReasoning, undefined, true)
								break
							}
							case "usage":
								inputTokens += chunk.inputTokens
								outputTokens += chunk.outputTokens
								cacheWriteTokens += chunk.cacheWriteTokens ?? 0
								cacheReadTokens += chunk.cacheReadTokens ?? 0
								totalCost = chunk.totalCost
								break
							case "grounding":
								// Handle grounding sources separately from regular content
								// to prevent state persistence issues - store them separately
								if (chunk.sources && chunk.sources.length > 0) {
									pendingGroundingSources.push(...chunk.sources)
								}
								break
							case "tool_call_partial": {
								// Process raw tool call chunk through NativeToolCallParser
								// which handles tracking, buffering, and emits events
								const events = NativeToolCallParser.processRawChunk({
									index: chunk.index,
									id: chunk.id,
									name: chunk.name,
									arguments: chunk.arguments,
								})

								for (const event of events) {
									if (event.type === "tool_call_start") {
										// Guard against duplicate tool_call_start events for the same tool ID.
										// This can occur due to stream retry, reconnection, or API quirks.
										// Without this check, duplicate tool_use blocks with the same ID would
										// be added to assistantMessageContent, causing API 400 errors:
										// "tool_use ids must be unique"
										if (this.task.streamingToolCallIndices.has(event.id)) {
											console.warn(
												`[Task#${this.task.taskId}] Ignoring duplicate tool_call_start for ID: ${event.id} (tool: ${event.name})`,
											)
											continue
										}

										// Initialize streaming in NativeToolCallParser
										NativeToolCallParser.startStreamingToolCall(event.id, event.name as ToolName)

										// Before adding a new tool, finalize any preceding text block
										// This prevents the text block from blocking tool presentation
										const lastBlock =
											this.task.assistantMessageContent[
												this.task.assistantMessageContent.length - 1
											]
										if (lastBlock?.type === "text" && lastBlock.partial) {
											lastBlock.partial = false
										}

										// Track the index where this tool will be stored
										const toolUseIndex = this.task.assistantMessageContent.length
										this.task.streamingToolCallIndices.set(event.id, toolUseIndex)

										// Create initial partial tool use
										const partialToolUse: ToolUse = {
											type: "tool_use",
											name: event.name as ToolName,
											params: {},
											partial: true,
										}

										// Store the ID for native protocol
										;(partialToolUse as any).id = event.id

										// Add to content and present
										this.task.assistantMessageContent.push(partialToolUse)
										this.task.userMessageContentReady = false
										presentAssistantMessage(this.task)
									} else if (event.type === "tool_call_delta") {
										// Process chunk using streaming JSON parser
										const partialToolUse = NativeToolCallParser.processStreamingChunk(
											event.id,
											event.delta,
										)

										if (partialToolUse) {
											// Get the index for this tool call
											const toolUseIndex = this.task.streamingToolCallIndices.get(event.id)
											if (toolUseIndex !== undefined) {
												// Store the ID for native protocol
												;(partialToolUse as any).id = event.id

												// Update the existing tool use with new partial data
												this.task.assistantMessageContent[toolUseIndex] = partialToolUse

												// Present updated tool use
												presentAssistantMessage(this.task)
											}
										}
									} else if (event.type === "tool_call_end") {
										// Finalize the streaming tool call
										const finalToolUse = NativeToolCallParser.finalizeStreamingToolCall(event.id)

										// Get the index for this tool call
										const toolUseIndex = this.task.streamingToolCallIndices.get(event.id)

										if (finalToolUse) {
											// Store the tool call ID
											;(finalToolUse as any).id = event.id

											// Get the index and replace partial with final
											if (toolUseIndex !== undefined) {
												this.task.assistantMessageContent[toolUseIndex] = finalToolUse
											}

											// Clean up tracking
											this.task.streamingToolCallIndices.delete(event.id)

											// Mark that we have new content to process
											this.task.userMessageContentReady = false

											// Present the finalized tool call
											presentAssistantMessage(this.task)
										} else if (toolUseIndex !== undefined) {
											// finalizeStreamingToolCall returned null (malformed JSON or missing args)
											// Mark the tool as non-partial so it's presented as complete, but execution
											// will be short-circuited in presentAssistantMessage with a structured tool_result.
											const existingToolUse = this.task.assistantMessageContent[toolUseIndex]
											if (existingToolUse && existingToolUse.type === "tool_use") {
												existingToolUse.partial = false
												// Ensure it has the ID for native protocol
												;(existingToolUse as any).id = event.id
											}

											// Clean up tracking
											this.task.streamingToolCallIndices.delete(event.id)

											// Mark that we have new content to process
											this.task.userMessageContentReady = false

											// Present the tool call - validation will handle missing params
											presentAssistantMessage(this.task)
										}
									}
								}
								break
							}

							case "tool_call": {
								// Legacy: Handle complete tool calls (for backward compatibility)
								// Convert native tool call to ToolUse format
								const toolUse = NativeToolCallParser.parseToolCall({
									id: chunk.id,
									name: chunk.name as ToolName,
									arguments: chunk.arguments,
								})

								if (!toolUse) {
									console.error(`Failed to parse tool call for task ${this.task.taskId}:`, chunk)
									break
								}

								// Store the tool call ID on the ToolUse object for later reference
								// This is needed to create tool_result blocks that reference the correct tool_use_id
								toolUse.id = chunk.id

								// Add the tool use to assistant message content
								this.task.assistantMessageContent.push(toolUse)

								// Mark that we have new content to process
								this.task.userMessageContentReady = false

								// Present the tool call to user - presentAssistantMessage will execute
								// tools sequentially and accumulate all results in userMessageContent
								presentAssistantMessage(this.task)
								break
							}
							case "text": {
								assistantMessage += chunk.text

								// Native tool calling: text chunks are plain text.
								// Create or update a text content block directly
								const lastBlock =
									this.task.assistantMessageContent[this.task.assistantMessageContent.length - 1]
								if (lastBlock?.type === "text" && lastBlock.partial) {
									lastBlock.content = assistantMessage
								} else {
									this.task.assistantMessageContent.push({
										type: "text",
										content: assistantMessage,
										partial: true,
									})
									this.task.userMessageContentReady = false
								}
								presentAssistantMessage(this.task)
								break
							}
						}

						if (this.task.abort) {
							console.log(`aborting stream, this.task.abandoned = ${this.task.abandoned}`)

							if (!this.task.abandoned) {
								// Only need to gracefully abort if this instance
								// isn't abandoned (sometimes OpenRouter stream
								// hangs, in which case this would affect future
								// instances of Mirror).
								await abortStream("user_cancelled")
							}

							break // Aborts the stream.
						}

						if (this.task.didRejectTool) {
							// `userContent` has a tool rejection, so interrupt the
							// assistant's response to present the user's feedback.
							assistantMessage += "\n\n[Response interrupted by user feedback]"
							// Instead of setting this preemptively, we allow the
							// present iterator to finish and set
							// userMessageContentReady when its ready.
							// this.task.userMessageContentReady = true
							break
						}

						if (this.task.didAlreadyUseTool) {
							assistantMessage +=
								"\n\n[Response interrupted by a tool use result. Only one tool may be used at a time and should be placed at the end of the message.]"
							break
						}
					}

					// Persist final token usage to the API request message
					// The main loop already captured all usage chunks inline (case "usage"),
					// so we just need to update the message and save.
					updateApiReqMsg()

					// Fire-and-forget the disk write so the main loop isn't blocked
					;(async () => {
						try {
							await this.task.mirrorMessagesManager.saveMirrorMessages()
							const apiReqMessage = this.task.mirrorMessages[lastApiReqIndex]
							if (apiReqMessage) {
								await this.task.mirrorMessagesManager.updateMirrorMessage(apiReqMessage)
							}
						} catch (error) {
							console.error("Failed to persist usage data:", error)
						}
					})()
				} catch (error) {
					// Abandoned happens when extension is no longer waiting for the
					// Mirror instance to finish aborting (error is thrown here when
					// any function in the for loop throws due to this.task.abort).
					if (!this.task.abandoned) {
						// Determine cancellation reason
						const cancelReason: MirrorApiReqCancelReason = this.task.abort
							? "user_cancelled"
							: "streaming_failed"

						const rawErrorMessage = (error as any).message ?? JSON.stringify(serializeError(error), null, 2)
						const streamingFailedMessage = this.task.abort
							? undefined
							: `${t("common:interruption.streamTerminatedByProvider")}: ${rawErrorMessage}`

						// Clean up partial state
						await abortStream(cancelReason, streamingFailedMessage)

						if (this.task.abort) {
							// User cancelled - abort the entire task
							this.task.abortReason = cancelReason
							await this.task.abortTask()
						} else {
							// Stream failed - log the error and retry with the same content
							// The existing rate limiting will prevent rapid retries
							console.error(
								`[Task#${this.task.taskId}.${this.task.instanceId}] Stream failed, will retry: ${streamingFailedMessage}`,
							)

							// Apply exponential backoff similar to first-chunk errors when auto-resubmit is
							// enabled. Transient provider capacity errors (overloaded 529, rate limit 429,
							// unavailable 503) also auto-retry even without auto-approval so concurrent
							// multi-tab use doesn't dump the raw "provider couldn't process the request"
							// error on the user.
							const stateForBackoff = await this.task.providerRef.deref()?.getState()
							if (stateForBackoff?.autoApprovalEnabled || isTransientProviderError(error)) {
								await this.task.backoffAndAnnounce(currentItem.retryAttempt ?? 0, error)

								// Check if task was aborted during the backoff
								if (this.task.abort) {
									console.log(
										`[Task#${this.task.taskId}.${this.task.instanceId}] Task aborted during mid-stream retry backoff`,
									)
									// Abort the entire task
									this.task.abortReason = "user_cancelled"
									await this.task.abortTask()
									break
								}
							}

							// Push the same content back onto the stack to retry, incrementing the retry attempt counter
							stack.push({
								userContent: currentUserContent,
								includeFileDetails: false,
								retryAttempt: (currentItem.retryAttempt ?? 0) + 1,
							})

							// Continue to retry the request
							continue
						}
					}
				} finally {
					this.task.isStreaming = false
					// Clean up the abort controller when streaming completes
					this.task.currentRequestAbortController = undefined
				}

				// Need to call here in case the stream was aborted.
				if (this.task.abort || this.task.abandoned) {
					throw new Error(
						`[MirrorVS#recursivelyMakeMirrorRequests] task ${this.task.taskId}.${this.task.instanceId} aborted`,
					)
				}

				this.task.didCompleteReadingStream = true

				// Set any blocks to be complete to allow `presentAssistantMessage`
				// to finish and set `userMessageContentReady` to true.
				// (Could be a text block that had no subsequent tool uses, or a
				// text block at the very end, or an invalid tool use, etc. Whatever
				// the case, `presentAssistantMessage` relies on these blocks either
				// to be completed or the user to reject a block in order to proceed
				// and eventually set userMessageContentReady to true.)

				// Finalize any remaining streaming tool calls that weren't explicitly ended
				// This is critical for MCP tools which need tool_call_end events to be properly
				// converted from ToolUse to McpToolUse via finalizeStreamingToolCall()
				const finalizeEvents = NativeToolCallParser.finalizeRawChunks()
				for (const event of finalizeEvents) {
					if (event.type === "tool_call_end") {
						// Finalize the streaming tool call
						const finalToolUse = NativeToolCallParser.finalizeStreamingToolCall(event.id)

						// Get the index for this tool call
						const toolUseIndex = this.task.streamingToolCallIndices.get(event.id)

						if (finalToolUse) {
							// Store the tool call ID
							;(finalToolUse as any).id = event.id

							// Get the index and replace partial with final
							if (toolUseIndex !== undefined) {
								this.task.assistantMessageContent[toolUseIndex] = finalToolUse
							}

							// Clean up tracking
							this.task.streamingToolCallIndices.delete(event.id)

							// Mark that we have new content to process
							this.task.userMessageContentReady = false

							// Present the finalized tool call
							presentAssistantMessage(this.task)
						} else if (toolUseIndex !== undefined) {
							// finalizeStreamingToolCall returned null (malformed JSON or missing args)
							// We still need to mark the tool as non-partial so it gets executed
							// The tool's validation will catch any missing required parameters
							const existingToolUse = this.task.assistantMessageContent[toolUseIndex]
							if (existingToolUse && existingToolUse.type === "tool_use") {
								existingToolUse.partial = false
								// Ensure it has the ID for native protocol
								;(existingToolUse as any).id = event.id
							}

							// Clean up tracking
							this.task.streamingToolCallIndices.delete(event.id)

							// Mark that we have new content to process
							this.task.userMessageContentReady = false

							// Present the tool call - validation will handle missing params
							presentAssistantMessage(this.task)
						}
					}
				}

				// IMPORTANT: Capture partialBlocks AFTER finalizeRawChunks() to avoid double-presentation.
				// Tools finalized above are already presented, so we only want blocks still partial after finalization.
				const partialBlocks = this.task.assistantMessageContent.filter((block) => block.partial)
				partialBlocks.forEach((block) => (block.partial = false))

				// Can't just do this b/c a tool could be in the middle of executing.
				// this.task.assistantMessageContent.forEach((e) => (e.partial = false))

				// No legacy streaming parser to finalize.

				// Note: updateApiReqMsg() is now called from within drainStreamInBackgroundToFindAllUsage
				// to ensure usage data is captured even when the stream is interrupted. The background task
				// uses local variables to accumulate usage data before atomically updating the shared state.

				// Complete the reasoning message if it exists
				// We can't use say() here because the reasoning message may not be the last message
				// (other messages like text blocks or tool uses may have been added after it during streaming)
				if (reasoningMessage) {
					const lastReasoningIndex = findLastIndex(
						this.task.mirrorMessages,
						(m) => m.type === "say" && m.say === "reasoning",
					)

					if (lastReasoningIndex !== -1 && this.task.mirrorMessages[lastReasoningIndex].partial) {
						this.task.mirrorMessages[lastReasoningIndex].partial = false
						await this.task.mirrorMessagesManager.updateMirrorMessage(
							this.task.mirrorMessages[lastReasoningIndex],
						)
					}
				}

				await this.task.mirrorMessagesManager.saveMirrorMessages()
				await this.task.providerRef.deref()?.postStateToWebviewWithoutTaskHistory()

				// No legacy text-stream tool parser state to reset.

				// CRITICAL: Save assistant message to API history BEFORE executing tools.
				// This ensures that when new_task triggers delegation and calls flushPendingToolResultsToHistory(),
				// the assistant message is already in history. Otherwise, tool_result blocks would appear
				// BEFORE their corresponding tool_use blocks, causing API errors.

				// Check if we have any content to process (text or tool uses)
				const hasTextContent = assistantMessage.length > 0

				const hasToolUses = this.task.assistantMessageContent.some(
					(block) => block.type === "tool_use" || block.type === "mcp_tool_use",
				)

				if (hasTextContent || hasToolUses) {
					// Reset counter when we get a successful response with content
					this.task.consecutiveNoAssistantMessagesCount = 0
					// Display grounding sources to the user if they exist
					if (pendingGroundingSources.length > 0) {
						const citationLinks = pendingGroundingSources.map((source, i) => `[${i + 1}](${source.url})`)
						const sourcesText = `${t("common:gemini.sources")} ${citationLinks.join(", ")}`

						await this.task.say("text", sourcesText, undefined, false, undefined, undefined, {
							isNonInteractive: true,
						})
					}

					// Build the assistant message content array
					const assistantContent: Array<Anthropic.TextBlockParam | Anthropic.ToolUseBlockParam> = []

					// Add text content if present
					if (assistantMessage) {
						assistantContent.push({
							type: "text" as const,
							text: assistantMessage,
						})
					}

					// Add tool_use blocks with their IDs for native protocol
					// This handles both regular ToolUse and McpToolUse types
					// IMPORTANT: Track seen IDs to prevent duplicates in the API request.
					// Duplicate tool_use IDs cause Anthropic API 400 errors:
					// "tool_use ids must be unique"
					const seenToolUseIds = new Set<string>()
					const toolUseBlocks = this.task.assistantMessageContent.filter(
						(block) => block.type === "tool_use" || block.type === "mcp_tool_use",
					)
					for (const block of toolUseBlocks) {
						if (block.type === "mcp_tool_use") {
							// McpToolUse already has the original tool name (e.g., "mcp_serverName_toolName")
							// The arguments are the raw tool arguments (matching the simplified schema)
							const mcpBlock = block as import("../../shared/tools").McpToolUse
							if (mcpBlock.id) {
								const sanitizedId = sanitizeToolUseId(mcpBlock.id)
								// Pre-flight deduplication: Skip if we've already added this ID
								if (seenToolUseIds.has(sanitizedId)) {
									console.warn(
										`[Task#${this.task.taskId}] Pre-flight deduplication: Skipping duplicate MCP tool_use ID: ${sanitizedId} (tool: ${mcpBlock.name})`,
									)
									continue
								}
								seenToolUseIds.add(sanitizedId)
								assistantContent.push({
									type: "tool_use" as const,
									id: sanitizedId,
									name: mcpBlock.name,
									input: mcpBlock.arguments,
								})
							}
						} else {
							// Regular ToolUse
							const toolUse = block as import("../../shared/tools").ToolUse
							const toolCallId = toolUse.id
							if (toolCallId) {
								const sanitizedId = sanitizeToolUseId(toolCallId)
								// Pre-flight deduplication: Skip if we've already added this ID
								if (seenToolUseIds.has(sanitizedId)) {
									console.warn(
										`[Task#${this.task.taskId}] Pre-flight deduplication: Skipping duplicate tool_use ID: ${sanitizedId} (tool: ${toolUse.name})`,
									)
									continue
								}
								seenToolUseIds.add(sanitizedId)
								const input = toolUse.nativeArgs || toolUse.params

								// Use originalName (alias) if present for API history consistency.
								// When tool aliases are used (e.g., "edit_file" -> "search_and_replace" -> "edit" (current canonical name)),
								// we want the alias name in the conversation history to match what the model
								// was told the tool was named, preventing confusion in multi-turn conversations.
								const toolNameForHistory = toolUse.originalName ?? toolUse.name

								assistantContent.push({
									type: "tool_use" as const,
									id: sanitizedId,
									name: toolNameForHistory,
									input,
								})
							}
						}
					}

					// Enforce new_task isolation: if new_task is called alongside other tools,
					// truncate any tools that come after it and inject error tool_results.
					// This prevents orphaned tools when delegation disposes the parent task.
					const newTaskIndex = assistantContent.findIndex(
						(block) => block.type === "tool_use" && block.name === "new_task",
					)

					if (newTaskIndex !== -1 && newTaskIndex < assistantContent.length - 1) {
						const truncatedTools = assistantContent.slice(newTaskIndex + 1)
						assistantContent.length = newTaskIndex + 1

						const executionNewTaskIndex = this.task.assistantMessageContent.findIndex(
							(block) => block.type === "tool_use" && block.name === "new_task",
						)
						if (executionNewTaskIndex !== -1) {
							this.task.assistantMessageContent.length = executionNewTaskIndex + 1
						}

						for (const tool of truncatedTools) {
							if (tool.type === "tool_use" && (tool as Anthropic.ToolUseBlockParam).id) {
								this.task.pushToolResultToUserContent({
									type: "tool_result",
									tool_use_id: (tool as Anthropic.ToolUseBlockParam).id,
									content:
										"This tool was not executed because new_task was called in the same message turn. The new_task tool must be the last tool in a message.",
									is_error: true,
								})
							}
						}
					}

					// Save assistant message BEFORE executing tools.
					await this.task.conversationHistory.addToApiConversationHistory(
						{ role: "assistant", content: assistantContent },
						reasoningMessage || undefined,
					)
					this.task.assistantMessageSavedToHistory = true
				}

				// Present any partial blocks that were just completed.
				// Tool calls are typically presented during streaming via tool_call_partial events,
				// but we still present here if any partial blocks remain (e.g., malformed streams).
				// NOTE: This MUST happen AFTER saving the assistant message to API history.
				// When new_task is in the batch, it triggers delegation which calls flushPendingToolResultsToHistory().
				// If the assistant message isn't saved yet, tool_results would appear before tool_use blocks.
				if (partialBlocks.length > 0) {
					// If there is content to update then it will complete and
					// update `this.task.userMessageContentReady` to true, which we
					// `pWaitFor` before making the next request.
					presentAssistantMessage(this.task)
				}

				if (hasTextContent || hasToolUses) {
					// NOTE: This comment is here for future reference - this was a
					// workaround for `userMessageContent` not getting set to true.
					// It was due to it not recursively calling for partial blocks
					// when `didRejectTool`, so it would get stuck waiting for a
					// partial block to complete before it could continue.
					// In case the content blocks finished it may be the api stream
					// finished after the last parsed content block was executed, so
					// we are able to detect out of bounds and set
					// `userMessageContentReady` to true (note you should not call
					// `presentAssistantMessage` since if the last block i
					//  completed it will be presented again).
					// const completeBlocks = this.task.assistantMessageContent.filter((block) => !block.partial) // If there are any partial blocks after the stream ended we can consider them invalid.
					// if (this.task.currentStreamingContentIndex >= completeBlocks.length) {
					// 	this.task.userMessageContentReady = true
					// }

					await pWaitFor(() => this.task.userMessageContentReady)

					// If the model did not tool use, then we need to tell it to
					// either use a tool or attempt_completion.
					const didToolUse = this.task.assistantMessageContent.some(
						(block) => block.type === "tool_use" || block.type === "mcp_tool_use",
					)

					const isBackgroundRunning = this.task.terminalProcess !== undefined
					if (!didToolUse) {
						// If background commands are running or model was conversing/answering without tools,
						// don't force a tool error loop. Let the model wait or complete the turn.
						if (isBackgroundRunning || this.task.consecutiveNoToolUseCount >= 1) {
							this.task.consecutiveNoToolUseCount = 0
						} else {
							// Increment consecutive no-tool-use counter
							this.task.consecutiveNoToolUseCount++

							// Only show error and count toward mistake limit after 2 consecutive failures
							if (this.task.consecutiveNoToolUseCount >= 2) {
								await this.task.say("error", "MODEL_NO_TOOLS_USED")
								// Only count toward mistake limit after second consecutive failure
								this.task.consecutiveMistakeCount++
							}

							// Use the task's locked protocol for consistent behavior
							this.task.userMessageContent.push({
								type: "text",
								text: formatResponse.noToolsUsed(),
							})
						}
					} else {
						// Reset counter when tools are used successfully
						this.task.consecutiveNoToolUseCount = 0
					}

					// Push to stack if there's content OR if we're paused waiting for a subtask.
					// When paused, we push an empty item so the loop continues to the pause check.
					if (this.task.userMessageContent.length > 0 || this.task.isPaused) {
						stack.push({
							userContent: [...this.task.userMessageContent], // Create a copy to avoid mutation issues
							includeFileDetails: false, // Subsequent iterations don't need file details
						})

						// Add periodic yielding to prevent blocking
						await new Promise((resolve) => setImmediate(resolve))
					}

					continue
				} else {
					// If there's no assistant_responses, that means we got no text
					// or tool_use content blocks from API which we should assume is
					// an error.

					// Increment consecutive no-assistant-messages counter
					this.task.consecutiveNoAssistantMessagesCount++

					// Only show error and count toward mistake limit after 2 consecutive failures
					// This provides a "grace retry" - first failure retries silently
					if (this.task.consecutiveNoAssistantMessagesCount >= 2) {
						await this.task.say("error", "MODEL_NO_ASSISTANT_MESSAGES")
					}

					// IMPORTANT: We already added the user message to
					// apiConversationHistory at line 1876. Since the assistant failed to respond,
					// we need to remove that message before retrying to avoid having two consecutive
					// user messages (which would cause tool_result validation errors).
					let state = await this.task.providerRef.deref()?.getState()
					if (this.task.apiConversationHistory.length > 0) {
						const lastMessage =
							this.task.apiConversationHistory[this.task.apiConversationHistory.length - 1]
						if (lastMessage.role === "user") {
							// Remove the last user message that we added earlier
							this.task.apiConversationHistory.pop()
						}
					}

					// Check if we should auto-retry or prompt the user
					// Reuse the state variable from above
					if (state?.autoApprovalEnabled) {
						// Auto-retry with backoff - don't persist failure message when retrying
						await this.task.backoffAndAnnounce(
							currentItem.retryAttempt ?? 0,
							new Error(
								"Unexpected API Response: The language model did not provide any assistant messages. This may indicate an issue with the API or the model's output.",
							),
						)

						// Check if task was aborted during the backoff
						if (this.task.abort) {
							console.log(
								`[Task#${this.task.taskId}.${this.task.instanceId}] Task aborted during empty-assistant retry backoff`,
							)
							break
						}

						// Push the same content back onto the stack to retry, incrementing the retry attempt counter
						// Mark that user message was removed so it gets re-added on retry
						stack.push({
							userContent: currentUserContent,
							includeFileDetails: false,
							retryAttempt: (currentItem.retryAttempt ?? 0) + 1,
							userMessageWasRemoved: true,
						})

						// Continue to retry the request
						continue
					} else {
						// Prompt the user for retry decision
						const { response } = await this.task.ask(
							"api_req_failed",
							"The model returned no assistant messages. This may indicate an issue with the API or the model's output.",
						)

						if (response === "yesButtonClicked") {
							await this.task.say("api_req_retried")

							// Push the same content back to retry
							stack.push({
								userContent: currentUserContent,
								includeFileDetails: false,
								retryAttempt: (currentItem.retryAttempt ?? 0) + 1,
							})

							// Continue to retry the request
							continue
						} else {
							// User demirrord to retry
							// Re-add the user message we removed.
							await this.task.conversationHistory.addToApiConversationHistory({
								role: "user",
								content: currentUserContent,
							})

							await this.task.say(
								"error",
								"Unexpected API Response: The language model did not provide any assistant messages. This may indicate an issue with the API or the model's output.",
							)

							await this.task.conversationHistory.addToApiConversationHistory({
								role: "assistant",
								content: [{ type: "text", text: "Failure: I did not provide a response." }],
							})
						}
					}
				}

				// If we reach here without continuing, return true (turn ended normally)
				return true
			} catch (error) {
				// This should never happen since the only thing that can throw an
				// error is the attemptApiRequest, which is wrapped in a try catch
				// that sends an ask where if noButtonClicked, will clear current
				// task and destroy this instance. However to avoid unhandled
				// promise rejection, we will end this loop which will end execution
				// of this instance (see `startTask`).
				return true // Needs to be true so parent loop knows to end task.
			}
		}

		// If we exit the while loop normally (stack is empty), return true (turn ended normally)
		return true
	}
}

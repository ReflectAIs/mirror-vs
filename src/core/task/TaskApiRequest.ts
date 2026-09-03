import * as vscode from "vscode"
import pWaitFor from "p-wait-for"
import delay from "delay"
import { serializeError } from "serialize-error"

import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI from "openai"

import {
	type ContextCondense,
	type ContextTruncation,
	type MirrorMessage,
	type ToolName,
	type ModelInfo,
	type TokenUsage,
} from "@mirror-vs/types"

import { ApiHandler, ApiHandlerCreateMessageMetadata } from "../../api"
import { ApiStream } from "../../api/transform/stream"
import { maybeRemoveImageBlocks } from "../../api/transform/image-cleaning"
import { getModelMaxOutputTokens } from "../../shared/api"
import { Package } from "../../shared/package"
import { SYSTEM_PROMPT } from "../prompts/system"
import { McpHub } from "../../services/mcp/McpHub"
import { McpServerManager } from "../../services/mcp/McpServerManager"
import { buildNativeToolsArrayWithRestrictions } from "./build-tools"
import { manageContext, willManageContext } from "../context-management"
import { checkContextWindowExceededError } from "../context/context-management/context-error-handling"
import { getEnvironmentDetails } from "../environment/getEnvironmentDetails"
import { getMessagesSinceLastSummary, getEffectiveApiHistory } from "../condense"
import { mergeConsecutiveApiMessages } from "./mergeConsecutiveApiMessages"
import { defaultModeSlug } from "../../shared/modes"
import { type ApiMessage } from "../task-persistence"
import { Task } from "./Task"
import { isTransientProviderError } from "./transient-error"

const MAX_EXPONENTIAL_BACKOFF_SECONDS = 600 // 10 minutes
const FORCED_CONTEXT_REDUCTION_PERCENT = 75 // Keep 75% of context (remove 25%) on context window errors
const MAX_CONTEXT_WINDOW_RETRIES = 3 // Maximum retries for context window errors

/**
 * Manages the API request lifecycle for a Task — building the request,
 * streaming responses, handling retries/backoff, and cleaning conversation
 * history before sending it to the provider.
 *
 * Extracted from Task.ts to reduce its size and isolate concerns.
 */
export class TaskApiRequest {
	constructor(private readonly task: Task) {}

	// ──────────────────────────────────────────────────────────────
	//  System Prompt
	// ──────────────────────────────────────────────────────────────

	async getSystemPrompt(): Promise<string> {
		const { mcpEnabled } = (await this.task.providerRef.deref()?.getState()) ?? {}
		let mcpHub: McpHub | undefined
		if (mcpEnabled ?? true) {
			const provider = this.task.providerRef.deref()

			if (!provider) {
				throw new Error("Provider reference lost during view transition")
			}

			// Wait for MCP hub initialization through McpServerManager
			mcpHub = await McpServerManager.getInstance(provider.context, provider)

			if (!mcpHub) {
				throw new Error("Failed to get MCP hub from server manager")
			}

			// Wait for MCP servers to be connected before generating system prompt
			await pWaitFor(() => !mcpHub!.isConnecting, { timeout: 10_000 }).catch(() => {
				console.error("MCP servers failed to connect in time")
			})
		}

		const mirrorIgnoreInstructions = this.task.mirrorIgnoreController?.getInstructions()

		const state = await this.task.providerRef.deref()?.getState()

		const {
			mode,
			customModes,
			customModePrompts,
			customInstructions,
			experiments,
			language,
			apiConfiguration,
			enableSubfolderRules,
		} = state ?? {}

		return await (async () => {
			const provider = this.task.providerRef.deref()

			if (!provider) {
				throw new Error("Provider not available")
			}

			const modelInfo = this.task.api.getModel().info

			return SYSTEM_PROMPT(
				provider.context,
				this.task.cwd,
				false,
				mcpHub,
				this.task.diffStrategy,
				mode ?? defaultModeSlug,
				customModePrompts,
				customModes,
				customInstructions,
				experiments,
				language,
				mirrorIgnoreInstructions,
				{
					todoListEnabled: apiConfiguration?.todoListEnabled ?? true,
					useAgentRules:
						vscode.workspace.getConfiguration(Package.name).get<boolean>("useAgentRules") ?? true,
					enableSubfolderRules: enableSubfolderRules ?? false,
					newTaskRequireTodos: vscode.workspace
						.getConfiguration(Package.name)
						.get<boolean>("newTaskRequireTodos", false),
					isStealthModel: modelInfo?.isStealthModel,
					reasoningEffort: apiConfiguration?.reasoningEffort,
					supportsNativeReasoning: !!(modelInfo?.supportsReasoningBudget || modelInfo?.supportsReasoningEffort),
				},
				undefined, // todoList
				this.task.api.getModel().id,
				provider.getSkillsManager(),
				await provider.buildSessionSharedContext(this.task.taskId),
			)
		})()
	}

	// ──────────────────────────────────────────────────────────────
	//  Profile Helpers
	// ──────────────────────────────────────────────────────────────

	private getCurrentProfileId(state: any): string {
		return (
			state?.listApiConfigMeta?.find((profile: any) => profile.name === state?.currentApiConfigName)?.id ??
			"default"
		)
	}

	// ──────────────────────────────────────────────────────────────
	//  Context Window Error Recovery
	// ──────────────────────────────────────────────────────────────

	private async handleContextWindowExceededError(): Promise<void> {
		if (this.task.contextManager.isCondensing) {
			await this.task.contextManager.condenseContext()
			return
		}

		const state = await this.task.providerRef.deref()?.getState()
		const { profileThresholds = {}, mode, apiConfiguration } = state ?? {}

		const { contextTokens } = this.task.getTokenUsage()
		const modelInfo = this.task.api.getModel().info

		const maxTokens = getModelMaxOutputTokens({
			modelId: this.task.api.getModel().id,
			model: modelInfo,
			settings: this.task.apiConfiguration,
		})

		const contextWindow = modelInfo.contextWindow

		// Get the current profile ID using the helper method
		const currentProfileId = this.getCurrentProfileId(state)

		// Log the context window error for debugging
		console.warn(
			`[Task#${this.task.taskId}] Context window exceeded for model ${this.task.api.getModel().id}. ` +
				`Current tokens: ${contextTokens}, Context window: ${contextWindow}. ` +
				`Forcing truncation to ${FORCED_CONTEXT_REDUCTION_PERCENT}% of current context.`,
		)

		// Send condenseTaskContextStarted to show in-progress indicator
		await this.task.providerRef
			.deref()
			?.postMessageToWebview({ type: "condenseTaskContextStarted", text: this.task.taskId })

		// Build tools for condensing metadata (same tools used for normal API calls)
		const provider = this.task.providerRef.deref()
		let allTools: import("openai").default.Chat.ChatCompletionTool[] = []
		if (provider) {
			const toolsResult = await buildNativeToolsArrayWithRestrictions({
				provider,
				cwd: this.task.cwd,
				mode,
				customModes: state?.customModes,
				experiments: state?.experiments,
				apiConfiguration,
				disabledTools: state?.disabledTools,
				modelInfo,
				includeAllToolsWithRestrictions: false,
			})
			allTools = toolsResult.tools
		}

		// Build metadata with tools and taskId for the condensing API call
		const metadata: ApiHandlerCreateMessageMetadata = {
			mode,
			taskId: this.task.taskId,
			...(allTools.length > 0
				? {
						tools: allTools,
						tool_choice: "auto",
						parallelToolCalls: true,
					}
				: {}),
		}

		try {
			// Generate environment details to include in the condensed summary
			const environmentDetails = await getEnvironmentDetails(this.task, true)

			// Force aggressive truncation by keeping only 75% of the conversation history
			const truncateResult = await manageContext({
				messages: this.task.apiConversationHistory,
				totalTokens: contextTokens || 0,
				maxTokens,
				contextWindow,
				apiHandler: this.task.api,
				autoCondenseContext: true,
				autoCondenseContextPercent: FORCED_CONTEXT_REDUCTION_PERCENT,
				systemPrompt: await this.getSystemPrompt(),
				taskId: this.task.taskId,
				profileThresholds,
				currentProfileId,
				metadata,
				environmentDetails,
			})

			if (truncateResult.messages !== this.task.apiConversationHistory) {
				await this.task.overwriteApiConversationHistory(truncateResult.messages)
			}

			if (truncateResult.summary) {
				const { summary, cost, prevContextTokens, newContextTokens = 0 } = truncateResult
				const contextCondense: ContextCondense = { summary, cost, newContextTokens, prevContextTokens }
				await this.task.say(
					"condense_context",
					undefined /* text */,
					undefined /* images */,
					false /* partial */,
					undefined /* checkpoint */,
					undefined /* progressStatus */,
					{ isNonInteractive: true } /* options */,
					contextCondense,
				)
			} else if (truncateResult.truncationId) {
				// Sliding window truncation occurred (fallback when condensing fails or is disabled)
				const contextTruncation: ContextTruncation = {
					truncationId: truncateResult.truncationId,
					messagesRemoved: truncateResult.messagesRemoved ?? 0,
					prevContextTokens: truncateResult.prevContextTokens,
					newContextTokens: truncateResult.newContextTokensAfterTruncation ?? 0,
				}
				await this.task.say(
					"sliding_window_truncation",
					undefined /* text */,
					undefined /* images */,
					false /* partial */,
					undefined /* checkpoint */,
					undefined /* progressStatus */,
					{ isNonInteractive: true } /* options */,
					undefined /* contextCondense */,
					contextTruncation,
				)
			}

			// Re-sync token usage snapshot immediately
			const tokenUsage = this.task.getTokenUsage()
			this.task.tokenUsageSnapshot = tokenUsage
			this.task.debouncedEmitTokenUsage(tokenUsage, this.task.toolUsage)
		} finally {
			// Notify webview that context management is complete (removes in-progress spinner)
			// IMPORTANT: Must always be sent to dismiss the spinner, even on error
			await this.task.providerRef
				.deref()
				?.postMessageToWebview({ type: "condenseTaskContextResponse", text: this.task.taskId })
		}
	}

	// ──────────────────────────────────────────────────────────────
	//  Rate Limit Wait
	// ──────────────────────────────────────────────────────────────

	/**
	 * Enforce the user-configured provider rate limit.
	 *
	 * NOTE: This is intentionally treated as expected behavior and is surfaced via
	 * the `api_req_rate_limit_wait` say type (not an error).
	 */
	async maybeWaitForProviderRateLimit(retryAttempt: number): Promise<void> {
		const state = await this.task.providerRef.deref()?.getState()
		const rateLimitSeconds =
			state?.apiConfiguration?.rateLimitSeconds ?? this.task.apiConfiguration?.rateLimitSeconds ?? 0

		if (rateLimitSeconds <= 0 || !Task.lastGlobalApiRequestTime) {
			return
		}

		const now = performance.now()
		const timeSinceLastRequest = now - Task.lastGlobalApiRequestTime
		const rateLimitDelay = Math.ceil(
			Math.min(rateLimitSeconds, Math.max(0, rateLimitSeconds * 1000 - timeSinceLastRequest) / 1000),
		)

		// Only show the countdown UX on the first attempt. Retry flows have their own delay messaging.
		if (rateLimitDelay > 0 && retryAttempt === 0) {
			for (let i = rateLimitDelay; i > 0; i--) {
				// Send structured JSON data for i18n-safe transport
				const delayMessage = JSON.stringify({ seconds: i })
				await this.task.say("api_req_rate_limit_wait", delayMessage, undefined, true)
				await delay(1000)
			}
			// Finalize the partial message so the UI doesn't keep rendering an in-progress spinner.
			await this.task.say("api_req_rate_limit_wait", undefined, undefined, false)
		}
	}

	// ──────────────────────────────────────────────────────────────
	//  API Request (async generator)
	// ──────────────────────────────────────────────────────────────

	async *attemptApiRequest(retryAttempt: number = 0, options: { skipProviderRateLimit?: boolean } = {}): ApiStream {
		const state = await this.task.providerRef.deref()?.getState()

		const {
			apiConfiguration,
			autoApprovalEnabled,
			requestDelaySeconds,
			mode,
			autoCondenseContext = true,
			autoCondenseContextPercent = 80,
			profileThresholds = {},
		} = state ?? {}

		// Get condensing configuration for automatic triggers.
		const customCondensingPrompt = state?.customSupportPrompts?.CONDENSE

		if (!options.skipProviderRateLimit) {
			await this.maybeWaitForProviderRateLimit(retryAttempt)
		}

		// Update last request time right before making the request so that subsequent
		// requests — even from new subtasks — will honour the provider's rate-limit.
		//
		// NOTE: When recursivelyMakeMirrorRequests handles rate limiting, it sets the
		// timestamp earlier to include the environment details build. We still set it
		// here for direct callers (tests) and for the case where we didn't rate-limit
		// in the caller.
		Task.lastGlobalApiRequestTime = performance.now()

		if (this.task.contextManager.isCondensing) {
			await this.task.contextManager.condenseContext()
		}

		const systemPrompt = await this.getSystemPrompt()
		const { contextTokens } = this.task.getTokenUsage()

		if (contextTokens) {
			const modelInfo = this.task.api.getModel().info

			const maxTokens = getModelMaxOutputTokens({
				modelId: this.task.api.getModel().id,
				model: modelInfo,
				settings: this.task.apiConfiguration,
			})

			const contextWindow = modelInfo.contextWindow

			// Get the current profile ID using the helper method
			const currentProfileId = this.getCurrentProfileId(state)

			// Check if context management will likely run (threshold check)
			// This allows us to show an in-progress indicator to the user
			// We use the centralized willManageContext helper to avoid duplicating threshold logic
			const lastMessage = this.task.apiConversationHistory[this.task.apiConversationHistory.length - 1]
			const lastMessageContent = lastMessage?.content
			let lastMessageTokens = 0
			if (lastMessageContent) {
				lastMessageTokens = Array.isArray(lastMessageContent)
					? await this.task.api.countTokens(lastMessageContent)
					: await this.task.api.countTokens([{ type: "text", text: lastMessageContent as string }])
			}

			const contextManagementWillRun = willManageContext({
				totalTokens: contextTokens,
				contextWindow,
				maxTokens,
				autoCondenseContext,
				autoCondenseContextPercent,
				profileThresholds,
				currentProfileId,
				lastMessageTokens,
			})

			if (contextManagementWillRun) {
				const executeContextMgmt = async () => {
					if (contextManagementWillRun && autoCondenseContext) {
						await this.task.providerRef
							.deref()
							?.postMessageToWebview({ type: "condenseTaskContextStarted", text: this.task.taskId })
					}

					let contextMgmtTools: import("openai").default.Chat.ChatCompletionTool[] = []
					{
						const provider = this.task.providerRef.deref()
						if (provider) {
							const toolsResult = await buildNativeToolsArrayWithRestrictions({
								provider,
								cwd: this.task.cwd,
								mode,
								customModes: state?.customModes,
								experiments: state?.experiments,
								apiConfiguration,
								disabledTools: state?.disabledTools,
								modelInfo,
								includeAllToolsWithRestrictions: false,
							})
							contextMgmtTools = toolsResult.tools
						}
					}

					const contextMgmtMetadata: ApiHandlerCreateMessageMetadata = {
						mode,
						taskId: this.task.taskId,
						...(contextMgmtTools.length > 0
							? {
									tools: contextMgmtTools,
									tool_choice: "auto",
									parallelToolCalls: true,
								}
							: {}),
					}

					const contextMgmtEnvironmentDetails = contextManagementWillRun
						? await getEnvironmentDetails(this.task, true)
						: undefined

					const contextMgmtFilesReadByMirror =
						contextManagementWillRun && autoCondenseContext
							? await this.task.getFilesReadByMirrorSafely("attemptApiRequest")
							: undefined

					try {
						const truncateResult = await manageContext({
							messages: this.task.apiConversationHistory,
							totalTokens: contextTokens,
							maxTokens,
							contextWindow,
							apiHandler: this.task.api,
							autoCondenseContext,
							autoCondenseContextPercent,
							systemPrompt,
							taskId: this.task.taskId,
							customCondensingPrompt,
							profileThresholds,
							currentProfileId,
							metadata: contextMgmtMetadata,
							environmentDetails: contextMgmtEnvironmentDetails,
							filesReadByMirror: contextMgmtFilesReadByMirror,
							cwd: this.task.cwd,
							mirrorIgnoreController: this.task.mirrorIgnoreController,
						})
						if (truncateResult.messages !== this.task.apiConversationHistory) {
							await this.task.overwriteApiConversationHistory(truncateResult.messages)
						}
						if (truncateResult.error) {
							await this.task.say("condense_context_error", truncateResult.error)
						}
						if (truncateResult.summary) {
							const {
								summary,
								cost,
								prevContextTokens,
								newContextTokens = 0,
								condenseId,
							} = truncateResult
							const contextCondense: ContextCondense = {
								summary,
								cost,
								newContextTokens,
								prevContextTokens,
								condenseId,
							}
							await this.task.say(
								"condense_context",
								undefined /* text */,
								undefined /* images */,
								false /* partial */,
								undefined /* checkpoint */,
								undefined /* progressStatus */,
								{ isNonInteractive: true } /* options */,
								contextCondense,
							)
						} else if (truncateResult.truncationId) {
							const contextTruncation: ContextTruncation = {
								truncationId: truncateResult.truncationId,
								messagesRemoved: truncateResult.messagesRemoved ?? 0,
								prevContextTokens: truncateResult.prevContextTokens,
								newContextTokens: truncateResult.newContextTokensAfterTruncation ?? 0,
							}
							await this.task.say(
								"sliding_window_truncation",
								undefined /* text */,
								undefined /* images */,
								false /* partial */,
								undefined /* checkpoint */,
								undefined /* progressStatus */,
								{ isNonInteractive: true } /* options */,
								undefined /* contextCondense */,
								contextTruncation,
							)
						}

						// Re-sync token usage snapshot immediately
						const tokenUsage = this.task.getTokenUsage()
						this.task.tokenUsageSnapshot = tokenUsage
						this.task.debouncedEmitTokenUsage(tokenUsage, this.task.toolUsage)
					} finally {
						if (contextManagementWillRun && autoCondenseContext) {
							await this.task.providerRef
								.deref()
								?.postMessageToWebview({ type: "condenseTaskContextResponse", text: this.task.taskId })
						}
					}
				}

				await executeContextMgmt()
			}
		}

		// Get the effective API history by filtering out condensed messages
		// This allows non-destructive condensing where messages are tagged but not deleted,
		// enabling accurate rewind operations while still sending condensed history to the API.
		const effectiveHistory = getEffectiveApiHistory(this.task.apiConversationHistory)
		const messagesSinceLastSummary = getMessagesSinceLastSummary(effectiveHistory)
		// For API only: merge consecutive user messages (excludes summary messages per
		// mergeConsecutiveApiMessages implementation) without mutating stored history.
		const mergedForApi = mergeConsecutiveApiMessages(messagesSinceLastSummary, { roles: ["user"] })

		// Create AbortController BEFORE maybeRemoveImageBlocks so the user can cancel
		// even if Tesseract.js OCR hangs on a large user-attached image.
		// Previously this was created 72 lines later (after tool building), meaning
		// a hanging OCR call would prevent both the API request AND the cancel button.
		this.task.currentRequestAbortController = new AbortController()
		const imageCleanupAbortSignal = this.task.currentRequestAbortController.signal

		const messagesWithoutImages = await Promise.race([
			maybeRemoveImageBlocks(mergedForApi, this.task.api),
			new Promise<never>((_, reject) => {
				if (imageCleanupAbortSignal.aborted) {
					reject(new Error("Request cancelled by user"))
				}
				imageCleanupAbortSignal.addEventListener("abort", () => {
					reject(new Error("Request cancelled by user"))
				})
			}),
		])
		const cleanConversationHistory = this.buildCleanConversationHistory(messagesWithoutImages as ApiMessage[])

		// Check auto-approval limits
		const approvalResult = await this.task.autoApprovalHandler.checkAutoApprovalLimits(
			state,
			this.task.combineMessages(this.task.mirrorMessages.slice(1)),
			async (type, data) => this.task.ask(type, data),
		)

		if (!approvalResult.shouldProceed) {
			// User did not approve, task should be aborted
			throw new Error("Auto-approval limit reached and user did not approve continuation")
		}

		// Whether we include tools is determined by whether we have any tools to send.
		const modelInfo = this.task.api.getModel().info

		// Build complete tools array: native tools + dynamic MCP tools
		// When includeAllToolsWithRestrictions is true, returns all tools but provides
		// allowedFunctionNames for providers (like Gemini) that need to see all tool
		// definitions in history while restricting callable tools for the current mode.
		// Only Gemini currently supports this - other providers filter tools normally.
		let allTools: OpenAI.Chat.ChatCompletionTool[] = []
		let allowedFunctionNames: string[] | undefined

		// Gemini requires all tool definitions to be present for history compatibility,
		// but uses allowedFunctionNames to restrict which tools can be called.
		// Other providers (Anthropic, OpenAI, etc.) don't support this feature yet,
		// so they continue to receive only the filtered tools for the current mode.
		const supportsAllowedFunctionNames = apiConfiguration?.apiProvider === "gemini"

		{
			const provider = this.task.providerRef.deref()
			if (!provider) {
				throw new Error("Provider reference lost during tool building")
			}

			const toolsResult = await buildNativeToolsArrayWithRestrictions({
				provider,
				cwd: this.task.cwd,
				mode,
				customModes: state?.customModes,
				experiments: state?.experiments,
				apiConfiguration,
				disabledTools: state?.disabledTools,
				modelInfo,
				includeAllToolsWithRestrictions: supportsAllowedFunctionNames,
			})
			allTools = toolsResult.tools
			allowedFunctionNames = toolsResult.allowedFunctionNames
		}

		const shouldIncludeTools = allTools.length > 0

		const metadata: ApiHandlerCreateMessageMetadata = {
			mode: mode,
			taskId: this.task.taskId,
			suppressPreviousResponseId: this.task.skipPrevResponseIdOnce,
			// Include tools whenever they are present.
			...(shouldIncludeTools
				? {
						tools: allTools,
						tool_choice: "auto",
						parallelToolCalls: true,
						// When mode restricts tools, provide allowedFunctionNames so providers
						// like Gemini can see all tools in history but only call allowed ones
						...(allowedFunctionNames ? { allowedFunctionNames } : {}),
					}
				: {}),
		}

		const abortSignal = this.task.currentRequestAbortController!.signal
		// Reset the flag after using it
		this.task.skipPrevResponseIdOnce = false

		// ──────────────────────────────────────────────────────────
		//  Global cross-tab request gate
		// ──────────────────────────────────────────────────────────
		// When 2-3 tabs run simultaneously, every tab would otherwise transmit
		// its streaming request at the same instant, tripping the provider's
		// overload protection (Anthropic HTTP 529 "overloaded_error" → "The
		// provider couldn't process the request as made."). We acquire the
		// global gate here and hold it until the provider ACCEPTS the request
		// (first chunk arrives) or the request fails. This serializes the
		// *transmission* of concurrent requests across all tabs — each tab gets
		// its own turn to reach the provider instead of all firing together.
		// After the first chunk, the gate is released and streaming continues
		// fully in parallel (Anthropic permits concurrent active streams; it
		// only rejects the simultaneous start burst).
		const releaseGlobalGate = await Task.acquireGlobalRequestGate()
		let globalGateReleased = false
		const releaseGlobalGateOnce = (): void => {
			if (!globalGateReleased) {
				globalGateReleased = true
				releaseGlobalGate()
			}
		}

		// The provider accepts reasoning items alongside standard messages; cast to the expected parameter type.
		const stream = this.task.api.createMessage(
			systemPrompt,
			cleanConversationHistory as unknown as Anthropic.Messages.MessageParam[],
			metadata,
		)
		const iterator = stream[Symbol.asyncIterator]()

		// Set up abort handling - when the signal is aborted, clean up the controller reference
		abortSignal.addEventListener("abort", () => {
			console.log(`[Task#${this.task.taskId}.${this.task.instanceId}] AbortSignal triggered for current request`)
			this.task.currentRequestAbortController = undefined
		})

		try {
			// Awaiting first chunk to see if it will throw an error.
			this.task.isWaitingForFirstChunk = true

			// Race between the first chunk and the abort signal
			const firstChunkPromise = iterator.next()
			const abortPromise = new Promise<never>((_, reject) => {
				if (abortSignal.aborted) {
					reject(new Error("Request cancelled by user"))
				} else {
					abortSignal.addEventListener("abort", () => {
						reject(new Error("Request cancelled by user"))
					})
				}
			})

			const firstChunk = await Promise.race([firstChunkPromise, abortPromise])
			yield firstChunk.value
			this.task.isWaitingForFirstChunk = false
			// Provider accepted the request — release the global gate so the next
			// queued tab can transmit. Streaming continues in parallel from here.
			releaseGlobalGateOnce()
		} catch (error) {
			// Request failed before the first chunk — always release the gate so
			// other tabs are not blocked, then handle the error (backoff/retry).
			releaseGlobalGateOnce()
			this.task.isWaitingForFirstChunk = false
			this.task.currentRequestAbortController = undefined
			const isContextWindowExceededError = checkContextWindowExceededError(error)

			// If it's a context window error and we haven't exceeded max retries for this error type
			if (isContextWindowExceededError && retryAttempt < MAX_CONTEXT_WINDOW_RETRIES) {
				console.warn(
					`[Task#${this.task.taskId}] Context window exceeded for model ${this.task.api.getModel().id}. ` +
						`Retry attempt ${retryAttempt + 1}/${MAX_CONTEXT_WINDOW_RETRIES}. ` +
						`Attempting automatic truncation...`,
				)
				await this.handleContextWindowExceededError()
				// Retry the request after handling the context window error
				yield* this.attemptApiRequest(retryAttempt + 1)
				return
			}

			// note that this api_req_failed ask is unique in that we only present this option if the api hasn't
			// streamed any content yet (ie it fails on the first chunk due), as it would allow them to hit a retry
			// button. However if the api failed mid-stream, it could be in any arbitrary state where some tools may
			// have executed, so that error is handled differently and requires cancelling the task entirely.
			//
			// Transient provider capacity errors (overloaded 529, rate limit 429,
			// unavailable 503) resolve on their own and are safe to auto-retry with
			// backoff EVEN when auto-approval is disabled — otherwise concurrent
			// multi-tab use would dump the raw "provider couldn't process the
			// request" error on the user. Non-transient errors keep the existing
			// behavior (only auto-retried under auto-approval).
			const shouldAutoRetry = autoApprovalEnabled || isTransientProviderError(error)
			if (shouldAutoRetry) {
				// Apply shared exponential backoff and countdown UX
				await this.backoffAndAnnounce(retryAttempt, error)

				// CRITICAL: Check if task was aborted during the backoff countdown
				// This prevents infinite loops when users cancel during auto-retry
				// Without this check, the recursive call below would continue even after abort
				if (this.task.abort) {
					throw new Error(
						`[Task#attemptApiRequest] task ${this.task.taskId}.${this.task.instanceId} aborted during retry`,
					)
				}

				// Delegate generator output from the recursive call with
				// incremented retry count.
				yield* this.attemptApiRequest(retryAttempt + 1)

				return
			} else {
				const { response } = await this.task.ask(
					"api_req_failed",
					error.message ?? JSON.stringify(serializeError(error), null, 2),
				)

				if (response !== "yesButtonClicked") {
					// This will never happen since if noButtonClicked, we will
					// clear current task, aborting this instance.
					throw new Error("API request failed")
				}

				await this.task.say("api_req_retried")

				// Delegate generator output from the recursive call.
				yield* this.attemptApiRequest()
				return
			}
		}

		// No error, so we can continue to yield all remaining chunks.
		// (Needs to be placed outside of try/catch since it we want caller to
		// handle errors not with api_req_failed as that is reserved for first
		// chunk failures only.)
		// This delegates to another generator or iterable object. In this case,
		// it's saying "yield all remaining values from this iterator". This
		// effectively passes along all subsequent chunks from the original
		// stream.
		yield* iterator
	}

	// ──────────────────────────────────────────────────────────────
	//  Exponential Backoff
	// ──────────────────────────────────────────────────────────────

	/**
	 * Shared exponential backoff for retries (first-chunk and mid-stream)
	 */
	async backoffAndAnnounce(retryAttempt: number, error: any): Promise<void> {
		try {
			const state = await this.task.providerRef.deref()?.getState()
			const baseDelay = state?.requestDelaySeconds || 5

			let exponentialDelay = Math.min(
				Math.ceil(baseDelay * Math.pow(2, retryAttempt)),
				MAX_EXPONENTIAL_BACKOFF_SECONDS,
			)

			// Respect provider rate limit window
			let rateLimitDelay = 0
			const rateLimit = (state?.apiConfiguration ?? this.task.apiConfiguration)?.rateLimitSeconds || 0
			if (Task.lastGlobalApiRequestTime && rateLimit > 0) {
				const elapsed = performance.now() - Task.lastGlobalApiRequestTime
				rateLimitDelay = Math.ceil(Math.min(rateLimit, Math.max(0, rateLimit * 1000 - elapsed) / 1000))
			}

			// Prefer RetryInfo on 429 if present
			if (error?.status === 429) {
				const retryInfo = error?.errorDetails?.find(
					(d: any) => d["@type"] === "type.googleapis.com/google.rpc.RetryInfo",
				)
				const match = retryInfo?.retryDelay?.match?.(/^(\d+)s$/)
				if (match) {
					exponentialDelay = Number(match[1]) + 1
				}
			}

			const finalDelay = Math.max(exponentialDelay, rateLimitDelay)
			if (finalDelay <= 0) {
				return
			}

			// Build header text; fall back to error message if none provided
			let headerText
			if (error.status) {
				// Include both status code (for ChatRow parsing) and detailed message (for error details)
				// Format: "<status>\n<message>" allows ChatRow to extract status via parseInt(text.substring(0,3))
				// while preserving the full error message in errorDetails for debugging
				const errorMessage = error?.message || "Unknown error"
				headerText = `${error.status}\n${errorMessage}`
			} else if (error?.message) {
				headerText = error.message
			} else {
				headerText = "Unknown error"
			}

			headerText = headerText ? `${headerText}\n` : ""

			// Show countdown timer with exponential backoff
			for (let i = finalDelay; i > 0; i--) {
				// Check abort flag during countdown to allow early exit
				if (this.task.abort) {
					throw new Error(`[Task#${this.task.taskId}] Aborted during retry countdown`)
				}

				await this.task.say(
					"api_req_retry_delayed",
					`${headerText}<retry_timer>${i}</retry_timer>`,
					undefined,
					true,
				)
				await delay(1000)
			}

			await this.task.say("api_req_retry_delayed", headerText, undefined, false)
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err)

			if (this.task.abort && message.includes("Aborted during retry countdown")) {
				return
			}

			console.error("Exponential backoff failed:", err)
		}
	}

	// ──────────────────────────────────────────────────────────────
	//  Conversation History Cleaning
	// ──────────────────────────────────────────────────────────────

	private buildCleanConversationHistory(
		messages: ApiMessage[],
	): Array<
		Anthropic.Messages.MessageParam | { type: "reasoning"; encrypted_content: string; id?: string; summary?: any[] }
	> {
		type ReasoningItemForRequest = {
			type: "reasoning"
			encrypted_content: string
			id?: string
			summary?: any[]
		}

		const cleanConversationHistory: (Anthropic.Messages.MessageParam | ReasoningItemForRequest)[] = []

		for (const msg of messages) {
			// Standalone reasoning: send encrypted, skip plain text
			if (msg.type === "reasoning") {
				if (msg.encrypted_content) {
					cleanConversationHistory.push({
						type: "reasoning",
						summary: msg.summary,
						encrypted_content: msg.encrypted_content!,
						...(msg.id ? { id: msg.id } : {}),
					})
				}
				continue
			}

			// Preferred path: assistant message with embedded reasoning as first content block
			if (msg.role === "assistant") {
				const rawContent = msg.content

				const contentArray: Anthropic.Messages.ContentBlockParam[] = Array.isArray(rawContent)
					? (rawContent as Anthropic.Messages.ContentBlockParam[])
					: rawContent !== undefined
						? ([
								{ type: "text", text: rawContent } satisfies Anthropic.Messages.TextBlockParam,
							] as Anthropic.Messages.ContentBlockParam[])
						: []

				const [first, ...rest] = contentArray

				// Check if this message has reasoning_details (OpenRouter format for Gemini 3, etc.)
				const msgWithDetails = msg
				if (msgWithDetails.reasoning_details && Array.isArray(msgWithDetails.reasoning_details)) {
					// Build the assistant message with reasoning_details
					let assistantContent: Anthropic.Messages.MessageParam["content"]

					if (contentArray.length === 0) {
						assistantContent = ""
					} else if (contentArray.length === 1 && contentArray[0].type === "text") {
						assistantContent = (contentArray[0] as Anthropic.Messages.TextBlockParam).text
					} else {
						assistantContent = contentArray
					}

					// Create message with reasoning_details property
					cleanConversationHistory.push({
						role: "assistant",
						content: assistantContent,
						reasoning_details: msgWithDetails.reasoning_details,
					} as any)

					continue
				}

				// Embedded reasoning: encrypted (send) or plain text (skip)
				const hasEncryptedReasoning =
					first && (first as any).type === "reasoning" && typeof (first as any).encrypted_content === "string"
				const hasPlainTextReasoning =
					first && (first as any).type === "reasoning" && typeof (first as any).text === "string"

				if (hasEncryptedReasoning) {
					const reasoningBlock = first as any

					// Send as separate reasoning item (OpenAI Native)
					cleanConversationHistory.push({
						type: "reasoning",
						summary: reasoningBlock.summary ?? [],
						encrypted_content: reasoningBlock.encrypted_content,
						...(reasoningBlock.id ? { id: reasoningBlock.id } : {}),
					})

					// Send assistant message without reasoning
					let assistantContent: Anthropic.Messages.MessageParam["content"]

					if (rest.length === 0) {
						assistantContent = ""
					} else if (rest.length === 1 && rest[0].type === "text") {
						assistantContent = (rest[0] as Anthropic.Messages.TextBlockParam).text
					} else {
						assistantContent = rest
					}

					cleanConversationHistory.push({
						role: "assistant",
						content: assistantContent,
					} satisfies Anthropic.Messages.MessageParam)

					continue
				} else if (hasPlainTextReasoning) {
					// Check if the model's preserveReasoning flag is set
					// If true, include the reasoning block in API requests
					// If false/undefined, strip it out (stored for history only, not sent back to API)
					const shouldPreserveForApi = this.task.api.getModel().info.preserveReasoning === true
					let assistantContent: Anthropic.Messages.MessageParam["content"]

					if (shouldPreserveForApi) {
						// Include reasoning block in the content sent to API
						assistantContent = contentArray
					} else {
						// Strip reasoning out - stored for history only, not sent back to API
						if (rest.length === 0) {
							assistantContent = ""
						} else if (rest.length === 1 && rest[0].type === "text") {
							assistantContent = (rest[0] as Anthropic.Messages.TextBlockParam).text
						} else {
							assistantContent = rest
						}
					}

					cleanConversationHistory.push({
						role: "assistant",
						content: assistantContent,
						...(((first as any).text || msg.reasoning_content) && {
							reasoning_content: (first as any).text || msg.reasoning_content,
						}),
					} as any)

					continue
				}
			}

			// Default path for regular messages (no embedded reasoning)
			if (msg.role) {
				cleanConversationHistory.push({
					role: msg.role,
					content: msg.content as Anthropic.Messages.ContentBlockParam[] | string,
					...(msg.role === "assistant" &&
						msg.reasoning_content && { reasoning_content: msg.reasoning_content }),
				} as any)
			}
		}

		return cleanConversationHistory
	}

	// ──────────────────────────────────────────────────────────────
	//  Utilities
	// ──────────────────────────────────────────────────────────────

	private async getFilesReadByMirrorSafely(context: string): Promise<string[] | undefined> {
		try {
			return await this.task.fileContextTracker.getFilesReadByMirror()
		} catch (error) {
			console.error(`[Task#${context}] Failed to get files read by Mirror VS:`, error)
			return undefined
		}
	}
}

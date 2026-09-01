import { Anthropic } from "@anthropic-ai/sdk"

import { type ContextCondense } from "@mirror-vs/types"

import { ApiHandler, ApiHandlerCreateMessageMetadata } from "../../api"
import { buildNativeToolsArrayWithRestrictions } from "./build-tools"
import { getEnvironmentDetails } from "../environment/getEnvironmentDetails"
import { summarizeConversation } from "../condense"
import { Task } from "./Task"

/**
 * Manages context window operations for a Task — condensing conversation
 * history and handling context window limits.
 *
 * Extracted from Task.ts to reduce its size and isolate concerns.
 */
export class TaskContextManagement {
	constructor(private readonly task: Task) {}

	// ──────────────────────────────────────────────────────────────
	//  Context Condensing
	// ──────────────────────────────────────────────────────────────

	/**
	 * Condenses the conversation history by summarizing older messages.
	 * Called when the context window is approaching its limit.
	 *
	 * ## Flow
	 * 1. Flush any pending tool results to ensure complete tool_use/tool_result pairs
	 * 2. Fetch system prompt and condensing configuration
	 * 3. Build tools array for condensing metadata
	 * 4. Call `summarizeConversation()` to generate a condensed summary
	 * 5. Replace API history with condensed messages
	 * 6. Announce the condensing result
	 *
	 * @returns Promise that resolves when condensing is complete
	 */
	public async condenseContext(): Promise<void> {
		// CRITICAL: Flush any pending tool results before condensing
		// to ensure tool_use/tool_result pairs are complete in history
		await this.task.conversationHistory.flushPendingToolResultsToHistory()

		const systemPrompt = await this.task.getSystemPrompt()

		// Get condensing configuration
		const state = await this.task.providerRef.deref()?.getState()
		const customCondensingPrompt = state?.customSupportPrompts?.CONDENSE
		const { mode, apiConfiguration } = state ?? {}

		const { contextTokens: prevContextTokens } = this.task.getTokenUsage()

		// Build tools for condensing metadata (same tools used for normal API calls)
		const provider = this.task.providerRef.deref()
		let allTools: import("openai").default.Chat.ChatCompletionTool[] = []
		if (provider) {
			const modelInfo = this.task.api.getModel().info
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
		// Generate environment details to include in the condensed summary
		const environmentDetails = await getEnvironmentDetails(this.task, true)

		const filesReadByMirror = await this.task.getFilesReadByMirrorSafely("condenseContext")

		const {
			messages,
			summary,
			cost,
			newContextTokens = 0,
			error,
			errorDetails,
			condenseId,
		} = await summarizeConversation({
			messages: this.task.apiConversationHistory,
			apiHandler: this.task.api,
			systemPrompt,
			taskId: this.task.taskId,
			isAutomaticTrigger: false,
			customCondensingPrompt,
			metadata,
			environmentDetails,
			filesReadByMirror,
			cwd: this.task.cwd,
			mirrorIgnoreController: this.task.mirrorIgnoreController,
		})
		if (error) {
			await this.task.say(
				"condense_context_error",
				error,
				undefined /* images */,
				false /* partial */,
				undefined /* checkpoint */,
				undefined /* progressStatus */,
				{ isNonInteractive: true } /* options */,
			)
			return
		}
		await this.task.conversationHistory.overwriteApiConversationHistory(messages)

		// Extract distilled knowledge from this task into the session's shared
		// context (condense runs are a key knowledge-extraction event). No-op for
		// tasks without a sessionId; failures are non-fatal.
		if (provider) {
			try {
				await provider.getSessionContextManager().extractKnowledgeFromTask(this.task)
			} catch (extractError) {
				console.error(
					`[condenseContext] Failed to extract session knowledge: ${extractError instanceof Error ? extractError.message : String(extractError)}`,
				)
			}
		}

		const contextCondense: ContextCondense = {
			summary,
			cost,
			newContextTokens,
			prevContextTokens,
			condenseId: condenseId!,
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
	}

	private isBackgroundCondensing = false

	/**
	 * Automatically triggers non-blocking background context condensation if context token usage
	 * reaches or exceeds the configured threshold.
	 */
	public maybeTriggerBackgroundCondense(): void {
		if (this.isBackgroundCondensing || this.task.abort || this.task.isStreaming) {
			return
		}

		const state = this.task.providerRef.deref()?.getState()
		const autoCondense = state ? ((state as any).autoCondenseContext ?? true) : true
		if (!autoCondense) {
			return
		}

		const thresholdPercent = state ? ((state as any).autoCondenseContextPercent ?? 75) : 75
		const { contextTokens } = this.task.getTokenUsage()
		const contextWindow = this.task.api.getModel().info.contextWindow || 128000
		const percentUsed = (contextTokens * 100) / contextWindow

		if (percentUsed >= thresholdPercent && this.task.apiConversationHistory.length >= 6) {
			this.isBackgroundCondensing = true
			this.condenseContext()
				.catch((err) => {
					console.error("[TaskContextManagement] Background condense error:", err)
				})
				.finally(() => {
					this.isBackgroundCondensing = false
				})
		}
	}
}

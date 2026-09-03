import { Anthropic } from "@anthropic-ai/sdk"

import { type ContextCondense } from "@mirror-vs/types"

import { ApiHandler, ApiHandlerCreateMessageMetadata } from "../../api"
import { getModelMaxOutputTokens } from "../../shared/api"
import { buildNativeToolsArrayWithRestrictions } from "./build-tools"
import { getEnvironmentDetails } from "../environment/getEnvironmentDetails"
import { summarizeConversation } from "../condense"
import { willManageContext } from "../context-management"
import { Task } from "./Task"

/**
 * Manages context window operations for a Task — condensing conversation
 * history and handling context window limits.
 *
 * Extracted from Task.ts to reduce its size and isolate concerns.
 */
export class TaskContextManagement {
	private activeCondensePromise: Promise<void> | null = null

	constructor(private readonly task: Task) {}

	/**
	 * Returns true if a condensation operation is currently in progress.
	 */
	public get isCondensing(): boolean {
		return this.activeCondensePromise !== null
	}

	// ──────────────────────────────────────────────────────────────
	//  Context Condensing
	// ──────────────────────────────────────────────────────────────

	/**
	 * Condenses the conversation history by summarizing older messages.
	 * Called when the context window is approaching its limit or triggered manually.
	 *
	 * Returns the active condensation promise if one is already running,
	 * preventing concurrent duplicate condensations.
	 *
	 * @returns Promise that resolves when condensing is complete
	 */
	public condenseContext(): Promise<void> {
		if (this.activeCondensePromise) {
			return this.activeCondensePromise
		}

		const promise = this.executeCondense().finally(() => {
			this.activeCondensePromise = null
		})
		this.activeCondensePromise = promise
		return promise
	}

	private async executeCondense(): Promise<void> {
		// Send condenseTaskContextStarted to update UI
		await this.task.providerRef
			.deref()
			?.postMessageToWebview({ type: "condenseTaskContextStarted", text: this.task.taskId })

		try {
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

			// Immediately re-sync token usage snapshot so subsequent checks see the reduced context size
			const tokenUsage = this.task.getTokenUsage()
			this.task.tokenUsageSnapshot = tokenUsage
			this.task.debouncedEmitTokenUsage(tokenUsage, this.task.toolUsage)
		} finally {
			await this.task.providerRef
				.deref()
				?.postMessageToWebview({ type: "condenseTaskContextResponse", text: this.task.taskId })
		}
	}

	/**
	 * Automatically triggers non-blocking background context condensation if context token usage
	 * reaches or exceeds the configured threshold.
	 */
	public maybeTriggerBackgroundCondense(): void {
		if (this.isCondensing || this.task.abort || this.task.isStreaming) {
			return
		}

		const state = this.task.providerRef.deref()?.getState()
		const autoCondense = state ? ((state as any).autoCondenseContext ?? true) : true
		if (!autoCondense) {
			return
		}

		const autoCondenseContextPercent = state ? ((state as any).autoCondenseContextPercent ?? 75) : 75
		const profileThresholds = (state as any)?.profileThresholds ?? {}
		const currentProfileId = (state as any)?.currentProfileId || "default"
		const modelInfo = this.task.api.getModel().info
		const contextWindow = modelInfo.contextWindow || 128000
		const maxTokens = getModelMaxOutputTokens({
			modelId: this.task.api.getModel().id,
			model: modelInfo,
			settings: this.task.apiConfiguration,
		})
		const { contextTokens } = this.task.getTokenUsage()

		const shouldCondense = willManageContext({
			totalTokens: contextTokens || 0,
			contextWindow,
			maxTokens,
			autoCondenseContext: autoCondense,
			autoCondenseContextPercent,
			profileThresholds,
			currentProfileId,
			lastMessageTokens: 0,
		})

		if (shouldCondense && this.task.apiConversationHistory.length >= 6) {
			this.condenseContext().catch((err) => {
				console.error("[TaskContextManagement] Background condense error:", err)
			})
		}
	}
}

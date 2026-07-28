import * as path from "path"

import { MirrorVSEventName } from "@mirror-vs/types"
import type { MirrorMessage, MirrorAsk, TodoItem, MirrorApiReqCancelReason, MirrorApiReqInfo } from "@mirror-vs/types"
import { MAX_MCP_TOOLS_THRESHOLD, countEnabledMcpTools } from "@mirror-vs/types"

import { Anthropic } from "@anthropic-ai/sdk"

import { findLastIndex } from "../../shared/array"
import { formatResponse } from "../prompts/responses"
import { getEnvironmentDetails } from "../environment/getEnvironmentDetails"

// services
import { McpServerManager } from "../../services/mcp/McpServerManager"
import { TerminalRegistry } from "../../integrations/terminal/TerminalRegistry"
import { OutputInterceptor } from "../../integrations/terminal/OutputInterceptor"
import { getTaskDirectoryPath } from "../../utils/storage"

// checkpoints
import { getCheckpointService } from "../checkpoints"

// task persistence
import { readApiMessages } from "../task-persistence"
import type { ApiMessage } from "../task-persistence"

import type { Task } from "./Task"

/**
 * Manages the lifecycle of a Task: start, resume, abort, dispose, and subtasks.
 *
 * Handles:
 * - Starting a new task from scratch
 * - Resuming a task from saved history
 * - Cancelling in-progress HTTP requests
 * - Emitting final token usage statistics
 * - Aborting and disposing the task (with cleanup)
 * - Spawning subtasks and resuming after delegation
 */
export class TaskLifecycle {
	constructor(private readonly task: Task) {}

	// ── Private helpers ──

	private get mirrorMessages(): MirrorMessage[] {
		return this.task.mirrorMessages
	}

	// ── Public API ──

	/**
	 * Manually start a **new** task when it was created with `startTask: false`.
	 *
	 * This fires `startTask` as a background async operation for the
	 * `task/images` code-path only.  It does **not** handle the
	 * `historyItem` resume path (use the constructor with `startTask: true`
	 * for that).  The primary use-case is in the delegation flow where the
	 * parent's metadata must be persisted to globalState **before** the
	 * child task begins writing its own history (avoiding a read-modify-write
	 * race on globalState).
	 */
	public start(): void {
		if (this.task._started) {
			return
		}

		const { task, images } = this.task.metadata

		// Only kick off the AI loop when there's actual content.
		// An empty string + empty array means the tab was created via "+" button
		// and is waiting for user input before starting.
		const hasContent = (task !== undefined && task.trim().length > 0) || (images !== undefined && images.length > 0)

		if (hasContent) {
			this.task._started = true
			this.startTask(task ?? undefined, images ?? undefined)
		}
		// For idle tabs (no content), do NOT set _started = true.
		// The idle detection in handleNewTask checks !_started && state === TaskState.Idle
		// to know this tab was created via "+" and is waiting for user input.
	}

	public async startTask(task?: string, images?: string[]): Promise<void> {
		try {
			// `conversationHistory` (for API) and `mirrorMessages` (for webview)
			// need to be in sync.
			// If the extension process were killed, then on restart the
			// `mirrorMessages` might not be empty, so we need to set it to [] when
			// we create a new Mirror client (otherwise webview would show stale
			// messages from previous session).
			this.task.mirrorMessages = []
			this.task.apiConversationHistory = []

			// The todo list is already set in the constructor if initialTodos were provided
			// No need to add any messages - the todoList property is already set

			await this.task.providerRef.deref()?.postStateToWebviewWithoutTaskHistory()

			await this.task.say("text", task, images)

			// Check for too many MCP tools and warn the user
			const { enabledToolCount, enabledServerCount } = await this.getEnabledMcpToolsCount()
			if (enabledToolCount > MAX_MCP_TOOLS_THRESHOLD) {
				await this.task.say(
					"too_many_tools_warning",
					JSON.stringify({
						toolCount: enabledToolCount,
						serverCount: enabledServerCount,
						threshold: MAX_MCP_TOOLS_THRESHOLD,
					}),
					undefined,
					undefined,
					undefined,
					undefined,
					{ isNonInteractive: true },
				)
			}
			this.task.isInitialized = true

			const imageBlocks: Anthropic.ImageBlockParam[] = formatResponse.imageBlocks(images)

			// Task starting
			await this.task
				.initiateTaskLoop([
					{
						type: "text",
						text: `<user_message>\n${task}\n</user_message>`,
					},
					...imageBlocks,
				])
				.catch((error) => {
					// Swallow loop rejection when the task was intentionally abandoned/aborted
					// during delegation or user cancellation to prevent unhandled rejections.
					if (this.task.abandoned === true || this.task.abortReason === "user_cancelled") {
						return
					}
					throw error
				})
		} catch (error) {
			// In tests and some UX flows, tasks can be aborted while `startTask` is still
			// initializing. Treat abort/abandon as expected and avoid unhandled rejections.
			if (
				this.task.abandoned === true ||
				this.task.abort === true ||
				this.task.abortReason === "user_cancelled"
			) {
				return
			}
			throw error
		}
	}

	public async resumeTaskFromHistory() {
		try {
			const modifiedMirrorMessages = await this.task.mirrorMessagesManager.getSavedMirrorMessages()

			// Load persisted fileEdits (local-only edit history) for this task
			const savedFileEdits = await this.task.mirrorMessagesManager.getSavedFileEdits()
			if (savedFileEdits.length > 0) {
				this.task.fileEdits = savedFileEdits
			}

			// Remove any resume messages that may have been added before.
			const lastRelevantMessageIndex = findLastIndex(
				modifiedMirrorMessages,
				(m) => !(m.ask === "resume_task" || m.ask === "resume_completed_task"),
			)

			if (lastRelevantMessageIndex !== -1) {
				modifiedMirrorMessages.splice(lastRelevantMessageIndex + 1)
			}

			// Remove any trailing reasoning-only UI messages that were not part of the persisted API conversation
			while (modifiedMirrorMessages.length > 0) {
				const last = modifiedMirrorMessages[modifiedMirrorMessages.length - 1]
				if (last.type === "say" && last.say === "reasoning") {
					modifiedMirrorMessages.pop()
				} else {
					break
				}
			}

			// Since we don't use `api_req_finished` anymore, we need to check if the
			// last `api_req_started` has a cost value, if it doesn't and no
			// cancellation reason to present, then we remove it since it indicates
			// an api request without any partial content streamed.
			const lastApiReqStartedIndex = findLastIndex(
				modifiedMirrorMessages,
				(m) => m.type === "say" && m.say === "api_req_started",
			)

			if (lastApiReqStartedIndex !== -1) {
				const lastApiReqStarted = modifiedMirrorMessages[lastApiReqStartedIndex]
				const { cost, cancelReason }: MirrorApiReqInfo = JSON.parse(lastApiReqStarted.text || "{}")

				if (cost === undefined && cancelReason === undefined) {
					modifiedMirrorMessages.splice(lastApiReqStartedIndex, 1)
				}
			}

			await this.task.overwriteMirrorMessages(modifiedMirrorMessages)
			this.task.mirrorMessages = await this.task.mirrorMessagesManager.getSavedMirrorMessages()

			// Now present the mirror messages to the user and ask if they want to
			// resume (NOTE: we ran into a bug before where the
			// apiConversationHistory wouldn't be initialized when opening a old
			// task, and it was because we were waiting for resume).
			// This is important in case the user deletes messages without resuming
			// the task first.
			this.task.apiConversationHistory = await this.getSavedApiConversationHistory()

			const lastMirrorMessage = this.task.mirrorMessages
				.slice()
				.reverse()
				.find((m) => !(m.ask === "resume_task" || m.ask === "resume_completed_task")) // Could be multiple resume tasks.

			let askType: MirrorAsk
			if (lastMirrorMessage?.ask === "completion_result") {
				askType = "resume_completed_task"
			} else {
				askType = "resume_task"
			}

			this.task.isInitialized = true

			const { response, text, images } = await this.task.ask(askType) // Calls `postStateToWebview`.

			let responseText: string | undefined
			let responseImages: string[] | undefined

			if (response === "messageResponse") {
				await this.task.say("user_feedback", text, images)
				responseText = text
				responseImages = images
			}

			// Make sure that the api conversation history can be resumed by the API,
			// even if it goes out of sync with mirror messages.
			let existingApiConversationHistory: ApiMessage[] = await this.getSavedApiConversationHistory()

			// Tool blocks are always preserved; native tool calling only.

			// if the last message is an assistant message, we need to check if there's tool use since every tool use has to have a tool response
			// if there's no tool use and only a text block, then we can just add a user message
			// (note this isn't relevant anymore since we use custom tool prompts instead of tool use blocks, but this is here for legacy purposes in case users resume old tasks)

			// if the last message is a user message, we can need to get the assistant message before it to see if it made tool calls, and if so, fill in the remaining tool responses with 'interrupted'

			let modifiedOldUserContent: Anthropic.Messages.ContentBlockParam[] // either the last message if its user message, or the user message before the last (assistant) message
			let modifiedApiConversationHistory: ApiMessage[] // need to remove the last user message to replace with new modified user message
			if (existingApiConversationHistory.length > 0) {
				const lastMessage = existingApiConversationHistory[existingApiConversationHistory.length - 1]

				if (lastMessage.isSummary) {
					// IMPORTANT: If the last message is a condensation summary, we must preserve it
					// intact. The summary message carries critical metadata (isSummary, condenseId)
					// that getEffectiveApiHistory() uses to filter out condensed messages.
					// Removing or merging it would destroy this metadata, causing all condensed
					// messages to become "orphaned" and restored to active status — effectively
					// undoing the condensation and sending the full history to the API.
					// See: https://github.com/ReflectAIs/mirror-vs/issues/11487
					modifiedApiConversationHistory = [...existingApiConversationHistory]
					modifiedOldUserContent = []
				} else if (lastMessage.role === "assistant") {
					const content = Array.isArray(lastMessage.content)
						? lastMessage.content
						: [{ type: "text", text: lastMessage.content }]
					const hasToolUse = content.some((block) => block.type === "tool_use")

					if (hasToolUse) {
						const toolUseBlocks = content.filter(
							(block) => block.type === "tool_use",
						) as Anthropic.Messages.ToolUseBlock[]
						const toolResponses: Anthropic.ToolResultBlockParam[] = toolUseBlocks.map((block) => ({
							type: "tool_result",
							tool_use_id: block.id,
							content: "Task was interrupted before this tool call could be completed.",
						}))
						modifiedApiConversationHistory = [...existingApiConversationHistory] // no changes
						modifiedOldUserContent = [...toolResponses]
					} else {
						modifiedApiConversationHistory = [...existingApiConversationHistory]
						modifiedOldUserContent = []
					}
				} else if (lastMessage.role === "user") {
					const previousAssistantMessage: ApiMessage | undefined =
						existingApiConversationHistory[existingApiConversationHistory.length - 2]

					const existingUserContent: Anthropic.Messages.ContentBlockParam[] = Array.isArray(
						lastMessage.content,
					)
						? lastMessage.content
						: [{ type: "text", text: lastMessage.content }]
					if (previousAssistantMessage && previousAssistantMessage.role === "assistant") {
						const assistantContent = Array.isArray(previousAssistantMessage.content)
							? previousAssistantMessage.content
							: [{ type: "text", text: previousAssistantMessage.content }]

						const toolUseBlocks = assistantContent.filter(
							(block) => block.type === "tool_use",
						) as Anthropic.Messages.ToolUseBlock[]

						if (toolUseBlocks.length > 0) {
							const existingToolResults = existingUserContent.filter(
								(block) => block.type === "tool_result",
							) as Anthropic.ToolResultBlockParam[]

							const missingToolResponses: Anthropic.ToolResultBlockParam[] = toolUseBlocks
								.filter(
									(toolUse) =>
										!existingToolResults.some((result) => result.tool_use_id === toolUse.id),
								)
								.map((toolUse) => ({
									type: "tool_result",
									tool_use_id: toolUse.id,
									content: "Task was interrupted before this tool call could be completed.",
								}))

							modifiedApiConversationHistory = existingApiConversationHistory.slice(0, -1) // removes the last user message
							modifiedOldUserContent = [...existingUserContent, ...missingToolResponses]
						} else {
							modifiedApiConversationHistory = existingApiConversationHistory.slice(0, -1)
							modifiedOldUserContent = [...existingUserContent]
						}
					} else {
						modifiedApiConversationHistory = existingApiConversationHistory.slice(0, -1)
						modifiedOldUserContent = [...existingUserContent]
					}
				} else {
					throw new Error("Unexpected: Last message is not a user or assistant message")
				}
			} else {
				throw new Error("Unexpected: No existing API conversation history")
			}

			let newUserContent: Anthropic.Messages.ContentBlockParam[] = [...modifiedOldUserContent]

			const agoText = ((): string => {
				const timestamp = lastMirrorMessage?.ts ?? Date.now()
				const now = Date.now()
				const diff = now - timestamp
				const minutes = Math.floor(diff / 60000)
				const hours = Math.floor(minutes / 60)
				const days = Math.floor(hours / 24)

				if (days > 0) {
					return `${days} day${days > 1 ? "s" : ""} ago`
				}
				if (hours > 0) {
					return `${hours} hour${hours > 1 ? "s" : ""} ago`
				}
				if (minutes > 0) {
					return `${minutes} minute${minutes > 1 ? "s" : ""} ago`
				}
				return "just now"
			})()

			if (responseText) {
				newUserContent.push({
					type: "text",
					text: `<user_message>\n${responseText}\n</user_message>`,
				})
			}

			if (responseImages && responseImages.length > 0) {
				newUserContent.push(...formatResponse.imageBlocks(responseImages))
			}

			// Ensure we have at least some content to send to the API.
			// If newUserContent is empty, add a minimal resumption message.
			if (newUserContent.length === 0) {
				newUserContent.push({
					type: "text",
					text: "[TASK RESUMPTION] Resuming task...",
				})
			}

			await this.task.conversationHistory.overwriteApiConversationHistory(modifiedApiConversationHistory)

			// Task resuming from history item.
			await this.task.initiateTaskLoop(newUserContent)
		} catch (error) {
			// Resume and cancellation can race when users issue repeated cancels.
			// Treat intentional abort/abandon flows as expected and avoid process-level crashes.
			if (
				this.task.abandoned === true ||
				this.task.abort === true ||
				this.task.abortReason === "user_cancelled"
			) {
				return
			}
			throw error
		}
	}

	/**
	 * Cancels the current HTTP request if one is in progress.
	 * This immediately aborts the underlying stream rather than waiting for the next chunk.
	 */
	public cancelCurrentRequest(): void {
		if (this.task.currentRequestAbortController) {
			console.log(`[Task#${this.task.taskId}.${this.task.instanceId}] Aborting current HTTP request`)
			this.task.currentRequestAbortController.abort()
			this.task.currentRequestAbortController = undefined
		}
	}

	/**
	 * Force emit a final token usage update, ignoring throttle.
	 * Called before task completion or abort to ensure final stats are captured.
	 * Triggers the debounce with current values and immediately flushes to ensure emit.
	 */
	public emitFinalTokenUsageUpdate(): void {
		const tokenUsage = this.task.getTokenUsage()
		this.task.debouncedEmitTokenUsage(tokenUsage, this.task.toolUsage)
		this.task.debouncedEmitTokenUsage.flush()
	}

	public async abortTask(isAbandoned = false) {
		// Aborting task

		// Will stop any autonomously running promises.
		if (isAbandoned) {
			this.task.abandoned = true
		}

		this.task.abort = true

		// Reset consecutive error counters on abort (manual intervention)
		this.task.consecutiveNoToolUseCount = 0
		this.task.consecutiveNoAssistantMessagesCount = 0

		// Force final token usage update before abort event
		this.emitFinalTokenUsageUpdate()

		this.task.emit(MirrorVSEventName.TaskAborted)

		try {
			this.dispose() // Call the centralized dispose method
		} catch (error) {
			console.error(`Error during task ${this.task.taskId}.${this.task.instanceId} disposal:`, error)
			// Don't rethrow - we want abort to always succeed
		}
		// Save the countdown message in the automatic retry or other content.
		try {
			// Save the countdown message in the automatic retry or other content.
			await this.task.mirrorMessagesManager.saveMirrorMessages()
		} catch (error) {
			console.error(
				`Error saving messages during abort for task ${this.task.taskId}.${this.task.instanceId}:`,
				error,
			)
		}
	}

	public dispose(): void {
		console.log(`[Task#dispose] disposing task ${this.task.taskId}.${this.task.instanceId}`)

		// Cancel any in-progress HTTP request
		try {
			this.cancelCurrentRequest()
		} catch (error) {
			console.error("Error cancelling current request:", error)
		}

		// Remove provider profile change listener
		try {
			if (this.task.providerProfileChangeListener) {
				const provider = this.task.providerRef.deref()
				if (provider) {
					provider.off(MirrorVSEventName.ProviderProfileChanged, this.task.providerProfileChangeListener)
				}
				this.task.providerProfileChangeListener = undefined
			}
		} catch (error) {
			console.error("Error removing provider profile change listener:", error)
		}

		// Dispose message queue and remove event listeners.
		try {
			if (this.task.messageQueueStateChangedHandler) {
				this.task.messageQueueService.removeListener("stateChanged", this.task.messageQueueStateChangedHandler)
				this.task.messageQueueStateChangedHandler = undefined
			}

			this.task.messageQueueService.dispose()
		} catch (error) {
			console.error("Error disposing message queue:", error)
		}

		// Remove all event listeners to prevent memory leaks.
		try {
			this.task.removeAllListeners()
		} catch (error) {
			console.error("Error removing event listeners:", error)
		}

		// Release any terminals associated with this task.
		try {
			// Release any terminals associated with this task.
			TerminalRegistry.releaseTerminalsForTask(this.task.taskId)
		} catch (error) {
			console.error("Error releasing terminals:", error)
		}

		// Cleanup command output artifacts
		getTaskDirectoryPath(this.task.globalStoragePath, this.task.taskId)
			.then((taskDir) => {
				const outputDir = path.join(taskDir, "command-output")
				return OutputInterceptor.cleanup(outputDir)
			})
			.catch((error) => {
				console.error("Error cleaning up command output artifacts:", error)
			})

		try {
			if (this.task.mirrorIgnoreController) {
				this.task.mirrorIgnoreController.dispose()
				this.task.mirrorIgnoreController = undefined
			}
		} catch (error) {
			console.error("Error disposing MirrorIgnoreController:", error)
			// This is the critical one for the leak fix.
		}

		try {
			this.task.fileContextTracker.dispose()
		} catch (error) {
			console.error("Error disposing file context tracker:", error)
		}

		try {
			// If we're not streaming then `abortStream` won't be called.
			if (this.task.isStreaming && this.task.diffViewProvider.isEditing) {
				this.task.diffViewProvider.revertChanges().catch(console.error)
			}
		} catch (error) {
			console.error("Error reverting diff changes:", error)
		}
	}

	// Subtasks
	// Spawn / Wait / Complete

	public async startSubtask(message: string, initialTodos: TodoItem[], mode: string) {
		const provider = this.task.providerRef.deref()

		if (!provider) {
			throw new Error("Provider not available")
		}

		const child = await (provider as any).delegateParentAndOpenChild({
			parentTaskId: this.task.taskId,
			message,
			initialTodos,
			mode,
		})
		return child
	}

	/**
	 * Resume parent task after delegation completion without showing resume ask.
	 * Used in metadata-driven subtask flow.
	 *
	 * This method:
	 * - Clears any pending ask states
	 * - Resets abort and streaming flags
	 * - Ensures next API call includes full context
	 * - Immediately continues task loop without user interaction
	 */
	public async resumeAfterDelegation(): Promise<void> {
		// Clear any ask states that might have been set during history load
		this.task.idleAsk = undefined
		this.task.resumableAsk = undefined
		this.task.interactiveAsk = undefined

		// Reset abort and streaming state to ensure clean continuation
		this.task.abort = false
		this.task.abandoned = false
		this.task.abortReason = undefined
		this.task.didFinishAbortingStream = false
		this.task.isStreaming = false
		this.task.isWaitingForFirstChunk = false

		// Ensure next API call includes full context after delegation
		this.task.skipPrevResponseIdOnce = true

		// Mark as initialized and active
		this.task.isInitialized = true
		this.task.emit(MirrorVSEventName.TaskActive, this.task.taskId)

		// Load conversation history if not already loaded
		if (this.task.apiConversationHistory.length === 0) {
			this.task.apiConversationHistory = await this.getSavedApiConversationHistory()
		}

		// Add environment details to the existing last user message (which contains the tool_result)
		// This avoids creating a new user message which would cause consecutive user messages
		const environmentDetails = await getEnvironmentDetails(this.task, true)
		let lastUserMsgIndex = -1
		for (let i = this.task.apiConversationHistory.length - 1; i >= 0; i--) {
			if (this.task.apiConversationHistory[i].role === "user") {
				lastUserMsgIndex = i
				break
			}
		}
		if (lastUserMsgIndex >= 0) {
			const lastUserMsg = this.task.apiConversationHistory[lastUserMsgIndex]
			if (Array.isArray(lastUserMsg.content)) {
				// Remove any existing environment_details blocks before adding fresh ones
				const contentWithoutEnvDetails = lastUserMsg.content.filter(
					(block: Anthropic.Messages.ContentBlockParam) => {
						if (block.type === "text" && typeof block.text === "string") {
							const isEnvironmentDetailsBlock =
								block.text.trim().startsWith("<environment_details>") &&
								block.text.trim().endsWith("</environment_details>")
							return !isEnvironmentDetailsBlock
						}
						return true
					},
				)
				// Add fresh environment details
				lastUserMsg.content = [...contentWithoutEnvDetails, { type: "text" as const, text: environmentDetails }]
			}
		}

		// Save the updated history
		await this.task.conversationHistory.saveApiConversationHistory()

		// Continue task loop - pass empty array to signal no new user content needed
		// The initiateTaskLoop will handle this by skipping user message addition
		await this.task.initiateTaskLoop([])
	}

	// ── Private helpers ──

	private async getSavedApiConversationHistory(): Promise<ApiMessage[]> {
		return readApiMessages({ taskId: this.task.taskId, globalStoragePath: this.task.globalStoragePath })
	}

	private async getEnabledMcpToolsCount(): Promise<{ enabledToolCount: number; enabledServerCount: number }> {
		try {
			const provider = this.task.providerRef.deref()
			if (!provider) {
				return { enabledToolCount: 0, enabledServerCount: 0 }
			}

			const { mcpEnabled } = (await provider.getState()) ?? {}
			if (!(mcpEnabled ?? true)) {
				return { enabledToolCount: 0, enabledServerCount: 0 }
			}

			const mcpHub = await McpServerManager.getInstance(provider.context, provider)
			if (!mcpHub) {
				return { enabledToolCount: 0, enabledServerCount: 0 }
			}

			const servers = mcpHub.getServers()
			return countEnabledMcpTools(servers)
		} catch (error) {
			console.error("[Task#getEnabledMcpToolsCount] Error counting MCP tools:", error)
			return { enabledToolCount: 0, enabledServerCount: 0 }
		}
	}
}

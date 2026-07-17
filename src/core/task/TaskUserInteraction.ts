import { MirrorVSEventName } from "@mirror-vs/types"
import type {
	MirrorMessage,
	MirrorSay,
	MirrorAsk,
	ToolProgressStatus,
	ContextCondense,
	ContextTruncation,
	ToolName,
	ProviderSettings,
} from "@mirror-vs/types"
import { isInteractiveAsk, isResumableAsk, isIdleAsk } from "@mirror-vs/types"

import pWaitFor from "p-wait-for"

import { AskIgnoredError } from "./AskIgnoredError"
import { findLastIndex } from "../../shared/array"
import { MirrorAskResponse } from "../../shared/WebviewMessage"
import { formatResponse } from "../prompts/responses"
import { checkAutoApproval } from "../auto-approval"
import { buildApiHandler } from "../../api"

import type { Task } from "./Task"

/**
 * Manages user interaction for a Task: ask/say/response.
 *
 * Handles:
 * - Asking the user questions and waiting for response
 * - Saying messages to the user
 * - Draining queued messages
 * - Auto-approval timeout management
 * - API configuration updates
 * - Terminal operation delegation
 */
export class TaskUserInteraction {
	constructor(private readonly task: Task) {}

	// ── Private helpers ──

	private get mirrorMessages(): MirrorMessage[] {
		return this.task.mirrorMessages
	}

	// ── Public API ──

	// Note that `partial` has three valid states true (partial message),
	// false (completion of partial message), undefined (individual complete
	// message).
	async ask(
		type: MirrorAsk,
		text?: string,
		partial?: boolean,
		progressStatus?: ToolProgressStatus,
		isProtected?: boolean,
	): Promise<{ response: MirrorAskResponse; text?: string; images?: string[] }> {
		// If this Mirror instance was aborted by the provider, then the only
		// thing keeping us alive is a promise still running in the background,
		// in which case we don't want to send its result to the webview as it
		// is attached to a new instance of Mirror now. So we can safely ignore
		// the result of any active promises, and this class will be
		// deallocated. (Although we set Mirror = undefined in provider, that
		// simply removes the reference to this instance, but the instance is
		// still alive until this promise resolves or rejects.)
		if (this.task.abort) {
			throw new Error(`[MirrorVS#ask] task ${this.task.taskId}.${this.task.instanceId} aborted`)
		}

		let askTs: number

		if (partial !== undefined) {
			const lastMessage = this.mirrorMessages.at(-1)

			const isUpdatingPreviousPartial =
				lastMessage && lastMessage.partial && lastMessage.type === "ask" && lastMessage.ask === type

			if (partial) {
				if (isUpdatingPreviousPartial) {
					// Existing partial message, so update it.
					lastMessage.text = text
					lastMessage.partial = partial
					lastMessage.progressStatus = progressStatus
					lastMessage.isProtected = isProtected
					// TODO: Be more efficient about saving and posting only new
					// data or one whole message at a time so ignore partial for
					// saves, and only post parts of partial message instead of
					// whole array in new listener.
					this.task.mirrorMessagesManager.updateMirrorMessage(lastMessage)
					// console.log("Task#ask: current ask promise was ignored (#1)")
					throw new AskIgnoredError("updating existing partial")
				} else {
					// This is a new partial message, so add it with partial
					// state.
					askTs = Date.now()
					this.task.lastMessageTs = askTs
					await this.task.mirrorMessagesManager.addToMirrorMessages({
						ts: askTs,
						type: "ask",
						ask: type,
						text,
						partial,
						isProtected,
					})
					// console.log("Task#ask: current ask promise was ignored (#2)")
					throw new AskIgnoredError("new partial")
				}
			} else {
				if (isUpdatingPreviousPartial) {
					// This is the complete version of a previously partial
					// message, so replace the partial with the complete version.
					this.task.askResponse = undefined
					this.task.askResponseText = undefined
					this.task.askResponseImages = undefined

					// Bug for the history books:
					// In the webview we use the ts as the chatrow key for the
					// virtuoso list. Since we would update this ts right at the
					// end of streaming, it would cause the view to flicker. The
					// key prop has to be stable otherwise react has trouble
					// reconciling items between renders, causing unmounting and
					// remounting of components (flickering).
					// The lesson here is if you see flickering when rendering
					// lists, it's likely because the key prop is not stable.
					// So in this case we must make sure that the message ts is
					// never altered after first setting it.
					askTs = lastMessage.ts
					this.task.lastMessageTs = askTs
					lastMessage.text = text
					lastMessage.partial = false
					lastMessage.progressStatus = progressStatus
					lastMessage.isProtected = isProtected
					await this.task.mirrorMessagesManager.saveMirrorMessages()
					this.task.mirrorMessagesManager.updateMirrorMessage(lastMessage)
				} else {
					// This is a new and complete message, so add it like normal.
					this.task.askResponse = undefined
					this.task.askResponseText = undefined
					this.task.askResponseImages = undefined
					askTs = Date.now()
					this.task.lastMessageTs = askTs
					await this.task.mirrorMessagesManager.addToMirrorMessages({
						ts: askTs,
						type: "ask",
						ask: type,
						text,
						isProtected,
					})
				}
			}
		} else {
			// This is a new non-partial message, so add it like normal.
			this.task.askResponse = undefined
			this.task.askResponseText = undefined
			this.task.askResponseImages = undefined
			askTs = Date.now()
			this.task.lastMessageTs = askTs
			await this.task.mirrorMessagesManager.addToMirrorMessages({
				ts: askTs,
				type: "ask",
				ask: type,
				text,
				isProtected,
			})
		}

		let timeouts: NodeJS.Timeout[] = []

		// Automatically approve if the ask according to the user's settings.
		const provider = this.task.providerRef.deref()
		const state = provider ? await provider.getState() : undefined
		const approval = await checkAutoApproval({ state, ask: type, text, isProtected })

		if (approval.decision === "approve") {
			this.approveAsk()
		} else if (approval.decision === "deny") {
			this.denyAsk()
		} else if (approval.decision === "timeout") {
			// Store the auto-approval timeout so it can be cancelled if user interacts
			this.task.autoApprovalTimeoutRef = setTimeout(() => {
				const { askResponse, text, images } = approval.fn()
				this.handleWebviewAskResponse(askResponse, text, images)
				this.task.autoApprovalTimeoutRef = undefined
			}, approval.timeout)
			timeouts.push(this.task.autoApprovalTimeoutRef)
		}

		// The state is mutable if the message is complete and the task will
		// block (via the `pWaitFor`).
		const isBlocking = !(this.task.askResponse !== undefined || this.task.lastMessageTs !== askTs)
		const isStatusMutable = !partial && isBlocking && approval.decision === "ask"

		if (isStatusMutable) {
			const statusMutationTimeout = 2_000

			if (isInteractiveAsk(type)) {
				timeouts.push(
					setTimeout(() => {
						const message = this.task.mirrorMessagesManager.findMessageByTimestamp(askTs)

						if (message) {
							this.task.interactiveAsk = message
							this.task.emit(MirrorVSEventName.TaskInteractive, this.task.taskId)
							provider?.postMessageToWebview({ type: "interactionRequired" })
						}
					}, statusMutationTimeout),
				)
			} else if (isResumableAsk(type)) {
				timeouts.push(
					setTimeout(() => {
						const message = this.task.mirrorMessagesManager.findMessageByTimestamp(askTs)

						if (message) {
							this.task.resumableAsk = message
							this.task.emit(MirrorVSEventName.TaskResumable, this.task.taskId)
						}
					}, statusMutationTimeout),
				)
			} else if (isIdleAsk(type)) {
				timeouts.push(
					setTimeout(() => {
						const message = this.task.mirrorMessagesManager.findMessageByTimestamp(askTs)

						if (message) {
							this.task.idleAsk = message
							this.task.emit(MirrorVSEventName.TaskIdle, this.task.taskId)
						}
					}, statusMutationTimeout),
				)
			}
		}

		// Attempt to drain any queued messages before blocking.
		// Messages may have been queued while the previous API round was
		// streaming (when the last mirror message is a "say", not an "ask"),
		// so tryDrainQueuedMessage's guard would have failed at that time.
		// Now that we've presented a new ask, try draining immediately so
		// we don't block forever waiting for user input.
		this.tryDrainQueuedMessage()

		// Wait for askResponse to be set
		await pWaitFor(
			() => {
				if (this.task.askResponse !== undefined || this.task.lastMessageTs !== askTs) {
					return true
				}

				return false
			},
			{ interval: 100 },
		)

		if (this.task.lastMessageTs !== askTs) {
			// Could happen if we send multiple asks in a row i.e. with
			// command_output. It's important that when we know an ask could
			// fail, it is handled gracefully.
			throw new AskIgnoredError("superseded")
		}

		const result = {
			response: this.task.askResponse!,
			text: this.task.askResponseText,
			images: this.task.askResponseImages,
		}
		this.task.askResponse = undefined
		this.task.askResponseText = undefined
		this.task.askResponseImages = undefined

		// Cancel the timeouts if they are still running.
		timeouts.forEach((timeout) => clearTimeout(timeout))

		// Switch back to an active state.
		if (this.task.idleAsk || this.task.resumableAsk || this.task.interactiveAsk) {
			this.task.idleAsk = undefined
			this.task.resumableAsk = undefined
			this.task.interactiveAsk = undefined
			this.task.emit(MirrorVSEventName.TaskActive, this.task.taskId)
		}

		this.task.emit(MirrorVSEventName.TaskAskResponded)
		return result
	}

	public handleWebviewAskResponse(askResponse: MirrorAskResponse, text?: string, images?: string[]) {
		// Clear any pending auto-approval timeout when user responds
		this.cancelAutoApprovalTimeout()

		this.task.askResponse = askResponse
		this.task.askResponseText = text
		this.task.askResponseImages = images

		// Create a checkpoint whenever the user sends a message.
		// Use allowEmpty=true to ensure a checkpoint is recorded even if there are no file changes.
		// Suppress the checkpoint_saved chat row for this particular checkpoint to keep the timeline clean.
		if (askResponse === "messageResponse") {
			void this.task.checkpointSave(false, true)
		}

		// Mark the last follow-up question as answered
		if (askResponse === "messageResponse" || askResponse === "yesButtonClicked") {
			// Find the last unanswered follow-up message using findLastIndex
			const lastFollowUpIndex = findLastIndex(
				this.mirrorMessages,
				(msg) => msg.type === "ask" && msg.ask === "followup" && !msg.isAnswered,
			)

			if (lastFollowUpIndex !== -1) {
				// Mark this follow-up as answered
				this.mirrorMessages[lastFollowUpIndex].isAnswered = true
				// Save the updated messages
				this.task.mirrorMessagesManager.saveMirrorMessages().catch((error) => {
					console.error("Failed to save answered follow-up state:", error)
				})
			}
		}

		// Mark the last tool-approval ask as answered when user approves (or auto-approval)
		if (askResponse === "yesButtonClicked") {
			const lastToolAskIndex = findLastIndex(
				this.mirrorMessages,
				(msg) => msg.type === "ask" && msg.ask === "tool" && !msg.isAnswered,
			)
			if (lastToolAskIndex !== -1) {
				this.mirrorMessages[lastToolAskIndex].isAnswered = true
				this.task.mirrorMessagesManager.updateMirrorMessage(this.mirrorMessages[lastToolAskIndex])
				this.task.mirrorMessagesManager.saveMirrorMessages().catch((error) => {
					console.error("Failed to save answered tool-ask state:", error)
				})
			}
		}
	}

	/**
	 * Cancel any pending auto-approval timeout.
	 * Called when user interacts (types, clicks buttons, etc.) to prevent the timeout from firing.
	 */
	public cancelAutoApprovalTimeout(): void {
		if (this.task.autoApprovalTimeoutRef) {
			clearTimeout(this.task.autoApprovalTimeoutRef)
			this.task.autoApprovalTimeoutRef = undefined
		}
	}

	/**
	 * Attempt to drain one queued message if the task is blocked on a
	 * text-accepting ask (followup, tool, completion_result, resume_task).
	 * Returns true if a message was drained, false otherwise.
	 *
	 * For completion_result / resume_completed_task (terminal asks):
	 *   Dequeue one message at a time as messageResponse (user feedback).
	 *   This lets AttemptCompletionTool push it as a tool_result to the API
	 *   conversation, so the model sees it, processes it, and calls
	 *   attempt_completion again.  Each subsequent completion_result
	 *   drains the next queued message until the queue is empty.  Only
	 *   then does yesButtonClicked fire, letting the task truly complete.
	 *
	 * Re-entrant guard: dequeueMessage() emits stateChanged synchronously,
	 * which triggers the constructor's handler which calls this again.  We
	 * use a boolean flag to prevent draining a second message before the
	 * outer call sets askResponse.
	 */
	public tryDrainQueuedMessage(): boolean {
		if (this.task._draining) {
			return false
		}
		this.task._draining = true
		try {
			if (this.task.askResponse === undefined && !this.task.messageQueueService.isEmpty()) {
				const lastMessage = this.mirrorMessages.at(-1)
				if (lastMessage?.type === "ask" && lastMessage.ts === this.task.lastMessageTs) {
					// command_output asks should not drain queued messages as inline feedback
					if (lastMessage.ask === "command_output") {
						return false
					}

					// All other asks (including completion_result, resume_completed_task,
					// followup, tool, resume_task) drain one queued message as user feedback.
					const queued = this.task.messageQueueService.dequeueMessage()
					if (queued) {
						this.handleWebviewAskResponse("messageResponse", queued.text, queued.images)
						return true
					}
				}
			}
			return false
		} finally {
			this.task._draining = false
		}
	}

	public approveAsk({ text, images }: { text?: string; images?: string[] } = {}) {
		this.handleWebviewAskResponse("yesButtonClicked", text, images)
	}

	public denyAsk({ text, images }: { text?: string; images?: string[] } = {}) {
		this.handleWebviewAskResponse("noButtonClicked", text, images)
	}

	public supersedePendingAsk(): void {
		this.task.lastMessageTs = Date.now()
	}

	/**
	 * Updates the API configuration and rebuilds the API handler.
	 * There is no tool-protocol switching or tool parser swapping.
	 *
	 * @param newApiConfiguration - The new API configuration to use
	 */
	public updateApiConfiguration(newApiConfiguration: ProviderSettings): void {
		// Update the configuration and rebuild the API handler
		this.task.apiConfiguration = newApiConfiguration
		this.task.api = buildApiHandler(this.task.apiConfiguration)
	}

	public async submitUserMessage(
		text: string,
		images?: string[],
		mode?: string,
		providerProfile?: string,
	): Promise<void> {
		try {
			text = (text ?? "").trim()
			images = images ?? []

			if (text.length === 0 && images.length === 0) {
				return
			}

			const provider = this.task.providerRef.deref()

			if (provider) {
				if (mode) {
					await provider.setMode(mode)
				}

				if (providerProfile) {
					await provider.setProviderProfile(providerProfile)

					// Update this task's API configuration to match the new profile
					// This ensures the parser state is synchronized with the selected model
					const newState = await provider.getState()
					if (newState?.apiConfiguration) {
						this.updateApiConfiguration(newState.apiConfiguration)
					}
				}

				this.task.emit(MirrorVSEventName.TaskUserMessage, this.task.taskId)

				// Handle the message directly instead of routing through the webview.
				// This avoids a race condition where the webview's message state hasn't
				// hydrated yet, causing it to interpret the message as a new task request.
				this.handleWebviewAskResponse("messageResponse", text, images)
			} else {
				console.error("[Task#submitUserMessage] Provider reference lost")
			}
		} catch (error) {
			console.error("[Task#submitUserMessage] Failed to submit user message:", error)
		}
	}

	async handleTerminalOperation(terminalOperation: "continue" | "abort") {
		if (terminalOperation === "continue") {
			this.task.terminalProcess?.continue()
		} else if (terminalOperation === "abort") {
			this.task.terminalProcess?.abort()
		}
	}

	async say(
		type: MirrorSay,
		text?: string,
		images?: string[],
		partial?: boolean,
		checkpoint?: Record<string, unknown>,
		progressStatus?: ToolProgressStatus,
		options: {
			isNonInteractive?: boolean
		} = {},
		contextCondense?: ContextCondense,
		contextTruncation?: ContextTruncation,
	): Promise<undefined> {
		if (this.task.abort) {
			throw new Error(`[MirrorVS#say] task ${this.task.taskId}.${this.task.instanceId} aborted`)
		}

		if (partial !== undefined) {
			const lastMessage = this.mirrorMessages.at(-1)

			const isUpdatingPreviousPartial =
				lastMessage && lastMessage.partial && lastMessage.type === "say" && lastMessage.say === type

			if (partial) {
				if (isUpdatingPreviousPartial) {
					// Existing partial message, so update it.
					lastMessage.text = text
					lastMessage.images = images
					lastMessage.partial = partial
					lastMessage.progressStatus = progressStatus
					this.task.mirrorMessagesManager.updateMirrorMessage(lastMessage)
				} else {
					// This is a new partial message, so add it with partial state.
					const sayTs = Date.now()

					if (!options.isNonInteractive) {
						this.task.lastMessageTs = sayTs
					}

					await this.task.mirrorMessagesManager.addToMirrorMessages({
						ts: sayTs,
						type: "say",
						say: type,
						text,
						images,
						partial,
						contextCondense,
						contextTruncation,
					})
				}
			} else {
				// New now have a complete version of a previously partial message.
				// This is the complete version of a previously partial
				// message, so replace the partial with the complete version.
				if (isUpdatingPreviousPartial) {
					if (!options.isNonInteractive) {
						this.task.lastMessageTs = lastMessage.ts
					}

					lastMessage.text = text
					lastMessage.images = images
					lastMessage.partial = false
					lastMessage.progressStatus = progressStatus

					// Instead of streaming partialMessage events, we do a save
					// and post like normal to persist to disk.
					await this.task.mirrorMessagesManager.saveMirrorMessages()

					// More performant than an entire `postStateToWebview`.
					this.task.mirrorMessagesManager.updateMirrorMessage(lastMessage)
				} else {
					// This is a new and complete message, so add it like normal.
					const sayTs = Date.now()

					if (!options.isNonInteractive) {
						this.task.lastMessageTs = sayTs
					}

					await this.task.mirrorMessagesManager.addToMirrorMessages({
						ts: sayTs,
						type: "say",
						say: type,
						text,
						images,
						contextCondense,
						contextTruncation,
					})
				}
			}
		} else {
			// This is a new non-partial message, so add it like normal.
			const sayTs = Date.now()

			// A "non-interactive" message is a message is one that the user
			// does not need to respond to. We don't want these message types
			// to trigger an update to `lastMessageTs` since they can be created
			// asynchronously and could interrupt a pending ask.
			if (!options.isNonInteractive) {
				this.task.lastMessageTs = sayTs
			}

			await this.task.mirrorMessagesManager.addToMirrorMessages({
				ts: sayTs,
				type: "say",
				say: type,
				text,
				images,
				checkpoint,
				contextCondense,
				contextTruncation,
			})
		}
	}

	async sayAndCreateMissingParamError(toolName: ToolName, paramName: string, relPath?: string) {
		await this.say(
			"error",
			`Mirror VS tried to use ${toolName}${
				relPath ? ` for '${relPath.toPosix()}'` : ""
			} without value for required parameter '${paramName}'. Retrying...`,
		)
		return formatResponse.toolError(formatResponse.missingToolParameterError(paramName))
	}
}

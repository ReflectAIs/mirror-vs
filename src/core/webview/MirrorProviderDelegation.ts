import * as vscode from "vscode"

import { MirrorVSEventName } from "@mirror-vs/types"
import type { HistoryItem, CreateTaskOptions, MirrorVSSettings, TodoItem } from "@mirror-vs/types"
import type { MirrorMessage } from "@mirror-vs/types"

import { Task } from "../task/Task"
import { readApiMessages, saveApiMessages, saveTaskMessages } from "../task-persistence"
import { readTaskMessages } from "../task-persistence/taskMessages"
import { validateAndFixToolResultIds } from "../task/validateToolResultIds"

import type { MirrorProvider } from "./MirrorProvider"

/**
 * Manages parent/child task delegation flows.
 *
 * Responsibilities:
 * - Flushing parent tool results before delegation (critical for API contract)
 * - Enforcing single-open-task invariant via removeMirrorFromStack
 * - Persisting parent delegation metadata (status, childIds, delegatedToId)
 * - Creating child tasks with deferred start (preventing race conditions)
 * - Reopening parent tasks with synthetic tool_result injection
 * - Emitting delegation lifecycle events (TaskDelegated, TaskDelegationCompleted, TaskDelegationResumed)
 */
export class DelegationManager {
	constructor(private provider: MirrorProvider) {}

	/**
	 * Delegate parent task and open child task.
	 *
	 * - Enforce single-open invariant
	 * - Persist parent delegation metadata
	 * - Emit TaskDelegated (provider-level)
	 * - Create child as sole active and switch mode to child's mode
	 */
	public async delegateParentAndOpenChild(params: {
		parentTaskId: string
		message: string
		initialTodos: TodoItem[]
		mode: string
	}): Promise<Task> {
		const { parentTaskId, message, initialTodos, mode } = params

		// Metadata-driven delegation is always enabled

		// 1) Get parent (must be current task)
		const parent = this.provider.getCurrentTask()
		if (!parent) {
			throw new Error("[delegateParentAndOpenChild] No current task")
		}
		if (parent.taskId !== parentTaskId) {
			throw new Error(
				`[delegateParentAndOpenChild] Parent mismatch: expected ${parentTaskId}, current ${parent.taskId}`,
			)
		}
		// 2) Flush pending tool results to API history BEFORE disposing the parent.
		//    This is critical: when tools are called before new_task,
		//    their tool_result blocks are in userMessageContent but not yet saved to API history.
		//    If we don't flush them, the parent's API conversation will be incomplete and
		//    cause 400 errors when resumed (missing tool_result for tool_use blocks).
		//
		//    NOTE: We do NOT pass the assistant message here because the assistant message
		//    is already added to apiConversationHistory by the normal flow in
		//    recursivelyMakeMirrorRequests BEFORE tools start executing. We only need to
		//    flush the pending user message with tool_results.
		try {
			const flushSuccess = await parent.flushPendingToolResultsToHistory()

			if (!flushSuccess) {
				console.warn(`[delegateParentAndOpenChild] Flush failed for parent ${parentTaskId}, retrying...`)
				const retrySuccess = await parent.retrySaveApiConversationHistory()

				if (!retrySuccess) {
					console.error(
						`[delegateParentAndOpenChild] CRITICAL: Parent ${parentTaskId} API history not persisted to disk. Child return may produce stale state.`,
					)
					vscode.window.showWarningMessage(
						"Warning: Parent task state could not be saved. The parent task may lose recent context when resumed.",
					)
				}
			}
		} catch (error) {
			this.provider.log(
				`[delegateParentAndOpenChild] Error flushing pending tool results (non-fatal): ${
					error instanceof Error ? error.message : String(error)
				}`,
			)
		}

		// 3) Enforce single-open invariant by closing/disposing the parent first
		//    This ensures we never have >1 tasks open at any time during delegation.
		//    Await abort completion to ensure clean disposal and prevent unhandled rejections.
		try {
			await this.provider.removeMirrorFromStack({ skipDelegationRepair: true })
		} catch (error) {
			this.provider.log(
				`[delegateParentAndOpenChild] Error during parent disposal (non-fatal): ${
					error instanceof Error ? error.message : String(error)
				}`,
			)
			// Non-fatal: proceed with child creation even if parent cleanup had issues
		}

		// 3) Switch provider mode to child's requested mode BEFORE creating the child task
		//    This ensures the child's system prompt and configuration are based on the correct mode.
		//    The mode switch must happen before createTask() because the Task constructor
		//    initializes its mode from provider.getState() during initializeTaskMode().
		try {
			await this.provider.handleModeSwitch(mode as any)
		} catch (e) {
			this.provider.log(
				`[delegateParentAndOpenChild] handleModeSwitch failed for mode '${mode}': ${
					(e as Error)?.message ?? String(e)
				}`,
			)
		}

		// 4) Create child as sole active (parent reference preserved for lineage)
		// Pass initialStatus: "active" to ensure the child task's historyItem is created
		// with status from the start, avoiding race conditions where the task might
		// call attempt_completion before status is persisted separately.
		//
		// Pass startTask: false to prevent the child from beginning its task loop
		// (and writing to globalState via saveMirrorMessages → updateTaskHistory)
		// before we persist the parent's delegation metadata in step 5.
		// Without this, the child's fire-and-forget startTask() races with step 5,
		// and the last writer to globalState overwrites the other's changes—
		// causing the parent's delegation fields to be lost.
		const child = await this.provider.createTask(message, undefined, parent as any, {
			initialTodos,
			initialStatus: "active",
			startTask: false,
		})

		// 5) Persist parent delegation metadata BEFORE the child starts writing.
		try {
			const { historyItem } = await this.provider.getTaskWithId(parentTaskId)
			const childIds = Array.from(new Set([...(historyItem.childIds ?? []), child.taskId]))
			const updatedHistory: typeof historyItem = {
				...historyItem,
				status: "delegated",
				delegatedToId: child.taskId,
				awaitingChildId: child.taskId,
				childIds,
			}
			await this.provider.updateTaskHistory(updatedHistory)
		} catch (err) {
			this.provider.log(
				`[delegateParentAndOpenChild] Failed to persist parent metadata for ${parentTaskId} -> ${child.taskId}: ${
					(err as Error)?.message ?? String(err)
				}`,
			)
		}

		// 6) Start the child task now that parent metadata is safely persisted.
		child.start()

		// 7) Emit TaskDelegated (provider-level)
		try {
			this.provider.emit(MirrorVSEventName.TaskDelegated, parentTaskId, child.taskId)
		} catch {
			// non-fatal
		}

		return child
	}

	/**
	 * Reopen parent task from delegation with write-back and events.
	 */
	public async reopenParentFromDelegation(params: {
		parentTaskId: string
		childTaskId: string
		completionResultSummary: string
	}): Promise<void> {
		const { parentTaskId, childTaskId, completionResultSummary } = params
		const globalStoragePath = this.provider.contextProxy.globalStorageUri.fsPath

		// 1) Load parent from history and current persisted messages
		const { historyItem } = await this.provider.getTaskWithId(parentTaskId)

		let parentMirrorMessages: MirrorMessage[] = []
		try {
			parentMirrorMessages = await readTaskMessages({
				taskId: parentTaskId,
				globalStoragePath,
			})
		} catch {
			parentMirrorMessages = []
		}

		let parentApiMessages: any[] = []
		try {
			parentApiMessages = (await readApiMessages({
				taskId: parentTaskId,
				globalStoragePath,
			})) as any[]
		} catch {
			parentApiMessages = []
		}

		// 2) Inject synthetic records: UI subtask_result and update API tool_result
		const ts = Date.now()

		// Defensive: ensure arrays
		if (!Array.isArray(parentMirrorMessages)) parentMirrorMessages = []
		if (!Array.isArray(parentApiMessages)) parentApiMessages = []

		const subtaskUiMessage: MirrorMessage = {
			type: "say",
			say: "subtask_result",
			text: completionResultSummary,
			ts,
		}
		parentMirrorMessages.push(subtaskUiMessage)
		await saveTaskMessages({ messages: parentMirrorMessages, taskId: parentTaskId, globalStoragePath })

		// Find the tool_use_id from the last assistant message's new_task tool_use
		let toolUseId: string | undefined
		for (let i = parentApiMessages.length - 1; i >= 0; i--) {
			const msg = parentApiMessages[i]
			if (msg.role === "assistant" && Array.isArray(msg.content)) {
				for (const block of msg.content) {
					if (block.type === "tool_use" && block.name === "new_task") {
						toolUseId = block.id
						break
					}
				}
				if (toolUseId) break
			}
		}

		// Preferred: if the parent history contains the native tool_use for new_task,
		// inject a matching tool_result for the Anthropic message contract:
		// user → assistant (tool_use) → user (tool_result)
		if (toolUseId) {
			// Check if the last message is already a user message with a tool_result for this tool_use_id
			// (in case this is a retry or the history was already updated)
			const lastMsg = parentApiMessages[parentApiMessages.length - 1]
			let alreadyHasToolResult = false
			if (lastMsg?.role === "user" && Array.isArray(lastMsg.content)) {
				for (const block of lastMsg.content) {
					if (block.type === "tool_result" && block.tool_use_id === toolUseId) {
						// Update the existing tool_result content
						block.content = `Subtask ${childTaskId} completed.\n\nResult:\n${completionResultSummary}`
						alreadyHasToolResult = true
						break
					}
				}
			}

			// If no existing tool_result found, create a NEW user message with the tool_result
			if (!alreadyHasToolResult) {
				parentApiMessages.push({
					role: "user",
					content: [
						{
							type: "tool_result" as const,
							tool_use_id: toolUseId,
							content: `Subtask ${childTaskId} completed.\n\nResult:\n${completionResultSummary}`,
						},
					],
					ts,
				})
			}

			// Validate the newly injected tool_result against the preceding assistant message.
			// This ensures the tool_result's tool_use_id matches a tool_use in the immediately
			// preceding assistant message (Anthropic API requirement).
			const lastMessage = parentApiMessages[parentApiMessages.length - 1]
			if (lastMessage?.role === "user") {
				const validatedMessage = validateAndFixToolResultIds(lastMessage, parentApiMessages.slice(0, -1))
				parentApiMessages[parentApiMessages.length - 1] = validatedMessage
			}
		} else {
			// If there is no corresponding tool_use in the parent API history, we cannot emit a
			// tool_result. Fall back to a plain user text note so the parent can still resume.
			parentApiMessages.push({
				role: "user",
				content: [
					{
						type: "text" as const,
						text: `Subtask ${childTaskId} completed.\n\nResult:\n${completionResultSummary}`,
					},
				],
				ts,
			})
		}

		await saveApiMessages({ messages: parentApiMessages as any, taskId: parentTaskId, globalStoragePath })

		// 3) Close child instance if still open (single-open-task invariant).
		//    This MUST happen BEFORE updating the child's status to "completed" because
		//    removeMirrorFromStack() → abortTask(true) → saveMirrorMessages() writes
		//    the historyItem with initialStatus (typically "active"), which would
		//    overwrite a "completed" status set earlier.
		const current = this.provider.getCurrentTask()
		if (current?.taskId === childTaskId) {
			await this.provider.removeMirrorFromStack()
		}

		// 4) Update child metadata to "completed" status.
		//    This runs after the abort so it overwrites the stale "active" status
		//    that saveMirrorMessages() may have written during step 3.
		try {
			const { historyItem: childHistory } = await this.provider.getTaskWithId(childTaskId)
			await this.provider.updateTaskHistory({
				...childHistory,
				status: "completed",
			})
		} catch (err) {
			this.provider.log(
				`[reopenParentFromDelegation] Failed to persist child completed status for ${childTaskId}: ${
					(err as Error)?.message ?? String(err)
				}`,
			)
		}

		// 5) Update parent metadata and persist BEFORE emitting completion event
		const childIds = Array.from(new Set([...(historyItem.childIds ?? []), childTaskId]))
		const updatedHistory: typeof historyItem = {
			...historyItem,
			status: "active",
			completedByChildId: childTaskId,
			completionResultSummary,
			awaitingChildId: undefined,
			childIds,
		}
		await this.provider.updateTaskHistory(updatedHistory)

		// 6) Emit TaskDelegationCompleted (provider-level)
		try {
			this.provider.emit(
				MirrorVSEventName.TaskDelegationCompleted,
				parentTaskId,
				childTaskId,
				completionResultSummary,
			)
		} catch {
			// non-fatal
		}

		// 7) Reopen the parent from history as the sole active task (restores saved mode)
		//    IMPORTANT: startTask=false to suppress resume-from-history ask scheduling
		const parentInstance = await this.provider.createTaskWithHistoryItem(updatedHistory, { startTask: false })

		// 8) Inject restored histories into the in-memory instance before resuming
		if (parentInstance) {
			try {
				await parentInstance.overwriteMirrorMessages(parentMirrorMessages)
			} catch {
				// non-fatal
			}
			try {
				await parentInstance.overwriteApiConversationHistory(parentApiMessages as any)
			} catch {
				// non-fatal
			}

			// Auto-resume parent without ask("resume_task")
			await parentInstance.resumeAfterDelegation()
		}

		// 9) Emit TaskDelegationResumed (provider-level)
		try {
			this.provider.emit(MirrorVSEventName.TaskDelegationResumed, parentTaskId, childTaskId)
		} catch {
			// non-fatal
		}
	}
}

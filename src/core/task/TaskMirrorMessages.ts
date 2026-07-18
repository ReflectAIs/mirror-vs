import { MirrorVSEventName } from "@mirror-vs/types"
import type { MirrorMessage, TokenUsage, ToolUsage } from "@mirror-vs/types"

import { defaultModeSlug } from "../../shared/modes"

import { readTaskMessages, saveTaskMessages, taskMetadata } from "../task-persistence"
import { restoreTodoListForTask } from "../tools/UpdateTodoListTool"

import type { Task } from "./Task"

/**
 * Manages Mirror Message persistence for a Task.
 *
 * Handles:
 * - Loading/saving mirror messages to disk
 * - Adding, overwriting, and updating messages
 * - Finding messages by timestamp
 * - Emitting token/tool usage updates via debounced function
 */
export class TaskMirrorMessages {
	constructor(private readonly task: Task) {}

	// ── Private helpers ──

	private get mirrorMessages(): MirrorMessage[] {
		return this.task.mirrorMessages
	}

	private set mirrorMessages(value: MirrorMessage[]) {
		this.task.mirrorMessages = value
	}

	private get taskId(): string {
		return this.task.taskId
	}

	private get globalStoragePath(): string {
		return this.task.globalStoragePath
	}

	private get cwd(): string | undefined {
		return this.task.cwd
	}

	private get rootTaskId(): string | undefined {
		return this.task.rootTaskId
	}

	private get parentTaskId(): string | undefined {
		return this.task.parentTaskId
	}

	private get taskNumber(): number {
		return this.task.taskNumber
	}

	private get sessionId(): string | undefined {
		return this.task.sessionId
	}

	// ── Public API ──

	async getSavedMirrorMessages(): Promise<MirrorMessage[]> {
		return readTaskMessages({ taskId: this.taskId, globalStoragePath: this.globalStoragePath })
	}

	async addToMirrorMessages(message: MirrorMessage) {
		this.mirrorMessages.push(message)
		const provider = this.task.providerRef.deref()
		// Avoid resending large, mostly-static fields (notably taskHistory) on every chat message update.
		// taskHistory is maintained in-memory in the webview and updated via taskHistoryItemUpdated.
		await provider?.postStateToWebviewWithoutTaskHistory()
		this.task.emit(MirrorVSEventName.Message, { action: "created", message })
		await this.saveMirrorMessages()
	}

	async overwriteMirrorMessages(newMessages: MirrorMessage[]) {
		this.mirrorMessages = newMessages
		restoreTodoListForTask(this.task)
		await this.saveMirrorMessages()
	}

	async updateMirrorMessage(message: MirrorMessage) {
		const provider = this.task.providerRef.deref()
		await provider?.postMessageToWebview({ type: "messageUpdated", mirrorMessage: message })
		this.task.emit(MirrorVSEventName.Message, { action: "updated", message })
	}

	async saveMirrorMessages(): Promise<boolean> {
		try {
			await saveTaskMessages({
				messages: structuredClone(this.mirrorMessages),
				taskId: this.taskId,
				globalStoragePath: this.globalStoragePath,
			})

			if (this.task._taskApiConfigName === undefined) {
				await this.task.taskApiConfigReady
			}

			const { historyItem, tokenUsage } = await taskMetadata({
				taskId: this.taskId,
				rootTaskId: this.rootTaskId,
				parentTaskId: this.parentTaskId,
				taskNumber: this.taskNumber,
				messages: this.mirrorMessages,
				globalStoragePath: this.globalStoragePath,
				workspace: this.cwd ?? "",
				mode: this.task._taskMode || defaultModeSlug,
				apiConfigName: this.task._taskApiConfigName,
				initialStatus: this.task.initialStatus,
				sessionId: this.sessionId,
			})

			// Emit token/tool usage updates using debounced function
			// The debounce with maxWait ensures:
			// - Immediate first emit (leading: true)
			// - At most one emit per interval during rapid updates (maxWait)
			// - Final state is emitted when updates stop (trailing: true)
			this.task.debouncedEmitTokenUsage(tokenUsage, this.task.toolUsage)

			await this.task.providerRef.deref()?.updateTaskHistory(historyItem)
			return true
		} catch (error) {
			console.error("Failed to save Mirror VS messages:", error)
			return false
		}
	}

	findMessageByTimestamp(ts: number): MirrorMessage | undefined {
		for (let i = this.mirrorMessages.length - 1; i >= 0; i--) {
			if (this.mirrorMessages[i].ts === ts) {
				return this.mirrorMessages[i]
			}
		}

		return undefined
	}
}

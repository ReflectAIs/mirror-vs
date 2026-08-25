import debounce from "lodash.debounce"

import { MirrorVSEventName } from "@mirror-vs/types"
import type { FileEditRecord, MirrorMessage, TokenUsage, ToolUsage } from "@mirror-vs/types"

import { defaultModeSlug } from "../../shared/modes"

import {
	readTaskMessages,
	saveTaskMessages,
	readTaskFileEdits,
	saveTaskFileEdits,
	taskMetadata,
} from "../task-persistence"
import { restoreTodoListForTask } from "../tools/UpdateTodoListTool"

import type { Task } from "./Task"

/**
 * Manages Mirror Message persistence for a Task.
 *
 * Handles:
 * - Loading/saving mirror messages to disk
 * - Loading/saving fileEdits (local-only edit history) to disk
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

	private get fileEdits(): FileEditRecord[] {
		return this.task.fileEdits
	}

	private set fileEdits(value: FileEditRecord[]) {
		this.task.fileEdits = value
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

	async getSavedFileEdits(): Promise<FileEditRecord[]> {
		return readTaskFileEdits({ taskId: this.taskId, globalStoragePath: this.globalStoragePath })
	}

	async addToMirrorMessages(message: MirrorMessage) {
		this.mirrorMessages.push(message)
		const provider = this.task.providerRef.deref()
		if (provider) {
			// If this task is the currently focused tab, post the updated chat state.
			// If it's a background task, post state WITHOUT mirrorMessages so tab indicators/mascots
			// update without replacing or interfering with the active tab's chat.
			if (!provider.getCurrentTask || provider.getCurrentTask()?.taskId === this.taskId) {
				await provider.postStateToWebviewWithoutTaskHistory?.()
			} else {
				await provider.postStateToWebviewWithoutMirrorMessages?.()
			}
		}
		this.task.emit(MirrorVSEventName.Message, { action: "created", message })
		await this.saveMirrorMessages()
	}

	async overwriteMirrorMessages(newMessages: MirrorMessage[]) {
		this.mirrorMessages = newMessages
		restoreTodoListForTask(this.task)
		await this.saveMirrorMessages()
	}

	private debouncedSaveMirrorMessages = debounce(async () => {
		try {
			await this.saveMirrorMessages()
		} catch (err) {
			console.error("Failed to save mirror messages in debounced update:", err)
		}
	}, 1000)

	async updateMirrorMessage(message: MirrorMessage) {
		const provider = this.task.providerRef.deref()
		await provider?.postMessageToWebview?.({
			type: "messageUpdated",
			taskId: this.taskId,
			mirrorMessage: message,
		})
		this.task.emit(MirrorVSEventName.Message, { action: "updated", message })
		this.debouncedSaveMirrorMessages()
	}

	/**
	 * Add a single FileEditRecord to the local edit history and persist.
	 * This is called from presentAssistantMessage after each successful edit tool.
	 */
	async addFileEdit(record: FileEditRecord) {
		this.fileEdits.push(record)
		await this.saveFileEdits()
	}

	async saveFileEdits(): Promise<boolean> {
		try {
			await saveTaskFileEdits({
				fileEdits: structuredClone(this.fileEdits),
				taskId: this.taskId,
				globalStoragePath: this.globalStoragePath,
			})
			return true
		} catch (error) {
			console.error("Failed to save file edits:", error)
			return false
		}
	}

	async saveMirrorMessages(): Promise<boolean> {
		try {
			await saveTaskMessages({
				messages: structuredClone(this.mirrorMessages),
				taskId: this.taskId,
				globalStoragePath: this.globalStoragePath,
			})

			// Also persist fileEdits alongside mirrorMessages
			await this.saveFileEdits()

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

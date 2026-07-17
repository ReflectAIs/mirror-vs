import * as path from "path"
import fs from "fs/promises"

import { Anthropic } from "@anthropic-ai/sdk"

import { type HistoryItem, type ExtensionMessage } from "@mirror-vs/types"
import { aggregateTaskCostsRecursive, type AggregatedCosts } from "./aggregateTaskCosts"

import { GlobalFileNames } from "../../shared/globalFileNames"

import { fileExistsAtPath } from "../../utils/fs"

import { ShadowCheckpointService } from "../../services/checkpoints/ShadowCheckpointService"

import { TaskHistoryStore } from "../task-persistence"

import type { MirrorProvider } from "./MirrorProvider"

/**
 * Manages task history CRUD operations — read, write, delete, broadcast, and
 * global-state write-through for MirrorProvider.
 *
 * Extracted from MirrorProvider.ts to reduce the monolithic class.
 */
export class TaskHistoryManager {
	/**
	 * Debounce timer for globalState write-through.
	 * Only used for backward compatibility during the transition period.
	 * Per-task files are authoritative; globalState is the downgrade fallback.
	 */
	private globalStateWriteThroughTimer: ReturnType<typeof setTimeout> | null = null
	private static readonly GLOBAL_STATE_WRITE_THROUGH_DEBOUNCE_MS = 5000 // 5 seconds

	constructor(private provider: MirrorProvider) {}

	// ── Store initialization ──────────────────────────────────────────────────

	/**
	 * Initialize the TaskHistoryStore and migrate from globalState if needed.
	 */
	async initializeTaskHistoryStore(): Promise<void> {
		try {
			await this.provider.taskHistoryStore.initialize()

			// Migration: backfill per-task files from globalState on first run
			const migrationKey = "taskHistoryMigratedToFiles"
			const alreadyMigrated = this.provider.context.globalState.get<boolean>(migrationKey)

			if (!alreadyMigrated) {
				const legacyHistory = this.provider.context.globalState.get<HistoryItem[]>("taskHistory") ?? []

				if (legacyHistory.length > 0) {
					this.provider.log(
						`[initializeTaskHistoryStore] Migrating ${legacyHistory.length} entries from globalState`,
					)
					await this.provider.taskHistoryStore.migrateFromGlobalState(legacyHistory)
				}

				await this.provider.context.globalState.update(migrationKey, true)
				this.provider.log("[initializeTaskHistoryStore] Migration complete")
			}

			this.provider.taskHistoryStoreInitialized = true
		} catch (error) {
			this.provider.log(
				`[initializeTaskHistoryStore] Error: ${error instanceof Error ? error.message : String(error)}`,
			)
		}
	}

	// ── Read ──────────────────────────────────────────────────────────────────

	/**
	 * Retrieves a task from the history store by ID, along with its directory
	 * paths and API conversation history.
	 */
	async getTaskWithId(id: string): Promise<{
		historyItem: HistoryItem
		taskDirPath: string
		apiConversationHistoryFilePath: string
		uiMessagesFilePath: string
		apiConversationHistory: Anthropic.MessageParam[]
	}> {
		const historyItem =
			this.provider.taskHistoryStore.get(id) ??
			(this.provider.getGlobalStateValue("taskHistory") as HistoryItem[] | undefined)?.find(
				(item) => item.id === id,
			)

		if (!historyItem) {
			throw new Error("Task not found")
		}

		const { getTaskDirectoryPath } = await import("../../utils/storage")
		const globalStoragePath = this.provider.contextProxy.globalStorageUri.fsPath
		const taskDirPath = await getTaskDirectoryPath(globalStoragePath, id)
		const apiConversationHistoryFilePath = path.join(taskDirPath, GlobalFileNames.apiConversationHistory)
		const uiMessagesFilePath = path.join(taskDirPath, GlobalFileNames.uiMessages)
		const fileExists = await fileExistsAtPath(apiConversationHistoryFilePath)

		let apiConversationHistory: Anthropic.MessageParam[] = []

		if (fileExists) {
			try {
				apiConversationHistory = JSON.parse(await fs.readFile(apiConversationHistoryFilePath, "utf8"))
			} catch (error) {
				console.warn(
					`[getTaskWithId] api_conversation_history.json corrupted for task ${id}, returning empty history: ${error instanceof Error ? error.message : String(error)}`,
				)
			}
		} else {
			console.warn(
				`[getTaskWithId] api_conversation_history.json missing for task ${id}, returning empty history`,
			)
		}

		return {
			historyItem,
			taskDirPath,
			apiConversationHistoryFilePath,
			uiMessagesFilePath,
			apiConversationHistory,
		}
	}

	/**
	 * Retrieves a task with aggregated costs (recursive).
	 */
	async getTaskWithAggregatedCosts(taskId: string): Promise<{
		historyItem: HistoryItem
		aggregatedCosts: AggregatedCosts
	}> {
		const { historyItem } = await this.getTaskWithId(taskId)

		const aggregatedCosts = await aggregateTaskCostsRecursive(taskId, async (id: string) => {
			const result = await this.getTaskWithId(id)
			return result.historyItem
		})

		return { historyItem, aggregatedCosts }
	}

	// ── Write ─────────────────────────────────────────────────────────────────

	/**
	 * Updates a task in the task history and optionally broadcasts the updated
	 * history to the webview.  Delegates to TaskHistoryStore for per-task file
	 * persistence.
	 *
	 * @param item The history item to update or add
	 * @param options.broadcast Whether to broadcast the updated history (default: true)
	 * @returns The updated task history array
	 */
	async updateTaskHistory(item: HistoryItem, options: { broadcast?: boolean } = {}): Promise<HistoryItem[]> {
		const { broadcast = true } = options

		const history = await this.provider.taskHistoryStore.upsert(item)
		this.provider.recentTasksCache = undefined

		// Broadcast the updated history to the webview if requested.
		if (broadcast && this.provider.isViewLaunched) {
			const updatedItem = this.provider.taskHistoryStore.get(item.id) ?? item
			await this.provider.postMessageToWebview({
				type: "taskHistoryItemUpdated",
				taskHistoryItem: updatedItem,
			} as ExtensionMessage)
		}

		return history
	}

	/**
	 * Schedule a debounced write-through of task history to globalState.
	 * Only used for backward compatibility during the transition period.
	 */
	scheduleGlobalStateWriteThrough(): void {
		if (this.globalStateWriteThroughTimer) {
			clearTimeout(this.globalStateWriteThroughTimer)
		}

		this.globalStateWriteThroughTimer = setTimeout(async () => {
			this.globalStateWriteThroughTimer = null
			try {
				const items = this.provider.taskHistoryStore.getAll()
				await this.provider.contextProxy.setValue("taskHistory", items)
			} catch (err) {
				this.provider.log(
					`[scheduleGlobalStateWriteThrough] Failed: ${err instanceof Error ? err.message : String(err)}`,
				)
			}
		}, TaskHistoryManager.GLOBAL_STATE_WRITE_THROUGH_DEBOUNCE_MS)
	}

	/**
	 * Flush any pending debounced globalState write-through immediately.
	 */
	flushGlobalStateWriteThrough(): void {
		if (this.globalStateWriteThroughTimer) {
			clearTimeout(this.globalStateWriteThroughTimer)
			this.globalStateWriteThroughTimer = null
		}

		const items = this.provider.taskHistoryStore.getAll()
		this.provider.contextProxy.setValue("taskHistory", items).catch((err) => {
			this.provider.log(
				`[flushGlobalStateWriteThrough] Failed: ${err instanceof Error ? err.message : String(err)}`,
			)
		})
	}

	// ── Broadcast ─────────────────────────────────────────────────────────────

	/**
	 * Broadcasts a task history update to the webview.
	 */
	async broadcastTaskHistoryUpdate(history?: HistoryItem[]): Promise<void> {
		if (!this.provider.isViewLaunched) {
			return
		}

		const taskHistory = history ?? this.provider.taskHistoryStore.getAll()

		// Sort and filter the history the same way as getStateToPostToWebview
		const sortedHistory = taskHistory
			.filter((item: HistoryItem) => item.ts && item.task)
			.sort((a: HistoryItem, b: HistoryItem) => b.ts - a.ts)

		await this.provider.postMessageToWebview({
			type: "taskHistoryUpdated",
			taskHistory: sortedHistory,
		} as ExtensionMessage)
	}

	// ── Delete ────────────────────────────────────────────────────────────────

	/**
	 * Deletes a task from history, including its checkpoints and task directory.
	 * If the task has subtasks (childIds), they will also be deleted recursively.
	 */
	async deleteTaskWithId(id: string, cascadeSubtasks: boolean = true) {
		try {
			// Get the task directory full path and history item
			const { taskDirPath, historyItem } = await this.getTaskWithId(id)

			// Collect all task IDs to delete (parent + all subtasks)
			const allIdsToDelete: string[] = [id]

			if (cascadeSubtasks) {
				// Recursively collect all child IDs
				const collectChildIds = async (taskId: string): Promise<void> => {
					try {
						const { historyItem: item } = await this.getTaskWithId(taskId)
						if (item.childIds && item.childIds.length > 0) {
							for (const childId of item.childIds) {
								allIdsToDelete.push(childId)
								await collectChildIds(childId)
							}
						}
					} catch (error) {
						// Child task may already be deleted or not found, continue
						console.log(`[deleteTaskWithId] child task ${taskId} not found, skipping`)
					}
				}

				await collectChildIds(id)
			}

			// Remove from stack if any of the tasks to delete are in the current task stack
			for (const taskId of allIdsToDelete) {
				if (taskId === this.provider.getCurrentTask()?.taskId) {
					// Close the current task instance
					await this.provider.removeMirrorFromStack()
					break
				}
			}

			// Delete all tasks from state in one batch
			await this.provider.taskHistoryStore.deleteMany(allIdsToDelete)
			this.provider.recentTasksCache = undefined

			// Delete associated shadow repositories or branches and task directories
			const globalStorageDir = this.provider.contextProxy.globalStorageUri.fsPath
			const workspaceDir = this.provider.cwd
			const { getTaskDirectoryPath } = await import("../../utils/storage")
			const globalStoragePath = this.provider.contextProxy.globalStorageUri.fsPath

			for (const taskId of allIdsToDelete) {
				try {
					await ShadowCheckpointService.deleteTask({ taskId, globalStorageDir, workspaceDir })
				} catch (error) {
					console.error(
						`[deleteTaskWithId${taskId}] failed to delete associated shadow repository or branch: ${error instanceof Error ? error.message : String(error)}`,
					)
				}

				// Delete the task directory
				try {
					const dirPath = await getTaskDirectoryPath(globalStoragePath, taskId)
					await fs.rm(dirPath, { recursive: true, force: true })
					console.log(`[deleteTaskWithId${taskId}] removed task directory`)
				} catch (error) {
					console.error(
						`[deleteTaskWithId${taskId}] failed to remove task directory: ${error instanceof Error ? error.message : String(error)}`,
					)
				}
			}

			await this.provider.postStateToWebview()
		} catch (error) {
			// If task is not found, just remove it from state
			if (error instanceof Error && error.message === "Task not found") {
				await this.deleteTaskFromState(id)
				return
			}
			throw error
		}
	}

	/**
	 * Deletes a task from state only (no file system cleanup).
	 */
	async deleteTaskFromState(id: string) {
		await this.provider.taskHistoryStore.delete(id)
		this.provider.recentTasksCache = undefined

		await this.provider.postStateToWebview()
	}

	// ── Recent tasks ──────────────────────────────────────────────────────────

	/**
	 * Returns an array of recent task IDs for the current workspace.
	 */
	getRecentTasks(): string[] {
		if (this.provider.recentTasksCache) {
			return this.provider.recentTasksCache
		}

		const history = this.provider.taskHistoryStore.getAll()
		const workspaceTasks: HistoryItem[] = []

		for (const item of history) {
			if (!item.ts || !item.task || item.workspace !== this.provider.cwd) {
				continue
			}

			workspaceTasks.push(item)
		}

		if (workspaceTasks.length === 0) {
			this.provider.recentTasksCache = []
			return this.provider.recentTasksCache
		}

		workspaceTasks.sort((a, b) => b.ts - a.ts)
		let recentTaskIds: string[] = []

		if (workspaceTasks.length >= 100) {
			// If we have at least 100 tasks, return tasks from the last 7 days.
			const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000

			for (const item of workspaceTasks) {
				// Stop when we hit tasks older than 7 days.
				if (item.ts < sevenDaysAgo) {
					break
				}

				recentTaskIds.push(item.id)
			}
		} else {
			// Otherwise, return the most recent 100 tasks (or all if less than 100).
			recentTaskIds = workspaceTasks.slice(0, Math.min(100, workspaceTasks.length)).map((item) => item.id)
		}

		this.provider.recentTasksCache = recentTaskIds
		return recentTaskIds
	}
}

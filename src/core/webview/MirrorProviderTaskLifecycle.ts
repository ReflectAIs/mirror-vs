import * as vscode from "vscode"

import pWaitFor from "p-wait-for"

import { type HistoryItem, type CreateTaskOptions, type MirrorVSSettings } from "@mirror-vs/types"
import { ProfileValidator } from "../../shared/ProfileValidator"
import { Package } from "../../shared/package"
import { t } from "../../i18n"
import { OrganizationAllowListViolationError } from "../../utils/errors"

import { Task, TaskState } from "../task/Task"

import type { MirrorProvider } from "./MirrorProvider"

/**
 * Manages task lifecycle operations — creation, cancellation, clearing, and
 * resuming of tasks for MirrorProvider.
 *
 * Extracted from MirrorProvider.ts to reduce the monolithic class.
 */
export class TaskLifecycleManager {
	constructor(private provider: MirrorProvider) {}

	// ── Create ─────────────────────────────────────────────────────────────────

	/**
	 * Creates and starts a new task.  This is the main entry point for task
	 * creation, used by both user-initiated tasks and tool-initiated subtasks.
	 */
	public async createTask(
		text?: string,
		images?: string[],
		parentTask?: Task,
		options: CreateTaskOptions = {},
		configuration: MirrorVSSettings = {},
	): Promise<Task> {
		if (configuration) {
			await this.provider.setValues(configuration)

			if (configuration.allowedCommands) {
				await vscode.workspace
					.getConfiguration(Package.name)
					.update("allowedCommands", configuration.allowedCommands, vscode.ConfigurationTarget.Global)
			}

			if (configuration.deniedCommands) {
				await vscode.workspace
					.getConfiguration(Package.name)
					.update("deniedCommands", configuration.deniedCommands, vscode.ConfigurationTarget.Global)
			}

			if (configuration.commandExecutionTimeout !== undefined) {
				await vscode.workspace
					.getConfiguration(Package.name)
					.update(
						"commandExecutionTimeout",
						configuration.commandExecutionTimeout,
						vscode.ConfigurationTarget.Global,
					)
			}

			if (configuration.currentApiConfigName) {
				await this.provider.setProviderProfile(configuration.currentApiConfigName)
			}

			// Register custom modes so the CustomModesManager knows about them.
			if (configuration.customModes?.length) {
				for (const mode of configuration.customModes) {
					await this.provider.customModesManager.updateCustomMode(mode.slug, mode)
				}
			}
		}

		const { apiConfiguration, organizationAllowList, enableCheckpoints, checkpointTimeout, experiments } =
			await this.provider.getState()

		// For user-initiated top-level tasks, park the current task instead of killing it.
		// The task continues streaming in the background and can be resumed later.
		// Sub-tasks (delegation via new_task tool) still use the stack normally.
		// Optimization: skip parking if the current task is already idle, completed, or aborted.
		if (!parentTask) {
			const currentTask = this.provider.getCurrentTask()

			// Skip parking if no current task exists, or it's already idle/completed/aborted
			if (
				currentTask &&
				currentTask.state !== TaskState.Idle &&
				currentTask.state !== TaskState.Completed &&
				currentTask.state !== TaskState.Aborted
			) {
				try {
					await this.provider["parkCurrentTask"]()
				} catch {
					// Non-fatal
				}
			}
		}

		// Max concurrent streaming tasks gate:
		// If we would exceed the limit, wait (block) until one finishes or is parked.
		if (!parentTask) {
			const maxConcurrent = 3
			const streamingTasks = this.provider.getAllTasksSorted().filter((t) => t.state === TaskState.Streaming)
			if (streamingTasks.length >= maxConcurrent) {
				this.provider.log(
					`[createTask] Reached max ${maxConcurrent} concurrent streaming tasks. ` +
						`Waiting for a slot before creating new task.`,
				)
				// Wait until a streaming slot opens up (poll every 500ms)
				await pWaitFor(
					() =>
						this.provider.getAllTasksSorted().filter((t) => t.state === TaskState.Streaming).length <
						maxConcurrent,
					{ interval: 500, timeout: 120_000 },
				)
			}
		}

		if (!ProfileValidator.isProfileAllowed(apiConfiguration, organizationAllowList)) {
			throw new OrganizationAllowListViolationError(t("common:errors.violated_organization_allowlist"))
		}

		const task = new Task({
			provider: this.provider,
			apiConfiguration,
			enableCheckpoints,
			checkpointTimeout,
			consecutiveMistakeLimit: apiConfiguration.consecutiveMistakeLimit,
			task: text,
			images,
			experiments,
			rootTask: this.provider.mirrorStack.length > 0 ? this.provider.mirrorStack[0] : undefined,
			parentTask,
			taskNumber: this.provider.mirrorStack.length + 1,
			onCreated: this.provider.taskCreationCallback,
			initialTodos: options.initialTodos,
			// Session grouping: top-level tasks inherit the session ID.
			// Child tasks (delegation) inherit via parentTask.sessionId flow.
			sessionId: this.provider.currentSessionId,
			// Ensure this task is present in mirrorStack before startTask() emits
			// its initial state update, so state.currentTaskId is available ASAP.
			startTask: false,
			...options,
		})

		console.log(
			`[SESSION-DBG] createTask: task=${task.taskId}.${task.instanceId} ` +
				`sessionId=${task.sessionId} parentTaskId=${task.parentTaskId} ` +
				`currentSessionId=${this.provider.currentSessionId}`,
		)
		await this.provider.addMirrorToStack(task)
		await task.saveMirrorMessages()

		// Only start the AI loop if there is text/images content or a history item.
		// If created with empty text and images (e.g. clicking '+' or opening fresh workspace),
		// keep it as an idle tab waiting for user input without sending an empty message.
		if ((text && text.trim().length > 0) || (images && images.length > 0) || task.historyItem) {
			task.start()
		}

		this.provider.log(
			`[createTask] ${task.parentTask ? "child" : "parent"} task ${task.taskId}.${task.instanceId} instantiated`,
		)

		return task
	}

	// ── Cancel ─────────────────────────────────────────────────────────────────

	/**
	 * Cancels the current task, preserving history for rehydration.
	 */
	public async cancelTask(): Promise<void> {
		const task = this.provider.getCurrentTask()

		if (!task) {
			return
		}

		console.log(`[cancelTask] cancelling task ${task.taskId}.${task.instanceId}`)

		let historyItem: HistoryItem | undefined
		try {
			const history = await this.provider.getTaskWithId(task.taskId)
			historyItem = history.historyItem
		} catch (error) {
			// During task startup there is a short window where currentTask exists
			// but task history has not been persisted yet.
			if (error instanceof Error && error.message === "Task not found") {
				this.provider.log(`[cancelTask] task history missing for ${task.taskId}; skipping rehydrate`)
			} else {
				throw error
			}
		}

		// Preserve parent and root task information for history item.
		const rootTask = task.rootTask
		const parentTask = task.parentTask

		// Mark this as a user-initiated cancellation so provider-only rehydration can occur
		task.abortReason = "user_cancelled"

		// Capture the current instance to detect if rehydrate already occurred elsewhere
		const originalInstanceId = task.instanceId

		// Immediately cancel the underlying HTTP request if one is in progress
		task.cancelCurrentRequest()

		// Begin abort (non-blocking)
		task.abortTask()

		// Immediately mark the original instance as abandoned to prevent any residual activity
		task.abandoned = true

		await pWaitFor(
			() =>
				this.provider.getCurrentTask()! === undefined ||
				this.provider.getCurrentTask()!.isStreaming === false ||
				this.provider.getCurrentTask()!.didFinishAbortingStream ||
				this.provider.getCurrentTask()!.isWaitingForFirstChunk,
			{
				timeout: 3_000,
			},
		).catch(() => {
			console.error("Failed to abort task")
		})

		// Defensive safeguard: if current instance already changed, skip rehydrate
		const current = this.provider.getCurrentTask()
		if (current && current.instanceId !== originalInstanceId) {
			this.provider.log(
				`[cancelTask] Skipping rehydrate: current instance ${current.instanceId} != original ${originalInstanceId}`,
			)
			return
		}

		// Final race check before rehydrate
		{
			const currentAfterCheck = this.provider.getCurrentTask()
			if (currentAfterCheck && currentAfterCheck.instanceId !== originalInstanceId) {
				this.provider.log(
					`[cancelTask] Skipping rehydrate after final check: current instance ${currentAfterCheck.instanceId} != original ${originalInstanceId}`,
				)
				return
			}
		}

		if (!historyItem) {
			return
		}

		// Clears task again, so we need to abortTask manually above.
		await this.provider.createTaskWithHistoryItem({ ...historyItem, rootTask, parentTask })
	}

	// ── Clear ──────────────────────────────────────────────────────────────────

	/**
	 * Clears the current task without treating it as a subtask.
	 * Used when the user cancels a task that is not a subtask.
	 */
	public async clearTask(): Promise<void> {
		if (this.provider.mirrorStack.length > 0) {
			const task = this.provider.mirrorStack[this.provider.mirrorStack.length - 1]
			console.log(`[clearTask] clearing task ${task.taskId}.${task.instanceId}`)
			await this.provider.removeMirrorFromStack()
		}
	}

	// ── Resume ─────────────────────────────────────────────────────────────────

	/**
	 * Resumes a task by its ID, delegating to showTaskWithId.
	 */
	public resumeTask(taskId: string): void {
		this.provider.showTaskWithId(taskId).catch((error) => {
			this.provider.log(`Failed to resume task ${taskId}: ${error.message}`)
		})
	}

	// ── Condense ───────────────────────────────────────────────────────────────

	/**
	 * Condenses a task's message history to use fewer tokens.
	 */
	public async condenseTaskContext(taskId: string) {
		let task: Task | undefined
		for (let i = this.provider.mirrorStack.length - 1; i >= 0; i--) {
			if (this.provider.mirrorStack[i].taskId === taskId) {
				task = this.provider.mirrorStack[i]
				break
			}
		}
		if (!task) {
			throw new Error(`Task with id ${taskId} not found in stack`)
		}
		await task.condenseContext()
		await this.provider.postMessageToWebview({ type: "condenseTaskContextResponse", text: taskId } as any)
	}
}

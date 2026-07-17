import { type MirrorMessage, type TokenUsage, type QueuedMessage, TaskStatus } from "@mirror-vs/types"

import { MessageManager } from "../message-manager"
import { Task } from "./Task"

/**
 * Manages property getter accessors for a Task — providing clean,
 * delegated access to task state such as status, token usage, and
 * cached managers.
 *
 * Extracted from Task.ts to reduce its size and isolate concerns.
 */
export class TaskGetters {
	constructor(private readonly task: Task) {}

	// ──────────────────────────────────────────────────────────────
	//  Status Getters
	// ──────────────────────────────────────────────────────────────

	/**
	 * Calculates the current task status based on its ask state.
	 *
	 * ## Status Resolution
	 * - `interactiveAsk` is set → `TaskStatus.Interactive`
	 * - `resumableAsk` is set → `TaskStatus.Resumable`
	 * - `idleAsk` is set → `TaskStatus.Idle`
	 * - Otherwise → `TaskStatus.Running`
	 */
	public get taskStatus(): TaskStatus {
		if (this.task.interactiveAsk) {
			return TaskStatus.Interactive
		}

		if (this.task.resumableAsk) {
			return TaskStatus.Resumable
		}

		if (this.task.idleAsk) {
			return TaskStatus.Idle
		}

		return TaskStatus.Running
	}

	/**
	 * Returns the current blocking ask message, if any.
	 * Priority: idleAsk > resumableAsk > interactiveAsk
	 */
	public get taskAsk(): MirrorMessage | undefined {
		return this.task.idleAsk || this.task.resumableAsk || this.task.interactiveAsk
	}

	/**
	 * Returns the list of queued messages waiting to be processed.
	 */
	public get queuedMessages(): QueuedMessage[] {
		return this.task.messageQueueService.messages
	}

	// ──────────────────────────────────────────────────────────────
	//  Token Usage
	// ──────────────────────────────────────────────────────────────

	/**
	 * Returns the cached token usage snapshot if available,
	 * otherwise computes it from mirror messages.
	 *
	 * Uses caching to avoid recalculating token usage on every access.
	 * The snapshot is invalidated when new messages are added.
	 */
	public get tokenUsage(): TokenUsage | undefined {
		if (this.task.tokenUsageSnapshot && this.task.tokenUsageSnapshotAt) {
			return this.task.tokenUsageSnapshot
		}

		this.task.tokenUsageSnapshot = this.task.getTokenUsage()
		this.task.tokenUsageSnapshotAt = this.task.mirrorMessages.at(-1)?.ts

		return this.task.tokenUsageSnapshot
	}

	// ──────────────────────────────────────────────────────────────
	//  Path Getters
	// ──────────────────────────────────────────────────────────────

	/**
	 * Returns the current working directory (workspace path) for this task.
	 */
	public get cwd(): string {
		return this.task.workspacePath
	}

	// ──────────────────────────────────────────────────────────────
	//  Manager Getters
	// ──────────────────────────────────────────────────────────────

	/**
	 * Provides convenient access to high-level message operations.
	 * Uses lazy initialization - the MessageManager is only created when first accessed.
	 * Subsequent accesses return the same cached instance.
	 *
	 * ## Important: Single Coordination Point
	 *
	 * **All MessageManager operations must go through this getter** rather than
	 * instantiating `new MessageManager(task)` directly. This ensures:
	 * - A single shared instance for consistent behavior
	 * - Centralized coordination of all rewind/message operations
	 * - Ability to add internal state or instrumentation in the future
	 *
	 * @example
	 * ```typescript
	 * // Correct: Use the getter
	 * await taskGetters.messageManager.rewindToTimestamp(ts)
	 *
	 * // Incorrect: Do NOT create new instances directly
	 * // const manager = new MessageManager(task) // Don't do this!
	 * ```
	 */
	get messageManager(): MessageManager {
		if (!this.task._messageManager) {
			this.task._messageManager = new MessageManager(this.task)
		}
		return this.task._messageManager
	}
}

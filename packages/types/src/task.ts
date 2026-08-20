import { z } from "zod"

import { MirrorVSEventName } from "./events.js"
import type { MirrorVSSettings } from "./global-settings.js"
import type { MirrorMessage, QueuedMessage, TokenUsage } from "./message.js"
import type { ToolUsage, ToolName } from "./tool.js"
import type { TodoItem } from "./todo.js"

/**
 * TaskProviderLike
 */

export interface TaskProviderLike {
	// Tasks
	getCurrentTask(): TaskLike | undefined
	getRecentTasks(): string[]
	createTask(
		text?: string,
		images?: string[],
		parentTask?: TaskLike,
		options?: CreateTaskOptions,
		configuration?: MirrorVSSettings,
	): Promise<TaskLike>
	cancelTask(): Promise<void>
	clearTask(): Promise<void>
	resumeTask(taskId: string): void

	// Modes
	getModes(): Promise<{ slug: string; name: string }[]>
	getMode(): Promise<string>
	setMode(mode: string): Promise<void>

	// Provider Profiles
	getProviderProfiles(): Promise<{ name: string; provider?: string }[]>
	getProviderProfile(): Promise<string>
	setProviderProfile(providerProfile: string): Promise<void>

	readonly cwd: string

	// Event Emitter
	on<K extends keyof TaskProviderEvents>(
		event: K,
		listener: (...args: TaskProviderEvents[K]) => void | Promise<void>,
	): this

	off<K extends keyof TaskProviderEvents>(
		event: K,
		listener: (...args: TaskProviderEvents[K]) => void | Promise<void>,
	): this

	// @TODO: Find a better way to do this.
	postStateToWebview(): Promise<void>
}

export type TaskProviderEvents = {
	[MirrorVSEventName.TaskCreated]: [task: TaskLike]
	[MirrorVSEventName.TaskStarted]: [taskId: string]
	[MirrorVSEventName.TaskCompleted]: [taskId: string, tokenUsage: TokenUsage, toolUsage: ToolUsage]
	[MirrorVSEventName.TaskAborted]: [taskId: string]
	[MirrorVSEventName.TaskFocused]: [taskId: string]
	[MirrorVSEventName.TaskUnfocused]: [taskId: string]
	[MirrorVSEventName.TaskActive]: [taskId: string]
	[MirrorVSEventName.TaskInteractive]: [taskId: string]
	[MirrorVSEventName.TaskResumable]: [taskId: string]
	[MirrorVSEventName.TaskIdle]: [taskId: string]

	[MirrorVSEventName.TaskPaused]: [taskId: string]
	[MirrorVSEventName.TaskUnpaused]: [taskId: string]
	[MirrorVSEventName.TaskSpawned]: [taskId: string]
	[MirrorVSEventName.TaskDelegated]: [parentTaskId: string, childTaskId: string]
	[MirrorVSEventName.TaskDelegationCompleted]: [parentTaskId: string, childTaskId: string, summary: string]
	[MirrorVSEventName.TaskDelegationResumed]: [parentTaskId: string, childTaskId: string]

	[MirrorVSEventName.TaskUserMessage]: [taskId: string]

	[MirrorVSEventName.TaskTokenUsageUpdated]: [taskId: string, tokenUsage: TokenUsage, toolUsage: ToolUsage]

	[MirrorVSEventName.ModeChanged]: [mode: string]
	[MirrorVSEventName.ProviderProfileChanged]: [config: { name: string; provider?: string }]
}

/**
 * TaskLike
 */

export interface CreateTaskOptions {
	taskId?: string
	enableCheckpoints?: boolean
	consecutiveMistakeLimit?: number
	experiments?: Record<string, boolean>
	initialTodos?: TodoItem[]
	/** Initial status for the task's history item (e.g., "active" for child tasks) */
	initialStatus?: "active" | "delegated" | "completed"
	/** Whether to start the task loop immediately (default: true).
	 *  When false, the caller must invoke `task.start()` manually. */
	startTask?: boolean
	/** Session grouping key. Tasks with the same sessionId are grouped together
	 *  in history view and share a common session lifecycle. */
	sessionId?: string
	/** Custom workspace directory path for multi-root or cross-workspace branching */
	workspacePath?: string
}

export enum TaskStatus {
	Running = "running",
	Interactive = "interactive",
	Resumable = "resumable",
	Idle = "idle",
	None = "none",
}

export const taskMetadataSchema = z.object({
	task: z.string().optional(),
	images: z.array(z.string()).optional(),
})

export type TaskMetadata = z.infer<typeof taskMetadataSchema>

export interface TaskLike {
	readonly taskId: string
	readonly rootTaskId?: string
	readonly parentTaskId?: string
	readonly childTaskId?: string
	readonly metadata: TaskMetadata
	readonly taskStatus: TaskStatus
	readonly taskAsk: MirrorMessage | undefined
	readonly queuedMessages: QueuedMessage[]
	readonly tokenUsage: TokenUsage | undefined

	on<K extends keyof TaskEvents>(event: K, listener: (...args: TaskEvents[K]) => void | Promise<void>): this
	off<K extends keyof TaskEvents>(event: K, listener: (...args: TaskEvents[K]) => void | Promise<void>): this

	approveAsk(options?: { text?: string; images?: string[] }): void
	denyAsk(options?: { text?: string; images?: string[] }): void
	submitUserMessage(text: string, images?: string[], mode?: string, providerProfile?: string): Promise<void>
	abortTask(): void
}

export type TaskEvents = {
	// Task Lifecycle
	[MirrorVSEventName.TaskStarted]: []
	[MirrorVSEventName.TaskCompleted]: [taskId: string, tokenUsage: TokenUsage, toolUsage: ToolUsage]
	[MirrorVSEventName.TaskAborted]: []
	[MirrorVSEventName.TaskFocused]: []
	[MirrorVSEventName.TaskUnfocused]: []
	[MirrorVSEventName.TaskActive]: [taskId: string]
	[MirrorVSEventName.TaskInteractive]: [taskId: string]
	[MirrorVSEventName.TaskResumable]: [taskId: string]
	[MirrorVSEventName.TaskIdle]: [taskId: string]

	// Subtask Lifecycle
	[MirrorVSEventName.TaskPaused]: [taskId: string]
	[MirrorVSEventName.TaskUnpaused]: [taskId: string]
	[MirrorVSEventName.TaskSpawned]: [taskId: string]

	// Task Execution
	[MirrorVSEventName.Message]: [{ action: "created" | "updated"; message: MirrorMessage }]
	[MirrorVSEventName.TaskModeSwitched]: [taskId: string, mode: string]
	[MirrorVSEventName.TaskAskResponded]: []
	[MirrorVSEventName.TaskUserMessage]: [taskId: string]
	[MirrorVSEventName.QueuedMessagesUpdated]: [taskId: string, messages: QueuedMessage[]]

	// Task Analytics
	[MirrorVSEventName.TaskToolFailed]: [taskId: string, tool: ToolName, error: string]
	[MirrorVSEventName.TaskTokenUsageUpdated]: [taskId: string, tokenUsage: TokenUsage, toolUsage: ToolUsage]
}

import os from "os"
import * as path from "path"
import EventEmitter from "events"

import { Anthropic } from "@anthropic-ai/sdk"
import * as vscode from "vscode"

import {
	type TaskProviderLike,
	type TaskProviderEvents,
	type GlobalState,
	type ProviderSettings,
	type MirrorVSSettings,
	type ProviderSettingsEntry,
	type CodeActionId,
	type CodeActionName,
	type TerminalActionId,
	type TerminalActionPromptType,
	type HistoryItem,
	type CreateTaskOptions,
	type TokenUsage,
	type ToolUsage,
	type ExtensionMessage,
	type ExtensionState,
	MirrorVSEventName,
	DEFAULT_MODES,
} from "@mirror-vs/types"
import { type AggregatedCosts } from "./aggregateTaskCosts"

import { Package } from "../../shared/package"
import { Mode, defaultModeSlug, getModeBySlug } from "../../shared/modes"
import { EMBEDDING_MODEL_PROFILES } from "../../shared/embeddingModels"

import { Terminal } from "../../integrations/terminal/Terminal"
import { downloadTask, getTaskFileName } from "../../integrations/misc/export-markdown"
import { resolveDefaultSaveUri, saveLastExportPath } from "../../utils/export"
import { getTheme } from "../../integrations/theme/getTheme"
import WorkspaceTracker from "../../integrations/workspace/WorkspaceTracker"

import { McpHub } from "../../services/mcp/McpHub"
import { McpServerManager } from "../../services/mcp/McpServerManager"
import { CodeIndexManager } from "../../services/code-index/manager"
import type { IndexProgressUpdate } from "../../services/code-index/interfaces/manager"
import { SkillsManager } from "../../services/skills/SkillsManager"

import { setTtsEnabled, setTtsSpeed } from "../../utils/tts"
import { getWorkspacePath } from "../../utils/path"

import { setPanel } from "../../activate/registerCommands"

import { t } from "../../i18n"

import { forceFullModelDetailsLoad, hasLoadedFullDetails } from "../../api/providers/fetchers/lmstudio"

import { ContextProxy } from "../config/ContextProxy"
import { ProviderSettingsManager } from "../config/ProviderSettingsManager"
import { CustomModesManager } from "../config/CustomModesManager"
import { SessionContextManager } from "../session/SessionContextManager"
import { Task } from "../task/Task"

import { webviewMessageHandler } from "./webviewMessageHandler"
import type { TodoItem } from "@mirror-vs/types"
import {
	TaskHistoryStore,
	readApiMessages,
	saveApiMessages,
	readTaskMessages,
	saveTaskMessages,
} from "../task-persistence"
import { StateManager } from "./MirrorProviderState"
import { SessionManager } from "./MirrorProviderSessions"
import { WebviewManager } from "./MirrorProviderWebview"
import { TaskHistoryManager } from "./MirrorProviderTaskHistory"
import { TaskLifecycleManager } from "./MirrorProviderTaskLifecycle"
import { ProfileManager } from "./MirrorProviderProfileManager"
import { DelegationManager } from "./MirrorProviderDelegation"
import { Helpers } from "./MirrorProviderHelpers"

/**
 * https://github.com/microsoft/vscode-webview-ui-toolkit-samples/blob/main/default/weather-webview/src/providers/WeatherViewProvider.ts
 * https://github.com/KumarVariable/vscode-extension-sidebar-html/blob/master/src/customSidebarViewProvider.ts
 */

export type MirrorProviderEvents = {
	mirrorCreated: [mirror: Task]
}

interface PendingEditOperation {
	messageTs: number
	editedContent: string
	images?: string[]
	messageIndex: number
	apiConversationHistoryIndex: number
	timeoutId: NodeJS.Timeout
	createdAt: number
}

export class MirrorProvider
	extends EventEmitter<TaskProviderEvents>
	implements vscode.WebviewViewProvider, TaskProviderLike
{
	// Used in package.json as the view's id. This value cannot be changed due
	// to how VSCode caches views based on their id, and updating the id would
	// break existing instances of the extension.
	public static readonly sideBarId = `${Package.name}.SidebarProvider`
	public static readonly tabPanelId = `${Package.name}.TabPanelProvider`
	private static activeInstances: Set<MirrorProvider> = new Set()
	private disposables: vscode.Disposable[] = []
	private webviewDisposables: vscode.Disposable[] = []
	private view?: vscode.WebviewView | vscode.WebviewPanel
	/** @internal Extracted classes (TaskLifecycleManager, etc.) read this directly. */
	public mirrorStack: Task[] = []

	/**
	 * Background tasks that are still running (streaming) but not currently focused.
	 * Maps taskId → Task. These tasks continue their API streaming and save messages
	 * to disk even while the user interacts with a different task.
	 *
	 * ## Lifecycle
	 * - Tasks are parked here when the user switches to a different chat
	 * - Tasks remain here until they complete naturally, the user explicitly cancels them,
	 *   or the extension is disposed
	 * - When the user switches back to a background task, it is removed from this map
	 *   and pushed back onto mirrorStack
	 * - Completed/aborted background tasks eventually get cleaned up via their event handlers
	 */
	private backgroundTasks: Map<string, Task> = new Map()

	private codeIndexStatusSubscription?: vscode.Disposable
	private codeIndexManager?: CodeIndexManager
	private _workspaceTracker?: WorkspaceTracker // workSpaceTracker read-only for access outside this class
	protected mcpHub?: McpHub // Change from private to protected
	protected skillsManager?: SkillsManager
	/** @internal Extracted classes (TaskLifecycleManager, etc.) read this directly. */
	public taskCreationCallback: (task: Task) => void
	private taskEventListeners: WeakMap<Task, Array<() => void>> = new WeakMap()
	private currentWorkspacePath: string | undefined
	private _disposed = false

	public recentTasksCache?: string[]
	public readonly taskHistoryStore: TaskHistoryStore
	public taskHistoryStoreInitialized = false
	private pendingOperations: Map<string, PendingEditOperation> = new Map()
	private static readonly PENDING_OPERATION_TIMEOUT_MS = 30000 // 30 seconds

	/**
	 * Monotonically increasing sequence number for mirrorMessages state pushes.
	 * Used by the frontend to reject stale state that arrives out-of-order.
	 */
	private mirrorMessagesSeq = 0

	/**
	 * The ID of the current session, persisted across VS Code restarts.
	 * All tasks created during this session share this ID for history grouping.
	 */
	/** @internal Extracted classes (TaskLifecycleManager, etc.) read this directly. */
	public currentSessionId?: string

	public isViewLaunched = false
	public settingsImportedAt?: number
	public readonly latestAnnouncementId = "jul-2026-beta-welcome" // Mirror VS beta welcome announcement.
	public readonly providerSettingsManager: ProviderSettingsManager
	public readonly customModesManager: CustomModesManager
	/**
	 * Delegated state manager — handles all state assembly, merging, and posting.
	 * Extracted from this class to reduce the monolithic footprint.
	 */
	public readonly stateManager: StateManager

	/**
	 * Delegated session manager — handles all session CRUD operations.
	 * Extracted from this class to reduce the monolithic footprint.
	 */
	public readonly sessionManager: SessionManager

	/**
	 * Delegated webview manager — handles HTML generation, message posting,
	 * message listener, and resource cleanup for the webview.
	 * Extracted from this class to reduce the monolithic footprint.
	 */
	public readonly webviewManager: WebviewManager

	/**
	 * Delegated task history manager — handles all task history CRUD,
	 * global-state write-through, and broadcast operations.
	 * Extracted from this class to reduce the monolithic footprint.
	 */
	public readonly taskHistoryManager: TaskHistoryManager
	public readonly taskLifecycleManager: TaskLifecycleManager

	/**
	 * Delegated profile manager — handles provider profile CRUD, activation,
	 * delete, and callbacks for OpenRouter/Requesty auth flows.
	 * Extracted from this class to reduce the monolithic footprint.
	 */
	public readonly profileManager: ProfileManager

	/**
	 * Delegated delegation manager — handles parent/child task delegation flows,
	 * including flushing parent tool results, enforcing single-open invariant,
	 * persisting delegation metadata, and reopening parent tasks with synthetic
	 * tool_result injection.
	 * Extracted from this class to reduce the monolithic footprint.
	 */
	public readonly delegationManager: DelegationManager

	/**
	 * Delegated helpers — provides static utility methods (instance resolution,
	 * code/terminal action handlers, state reset, directory utilities).
	 * Extracted from this class to reduce the monolithic footprint.
	 */
	public readonly helpers: Helpers

	/**
	 * Delegated session context manager — owns the shared selective context
	 * between tabs in the same session (sibling awareness, auto knowledge,
	 * curated notes). Lazily initialized on first access.
	 */
	public sessionContextManager?: SessionContextManager

	constructor(
		readonly context: vscode.ExtensionContext,
		private readonly outputChannel: vscode.OutputChannel,
		private readonly renderContext: "sidebar" | "editor" = "sidebar",
		public readonly contextProxy: ContextProxy,
	) {
		super()
		this.currentWorkspacePath = getWorkspacePath()
		this.stateManager = new StateManager(this)
		this.sessionManager = new SessionManager(this)
		this.webviewManager = new WebviewManager(this)
		this.taskHistoryManager = new TaskHistoryManager(this)
		this.taskLifecycleManager = new TaskLifecycleManager(this)
		this.profileManager = new ProfileManager(this)
		this.delegationManager = new DelegationManager(this)
		this.helpers = new Helpers(this)

		MirrorProvider.activeInstances.add(this)

		this.updateGlobalState("codebaseIndexModels", EMBEDDING_MODEL_PROFILES)

		// Initialize the per-task file-based history store.
		// The globalState write-through is debounced separately (not on every mutation)
		// since per-task files are authoritative and globalState is only for downgrade compat.
		this.taskHistoryStore = new TaskHistoryStore(this.contextProxy.globalStorageUri.fsPath, {
			onWrite: async () => {
				this.taskHistoryManager.scheduleGlobalStateWriteThrough()
			},
		})
		this.taskHistoryManager.initializeTaskHistoryStore().catch((error) => {
			this.log(`Failed to initialize TaskHistoryStore: ${error}`)
		})

		this._workspaceTracker = new WorkspaceTracker(this)

		this.providerSettingsManager = new ProviderSettingsManager(this.context)

		this.customModesManager = new CustomModesManager(this.context, async () => {
			await this.postStateToWebviewWithoutMirrorMessages()
		})

		// Initialize MCP Hub through the singleton manager
		McpServerManager.getInstance(this.context, this)
			.then((hub) => {
				this.mcpHub = hub
				this.mcpHub.registerClient()
			})
			.catch((error) => {
				this.log(`Failed to initialize MCP Hub: ${error}`)
			})

		// Initialize Skills Manager for skill discovery
		this.skillsManager = new SkillsManager(this)
		this.skillsManager.initialize().catch((error) => {
			this.log(`Failed to initialize Skills Manager: ${error}`)
		})

		// Forward <most> task events to the provider.
		// We do something fairly similar for the IPC-based API.
		this.taskCreationCallback = (instance: Task) => {
			this.emit(MirrorVSEventName.TaskCreated, instance)

			// Create named listener functions so we can remove them later.
			const onTaskStarted = () => {
				this.emit(MirrorVSEventName.TaskStarted, instance.taskId)
				this.postStateToWebviewWithoutMirrorMessages()
			}
			const onTaskCompleted = async (taskId: string, tokenUsage: TokenUsage, toolUsage: ToolUsage) => {
				console.log(
					`[SESSION-DBG] onTaskCompleted: task=${taskId} instance=${instance.instanceId} ` +
						`currentSessionId=${this.currentSessionId}`,
				)
				this.emit(MirrorVSEventName.TaskCompleted, taskId, tokenUsage, toolUsage)

				// Extract distilled knowledge from the completed task into the
				// session's shared context (no-op for tasks without a sessionId).
				try {
					await this.getSessionContextManager().extractKnowledgeFromTask(instance)
				} catch (error) {
					this.log(
						`[onTaskCompleted] Failed to extract session knowledge: ${error instanceof Error ? error.message : String(error)}`,
					)
				}

				this.postStateToWebviewWithoutMirrorMessages()

				// If this is a background task, clean it up automatically to prevent memory leaks.
				if (this.backgroundTasks.has(taskId)) {
					this.log(
						`[onTaskCompleted] Background task ${taskId}.${instance.instanceId} completed — cleaning up`,
					)
					const cleanupFunctions = this.taskEventListeners.get(instance)
					if (cleanupFunctions) {
						cleanupFunctions.forEach((cleanup) => cleanup())
						this.taskEventListeners.delete(instance)
					}
					this.backgroundTasks.delete(taskId)
				}
			}
			const onTaskAborted = async () => {
				this.emit(MirrorVSEventName.TaskAborted, instance.taskId)
				this.postStateToWebviewWithoutMirrorMessages()

				try {
					if (this.backgroundTasks.has(instance.taskId)) {
						this.log(
							`[onTaskAborted] Background task ${instance.taskId}.${instance.instanceId} aborted — cleaning up`,
						)
						const cleanupFunctions = this.taskEventListeners.get(instance)
						if (cleanupFunctions) {
							cleanupFunctions.forEach((cleanup) => cleanup())
							this.taskEventListeners.delete(instance)
						}
						this.backgroundTasks.delete(instance.taskId)
						return
					}

					if (instance.abortReason === "streaming_failed") {
						const current = this.getCurrentTask()
						if (current && current.instanceId !== instance.instanceId) {
							this.log(
								`[onTaskAborted] Skipping rehydrate: current instance ${current.instanceId} != aborted ${instance.instanceId}`,
							)
							return
						}

						const { historyItem } = await this.getTaskWithId(instance.taskId)
						const rootTask = instance.rootTask
						const parentTask = instance.parentTask
						await this.createTaskWithHistoryItem({ ...historyItem, rootTask, parentTask })
					}
				} catch (error) {
					this.log(
						`[onTaskAborted] Failed to rehydrate after streaming failure: ${
							error instanceof Error ? error.message : String(error)
						}`,
					)
				}
			}
			const onTaskFocused = () => this.emit(MirrorVSEventName.TaskFocused, instance.taskId)
			const onTaskUnfocused = () => this.emit(MirrorVSEventName.TaskUnfocused, instance.taskId)
			const onTaskActive = (taskId: string) => this.emit(MirrorVSEventName.TaskActive, taskId)
			const onTaskInteractive = (taskId: string) => {
				this.emit(MirrorVSEventName.TaskInteractive, taskId)
				this.postStateToWebviewWithoutMirrorMessages()
			}
			const onTaskResumable = (taskId: string) => this.emit(MirrorVSEventName.TaskResumable, taskId)
			const onTaskIdle = (taskId: string) => {
				this.emit(MirrorVSEventName.TaskIdle, taskId)
				this.postStateToWebviewWithoutMirrorMessages()
			}
			const onTaskPaused = (taskId: string) => this.emit(MirrorVSEventName.TaskPaused, taskId)
			const onTaskUnpaused = (taskId: string) => this.emit(MirrorVSEventName.TaskUnpaused, taskId)
			const onTaskSpawned = (taskId: string) => this.emit(MirrorVSEventName.TaskSpawned, taskId)
			const onTaskUserMessage = (taskId: string) => this.emit(MirrorVSEventName.TaskUserMessage, taskId)
			const onTaskTokenUsageUpdated = (taskId: string, tokenUsage: TokenUsage, toolUsage: ToolUsage) =>
				this.emit(MirrorVSEventName.TaskTokenUsageUpdated, taskId, tokenUsage, toolUsage)

			// Attach the listeners.
			instance.on(MirrorVSEventName.TaskStarted, onTaskStarted)
			instance.on(MirrorVSEventName.TaskCompleted, onTaskCompleted)
			instance.on(MirrorVSEventName.TaskAborted, onTaskAborted)
			instance.on(MirrorVSEventName.TaskFocused, onTaskFocused)
			instance.on(MirrorVSEventName.TaskUnfocused, onTaskUnfocused)
			instance.on(MirrorVSEventName.TaskActive, onTaskActive)
			instance.on(MirrorVSEventName.TaskInteractive, onTaskInteractive)
			instance.on(MirrorVSEventName.TaskResumable, onTaskResumable)
			instance.on(MirrorVSEventName.TaskIdle, onTaskIdle)
			instance.on(MirrorVSEventName.TaskPaused, onTaskPaused)
			instance.on(MirrorVSEventName.TaskUnpaused, onTaskUnpaused)
			instance.on(MirrorVSEventName.TaskSpawned, onTaskSpawned)
			instance.on(MirrorVSEventName.TaskUserMessage, onTaskUserMessage)
			instance.on(MirrorVSEventName.TaskTokenUsageUpdated, onTaskTokenUsageUpdated)

			// Store the cleanup functions for later removal.
			this.taskEventListeners.set(instance, [
				() => instance.off(MirrorVSEventName.TaskStarted, onTaskStarted),
				() => instance.off(MirrorVSEventName.TaskCompleted, onTaskCompleted),
				() => instance.off(MirrorVSEventName.TaskAborted, onTaskAborted),
				() => instance.off(MirrorVSEventName.TaskFocused, onTaskFocused),
				() => instance.off(MirrorVSEventName.TaskUnfocused, onTaskUnfocused),
				() => instance.off(MirrorVSEventName.TaskActive, onTaskActive),
				() => instance.off(MirrorVSEventName.TaskInteractive, onTaskInteractive),
				() => instance.off(MirrorVSEventName.TaskResumable, onTaskResumable),
				() => instance.off(MirrorVSEventName.TaskIdle, onTaskIdle),
				() => instance.off(MirrorVSEventName.TaskUserMessage, onTaskUserMessage),
				() => instance.off(MirrorVSEventName.TaskPaused, onTaskPaused),
				() => instance.off(MirrorVSEventName.TaskUnpaused, onTaskUnpaused),
				() => instance.off(MirrorVSEventName.TaskSpawned, onTaskSpawned),
				() => instance.off(MirrorVSEventName.TaskTokenUsageUpdated, onTaskTokenUsageUpdated),
			])
		}

		try {
			const { ReviewManager } = require("../../services/review-manager")
			ReviewManager.getInstance().onDidChangeActiveReviews(() => {
				this.postStateToWebview().catch((err) => console.error("Failed to post state on review change:", err))
			})
		} catch (error) {
			console.error("Failed to subscribe to ReviewManager events:", error)
		}
	}

	// ── Session management (delegated to SessionManager) ─────────────────────

	/**
	 * Returns the current session ID, if one exists.
	 */
	public getCurrentSessionId(): string | undefined {
		return this.currentSessionId
	}

	/**
	 * Sets the current session ID in memory (without persisting).
	 * Used by SessionManager to keep the in-memory value in sync.
	 */
	public setCurrentSessionId(sessionId: string | undefined): void {
		this.currentSessionId = sessionId
	}

	public async createSession(): Promise<string> {
		return this.sessionManager.createSession()
	}

	public async getOrCreateSession(): Promise<string> {
		return this.sessionManager.getOrCreateSession()
	}

	public async clearSession(): Promise<void> {
		await this.sessionManager.clearSession()
	}

	public async getSessionNames(): Promise<Record<string, string>> {
		return this.sessionManager.getSessionNames()
	}

	public async setSessionName(sessionId: string, name: string): Promise<void> {
		await this.sessionManager.setSessionName(sessionId, name)
	}

	public async renameSession(sessionId: string, name: string): Promise<void> {
		await this.sessionManager.renameSession(sessionId, name)
	}

	public async renameTask(taskId: string, name: string): Promise<void> {
		await this.sessionManager.renameTask(taskId, name)
	}

	public async startNewTaskInSession(text: string, images?: string[]): Promise<Task> {
		return this.sessionManager.startNewTaskInSession(text, images)
	}

	/**
	 * Initialize the TaskHistoryStore and migrate from globalState if needed.
	 */
	private async initializeTaskHistoryStore(): Promise<void> {
		await this.taskHistoryManager.initializeTaskHistoryStore()
	}

	/**
	 * Override EventEmitter's on method to match TaskProviderLike interface
	 */
	override on<K extends keyof TaskProviderEvents>(
		event: K,
		listener: (...args: TaskProviderEvents[K]) => void | Promise<void>,
	): this {
		return super.on(event, listener as any)
	}

	/**
	 * Override EventEmitter's off method to match TaskProviderLike interface
	 */
	override off<K extends keyof TaskProviderEvents>(
		event: K,
		listener: (...args: TaskProviderEvents[K]) => void | Promise<void>,
	): this {
		return super.off(event, listener as any)
	}

	// Adds a new Task instance to mirrorStack, marking the start of a new task.
	// The instance is pushed to the top of the stack (LIFO order).
	// When the task is completed, the top instance is removed, reactivating the
	// previous task.
	async addMirrorToStack(task: Task) {
		// Add this mirror instance into the stack that represents the order of
		// all the called tasks.
		this.mirrorStack.push(task)
		task.emit(MirrorVSEventName.TaskFocused)

		// Perform special setup provider specific tasks.
		await this.performPreparationTasks(task)

		// Ensure getState() resolves correctly.
		const state = await this.getState()

		if (!state || typeof state.mode !== "string") {
			throw new Error(t("common:errors.retrieve_current_mode"))
		}
	}

	/**
	 * Parks the current task by moving it to the background collection without
	 * aborting its streaming. The task continues its API request and saves messages
	 * to disk while the user interacts with a different task.
	 *
	 * When the user later switches back, the task is restored from the background
	 * map — its in-memory state (mirrorMessages, streaming state) is fully intact.
	 */
	private async parkCurrentTask(): Promise<void> {
		const currentTask = this.getCurrentTask()
		if (!currentTask) {
			return
		}

		// Pop from the stack
		const task = this.mirrorStack.pop()
		if (!task || task !== currentTask) {
			// Safety check: the stack top should match getCurrentTask()
			if (task && task !== currentTask) {
				// Something went wrong — push it back
				this.mirrorStack.push(task)
			}
			return
		}

		// Emit unfocused — the task is no longer the active chat
		task.emit(MirrorVSEventName.TaskUnfocused)

		// Move to background collection (keeps event listeners alive, streaming continues)
		this.backgroundTasks.set(task.taskId, task)

		this.log(`[parkCurrentTask] Task ${task.taskId}.${task.instanceId} parked to background (streaming continues)`)
	}

	/**
	 * Focuses a background task, making it the current task and parking the
	 * previously focused task.
	 */
	private async focusBackgroundTask(taskId: string): Promise<void> {
		const backgroundTask = this.backgroundTasks.get(taskId)
		if (!backgroundTask) {
			this.log(`[focusBackgroundTask] Task ${taskId} not found in background tasks`)
			return
		}

		// Park the current task first (move it to background)
		await this.parkCurrentTask()

		// Remove from background collection
		this.backgroundTasks.delete(taskId)

		// Push to the top of the stack (now it's the "current" task)
		this.mirrorStack.push(backgroundTask)
		backgroundTask.emit(MirrorVSEventName.TaskFocused)

		// Post updated state to webview so it renders this task's messages
		await this.postStateToWebview()

		this.log(
			`[focusBackgroundTask] Task ${backgroundTask.taskId}.${backgroundTask.instanceId} focused from background`,
		)
	}

	/**
	 * Returns all live tasks (mirrorStack + backgroundTasks) sorted by createdAt ASC.
	 * Used by StateManager to build the tabs array for the webview.
	 */
	getAllTasksSorted(): Task[] {
		const allTasks = new Map<string, Task>()

		// Collect from mirrorStack (reverse order — top is current task)
		for (const task of this.mirrorStack) {
			allTasks.set(task.taskId, task)
		}

		// Collect from backgroundTasks (may overlap with mirrorStack in edge cases)
		for (const [taskId, task] of this.backgroundTasks) {
			allTasks.set(taskId, task)
		}

		// Sort by createdAt ASC for stable tab ordering
		return Array.from(allTasks.values()).sort((a, b) => a.createdAt - b.createdAt)
	}

	/**
	 * Returns the number of background tasks currently running.
	 */
	getBackgroundTaskCount(): number {
		return this.backgroundTasks.size
	}

	/**
	 * Returns the live task with the given taskId from either mirrorStack or backgroundTasks.
	 * If no taskId is provided or found, falls back to the current task.
	 */
	getLiveTask(taskId?: string): Task | undefined {
		if (!taskId) {
			return this.getCurrentTask()
		}
		if (this.backgroundTasks.has(taskId)) {
			return this.backgroundTasks.get(taskId)
		}
		const inStack = this.mirrorStack.find((t) => t.taskId === taskId)
		if (inStack) {
			return inStack
		}
		return this.getCurrentTask()
	}

	/**
	 * Returns true if the given taskId is currently running in the background.
	 */
	isBackgroundTask(taskId: string): boolean {
		return this.backgroundTasks.has(taskId)
	}

	/**
	 * Public entry point for switching the active tab/task.
	 *
	 * Handles two cases:
	 * 1. Target task is in backgroundTasks (parked mid-streaming) → use focusBackgroundTask()
	 * 2. Target task is in mirrorStack (idle/completed/aborted — never parked) → restack it directly
	 */
	public async switchToTask(taskId: string): Promise<void> {
		const currentTask = this.getCurrentTask()

		// If already focused, nothing to do
		if (currentTask?.taskId === taskId) {
			return
		}

		// Case 1: Target is in background (parked mid-streaming)
		if (this.backgroundTasks.has(taskId)) {
			await this.focusBackgroundTask(taskId)
			return
		}

		// Case 2: Target is in mirrorStack but not in backgroundTasks
		// (idle/completed/aborted tasks are never parked — they stay in mirrorStack only)
		const targetIndex = this.mirrorStack.findIndex((t) => t.taskId === taskId)
		if (targetIndex === -1) {
			this.log(`[switchToTask] Task ${taskId} not found in background tasks or mirror stack`)
			return
		}

		// Park the current task first (pop from mirrorStack, move to background)
		await this.parkCurrentTask()

		// Remove the target from its current position in mirrorStack
		// (targetIndex may have shifted if currentTask was above it)
		const reIndex = this.mirrorStack.findIndex((t) => t.taskId === taskId)
		if (reIndex === -1) {
			this.log(`[switchToTask] Task ${taskId} vanished after parking current task`)
			return
		}
		const target = this.mirrorStack.splice(reIndex, 1)[0]

		// Push target to the top of the stack (now it's the "current" task)
		this.mirrorStack.push(target)
		target.emit(MirrorVSEventName.TaskFocused)

		// Start/resume the newly focused task if it has not been started yet
		target.startRestoredTask().catch((error) => {
			this.log(`[switchToTask] Failed to start restored switched task: ${error}`)
		})

		// Post updated state to webview
		await this.postStateToWebview()

		this.log(`[switchToTask] Task ${target.taskId}.${target.instanceId} focused from mirror stack`)
	}

	/**
	 * Closes a task tab — aborts the task if it's still running and removes it
	 * from both mirrorStack and backgroundTasks. If the closed task is the current
	 * (active) task, its previous tab (in tab bar order) is focused instead. If no
	 * tasks remain, the webview shows the welcome/empty state.
	 *
	 * NOTE: The frontend is expected to have already confirmed with the user before
	 * sending closeTaskTab. This method does NOT prompt for confirmation.
	 *
	 * Also records the closed task ID in sessionClosedTabs (per-session) so that
	 * restoreSessionTabs() will skip it on the next load.
	 */
	public async closeTask(taskId: string): Promise<void> {
		const currentTask = this.getCurrentTask()
		const isCurrent = currentTask?.taskId === taskId
		const isBackground = this.backgroundTasks.has(taskId)
		const inMirrorStack = this.mirrorStack.some((t) => t.taskId === taskId)

		if (!isCurrent && !isBackground && !inMirrorStack) {
			this.log(`[closeTask] Task ${taskId} not found — nothing to close`)
			return
		}

		// Capture the ordered tabs BEFORE removal so we can determine which tab
		// should become active after closing (browser-like: previous tab wins).
		const orderedBeforeClose = this.getAllTasksSorted()
		const closedIndex = orderedBeforeClose.findIndex((t) => t.taskId === taskId)
		// Prefer the previous tab (index - 1); fall back to the next tab (index + 1).
		const previousTab = closedIndex > 0 ? orderedBeforeClose[closedIndex - 1] : orderedBeforeClose[closedIndex + 1]

		// Find the task to close
		let taskToClose: Task | undefined
		if (isCurrent) {
			taskToClose = currentTask
		} else if (isBackground) {
			taskToClose = this.backgroundTasks.get(taskId)
		} else if (inMirrorStack) {
			// Non-current, non-background task in mirrorStack (e.g. restored non-focused tab)
			const index = this.mirrorStack.findIndex((t) => t.taskId === taskId)
			if (index !== -1) {
				taskToClose = this.mirrorStack[index]
				this.mirrorStack.splice(index, 1)
			}
		}

		if (!taskToClose) {
			return
		}

		// Remove from background tasks map if present
		if (isBackground) {
			this.backgroundTasks.delete(taskId)
		}

		// If it's the current task, remove from stack with abort
		if (isCurrent && this.mirrorStack.length > 0) {
			await this.removeMirrorFromStack()
		}

		// Clean up event listeners
		const cleanupFunctions = this.taskEventListeners.get(taskToClose)
		if (cleanupFunctions) {
			cleanupFunctions.forEach((cleanup) => cleanup())
			this.taskEventListeners.delete(taskToClose)
		}

		// Persist closed tab so it won't be restored on next load
		await this.persistClosedTab(taskId)

		this.log(`[closeTask] Task ${taskId} closed and removed`)

		if (isCurrent && previousTab) {
			// Browser-like behavior: focus the previous tab (in tab bar order).
			// switchToTask() posts updated state itself when it performs the
			// focus; the postStateToWebview() below additionally covers the
			// cases where it early-returns without posting (e.g. the previous
			// tab is already current after the pop).
			await this.switchToTask(previousTab.taskId)
		}

		// Post updated state (browser-like 0-tab support)
		await this.postStateToWebview()
	}

	/**
	 * Records a task ID as "closed" in the session's closed-tab list.
	 * Persisted in global settings under `sessionClosedTabs` so that
	 * restoreSessionTabs() can filter these out on the next startup.
	 */
	private async persistClosedTab(taskId: string): Promise<void> {
		const sessionId = this.getCurrentSessionId()
		if (!sessionId) {
			return
		}

		const closedTabs: Record<string, string[]> = (await this.contextProxy.getValue("sessionClosedTabs")) || {}
		const closedForSession = closedTabs[sessionId] || []
		if (!closedForSession.includes(taskId)) {
			closedForSession.push(taskId)
			closedTabs[sessionId] = closedForSession
			await this.contextProxy.setValue("sessionClosedTabs", closedTabs)
		}
	}

	async performPreparationTasks(mirror: Task) {
		// LMStudio: We need to force model loading in order to read its context
		// size; we do it now since we're starting a task with that model selected.
		if (mirror.apiConfiguration && mirror.apiConfiguration.apiProvider === "lmstudio") {
			try {
				if (!hasLoadedFullDetails(mirror.apiConfiguration.lmStudioModelId!)) {
					await forceFullModelDetailsLoad(
						mirror.apiConfiguration.lmStudioBaseUrl ?? "http://localhost:1234",
						mirror.apiConfiguration.lmStudioModelId!,
					)
				}
			} catch (error) {
				this.log(`Failed to load full model details for LM Studio: ${error}`)
				vscode.window.showErrorMessage(error.message)
			}
		}
	}

	// Removes and destroys the top Mirror instance (the current finished task),
	// activating the previous one (resuming the parent task).
	// NOTE: This method truly ABORTS the task. To switch to a different task
	// without aborting, use parkCurrentTask() + focusBackgroundTask() instead.
	async removeMirrorFromStack(options?: { skipDelegationRepair?: boolean }) {
		if (this.mirrorStack.length === 0) {
			return
		}

		// Pop the top Mirror instance from the stack.
		let task = this.mirrorStack.pop()

		if (task) {
			// Capture delegation metadata before abort/dispose, since abortTask(true)
			// is async and the task reference is cleared afterwards.
			const childTaskId = task.taskId
			const parentTaskId = task.parentTaskId

			task.emit(MirrorVSEventName.TaskUnfocused)

			try {
				// Abort the running task and set isAbandoned to true so
				// all running promises will exit as well.
				await task.abortTask(true)
			} catch (e) {
				this.log(
					`[MirrorProvider#removeMirrorFromStack] abortTask() failed ${task.taskId}.${task.instanceId}: ${e.message}`,
				)
			}

			// Remove event listeners before clearing the reference.
			const cleanupFunctions = this.taskEventListeners.get(task)

			if (cleanupFunctions) {
				cleanupFunctions.forEach((cleanup) => cleanup())
				this.taskEventListeners.delete(task)
			}

			// Also clean up from background tasks map if present
			if (this.backgroundTasks.has(task.taskId)) {
				this.backgroundTasks.delete(task.taskId)
			}

			// Make sure no reference kept, once promises end it will be
			// garbage collected.
			task = undefined

			// Delegation-aware parent metadata repair:
			// If the popped task was a delegated child, repair the parent's metadata
			// so it transitions from "delegated" back to "active" and becomes resumable
			// from the task history list.
			// Skip when called from delegateParentAndOpenChild() during nested delegation
			// transitions (A→B→C), where the caller intentionally replaces the active
			// child and will update the parent to point at the new child.
			if (parentTaskId && childTaskId && !options?.skipDelegationRepair) {
				try {
					const { historyItem: parentHistory } = await this.getTaskWithId(parentTaskId)

					if (parentHistory.status === "delegated" && parentHistory.awaitingChildId === childTaskId) {
						await this.updateTaskHistory({
							...parentHistory,
							status: "active",
							awaitingChildId: undefined,
						})
						this.log(
							`[MirrorProvider#removeMirrorFromStack] Repaired parent ${parentTaskId} metadata: delegated → active (child ${childTaskId} removed)`,
						)
					}
				} catch (err) {
					// Non-fatal: log but do not block the pop operation.
					this.log(
						`[MirrorProvider#removeMirrorFromStack] Failed to repair parent metadata for ${parentTaskId} (non-fatal): ${
							err instanceof Error ? err.message : String(err)
						}`,
					)
				}
			}
		}
	}

	getTaskStackSize(): number {
		return this.mirrorStack.length
	}

	public getCurrentTaskStack(): string[] {
		return this.mirrorStack.map((mirror) => mirror.taskId)
	}

	// Pending Edit Operations Management

	/**
	 * Sets a pending edit operation with automatic timeout cleanup
	 */
	public setPendingEditOperation(
		operationId: string,
		editData: {
			messageTs: number
			editedContent: string
			images?: string[]
			messageIndex: number
			apiConversationHistoryIndex: number
		},
	): void {
		// Clear any existing operation with the same ID
		this.clearPendingEditOperation(operationId)

		// Create timeout for automatic cleanup
		const timeoutId = setTimeout(() => {
			this.clearPendingEditOperation(operationId)
			this.log(`[setPendingEditOperation] Automatically cleared stale pending operation: ${operationId}`)
		}, MirrorProvider.PENDING_OPERATION_TIMEOUT_MS)

		// Store the operation
		this.pendingOperations.set(operationId, {
			...editData,
			timeoutId,
			createdAt: Date.now(),
		})

		this.log(`[setPendingEditOperation] Set pending operation: ${operationId}`)
	}

	/**
	 * Gets a pending edit operation by ID
	 */
	private getPendingEditOperation(operationId: string): PendingEditOperation | undefined {
		return this.pendingOperations.get(operationId)
	}

	/**
	 * Clears a specific pending edit operation
	 */
	private clearPendingEditOperation(operationId: string): boolean {
		const operation = this.pendingOperations.get(operationId)
		if (operation) {
			clearTimeout(operation.timeoutId)
			this.pendingOperations.delete(operationId)
			this.log(`[clearPendingEditOperation] Cleared pending operation: ${operationId}`)
			return true
		}
		return false
	}

	/**
	 * Clears all pending edit operations
	 */
	private clearAllPendingEditOperations(): void {
		for (const [operationId, operation] of this.pendingOperations) {
			clearTimeout(operation.timeoutId)
		}
		this.pendingOperations.clear()
		this.log(`[clearAllPendingEditOperations] Cleared all pending operations`)
	}

	/*
	VSCode extensions use the disposable pattern to clean up resources when the sidebar/editor tab is closed by the user or system. This applies to event listening, commands, interacting with the UI, etc.
	- https://vscode-docs.readthedocs.io/en/stable/extensions/patterns-and-principles/
	- https://github.com/microsoft/vscode-extension-samples/blob/main/webview-sample/src/extension.ts
	*/
	private clearWebviewResources() {
		this.webviewManager.clearWebviewResources()
	}

	async dispose() {
		if (this._disposed) {
			return
		}

		this._disposed = true
		this.log("Disposing MirrorProvider...")

		// Clear background tasks first (they are running independently)
		for (const [taskId, task] of this.backgroundTasks) {
			this.log(`[dispose] Aborting background task ${taskId}.${task.instanceId}`)
			try {
				await task.abortTask(true)
			} catch (e) {
				this.log(`[dispose] abortTask() failed for background task ${taskId}: ${e.message}`)
			}
			// Remove event listeners
			const cleanupFunctions = this.taskEventListeners.get(task)
			if (cleanupFunctions) {
				cleanupFunctions.forEach((cleanup) => cleanup())
				this.taskEventListeners.delete(task)
			}
		}
		this.backgroundTasks.clear()
		this.log("Cleared background tasks")

		// Clear all tasks from the stack.
		while (this.mirrorStack.length > 0) {
			await this.removeMirrorFromStack()
		}

		this.log("Cleared all tasks")

		// Clear all pending edit operations to prevent memory leaks
		this.clearAllPendingEditOperations()
		this.log("Cleared pending operations")

		if (this.view && "dispose" in this.view) {
			this.view.dispose()
			this.log("Disposed webview")
		}

		this.clearWebviewResources()

		while (this.disposables.length) {
			const x = this.disposables.pop()

			if (x) {
				x.dispose()
			}
		}

		this._workspaceTracker?.dispose()
		this._workspaceTracker = undefined
		await this.mcpHub?.unregisterClient()
		this.mcpHub = undefined
		await this.skillsManager?.dispose()
		this.skillsManager = undefined
		this.customModesManager?.dispose()
		this.taskHistoryStore.dispose()
		this.flushGlobalStateWriteThrough()
		this.log("Disposed all disposables")
		MirrorProvider.activeInstances.delete(this)

		// Clean up any event listeners attached to this provider
		this.removeAllListeners()

		McpServerManager.unregisterProvider(this)
	}

	public static getVisibleInstance(): MirrorProvider | undefined {
		return Helpers.getVisibleInstance(this.activeInstances)
	}

	public static async getInstance(): Promise<MirrorProvider | undefined> {
		return Helpers.getInstance(this.activeInstances, MirrorProvider)
	}

	public static async isActiveTask(): Promise<boolean> {
		return Helpers.isActiveTask(this.activeInstances, MirrorProvider)
	}

	public static async handleCodeAction(
		command: CodeActionId,
		promptType: CodeActionName,
		params: Record<string, string | any[]>,
	): Promise<void> {
		return Helpers.handleCodeAction(this.activeInstances, MirrorProvider, command, promptType, params)
	}

	public static async handleTerminalAction(
		command: TerminalActionId,
		promptType: TerminalActionPromptType,
		params: Record<string, string | any[]>,
	): Promise<void> {
		return Helpers.handleTerminalAction(this.activeInstances, MirrorProvider, command, promptType, params)
	}

	async resolveWebviewView(webviewView: vscode.WebviewView | vscode.WebviewPanel) {
		this.view = webviewView
		const inTabMode = "onDidChangeViewState" in webviewView

		if (inTabMode) {
			setPanel(webviewView, "tab")
		} else if ("onDidChangeVisibility" in webviewView) {
			setPanel(webviewView, "sidebar")
		}

		// Initialize out-of-scope variables that need to receive persistent
		// global state values.
		this.getState().then(
			({
				terminalShellIntegrationTimeout = Terminal.defaultShellIntegrationTimeout,
				terminalShellIntegrationDisabled = false,
				terminalCommandDelay = 0,
				terminalZshClearEolMark = true,
				terminalZshOhMy = false,
				terminalZshP10k = false,
				terminalPowershellCounter = false,
				terminalZdotdir = false,
				ttsEnabled,
				ttsSpeed,
			}) => {
				Terminal.setShellIntegrationTimeout(terminalShellIntegrationTimeout)
				Terminal.setShellIntegrationDisabled(terminalShellIntegrationDisabled)
				Terminal.setCommandDelay(terminalCommandDelay)
				Terminal.setTerminalZshClearEolMark(terminalZshClearEolMark)
				Terminal.setTerminalZshOhMy(terminalZshOhMy)
				Terminal.setTerminalZshP10k(terminalZshP10k)
				Terminal.setPowershellCounter(terminalPowershellCounter)
				Terminal.setTerminalZdotdir(terminalZdotdir)
				setTtsEnabled(ttsEnabled ?? false)
				setTtsSpeed(ttsSpeed ?? 1)
			},
		)

		// Initialize image generation providers (async, non-blocking)
		this.getState()
			.then((state) => {
				const {
					initializeImageProviders,
					connectProviderSelectorToSettings,
				} = require("../../services/image-runtime")
				initializeImageProviders(state.openRouterImageApiKey, this.context, {
					comfyui: state.comfyuiAutoSetup,
					currentProvider: state.imageGenerationProvider,
				})
				// Use a dynamic reader from ContextProxy so the selector always
				// reflects the current settings value, not a stale startup snapshot.
				// generationProviders provides per-pipeline-type overrides.
				connectProviderSelectorToSettings(() => ({
					imageGenerationProvider: this.contextProxy.getValue("imageGenerationProvider"),
					generationProviders: this.contextProxy.getValue("generationProviders"),
				}))
			})
			.catch((error) => {
				this.log(`Failed to initialize image providers: ${error}`)
			})

		// Initialize search providers (non-blocking).
		this.getState()
			.then((state) => {
				const { initializeSearchProviders, connectSearchProviderSelector } = require("../../services/search")
				initializeSearchProviders({
					userBraveApiKey: state.apiConfiguration?.apiKey, // Fallback if they share API keys field
					activeProvider: state.activeSearchProvider,
				})
				connectSearchProviderSelector(() => ({
					activeProvider: this.contextProxy.getValue("activeSearchProvider") as string | undefined,
				}))
			})
			.catch((error) => {
				this.log(`Failed to initialize search providers: ${error}`)
			})

		// Set up webview options with proper resource roots
		const resourceMirrorts = [this.contextProxy.extensionUri]

		// Add workspace folders to allow access to workspace files
		if (vscode.workspace.workspaceFolders) {
			resourceMirrorts.push(...vscode.workspace.workspaceFolders.map((folder) => folder.uri))
		}

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: resourceMirrorts,
		}

		webviewView.webview.html =
			this.contextProxy.extensionMode === vscode.ExtensionMode.Development
				? await this.getHMRHtmlContent(webviewView.webview)
				: await this.getHtmlContent(webviewView.webview)

		// Sets up an event listener to listen for messages passed from the webview view context
		// and executes code based on the message that is received.
		this.setWebviewMessageListener(webviewView.webview)

		// Initialize code index status subscription for the current workspace.
		this.updateCodeIndexStatusSubscription()

		// Listen for active editor changes to update code index status for the
		// current workspace.
		const activeEditorSubscription = vscode.window.onDidChangeActiveTextEditor(() => {
			// Update subscription when workspace might have changed.
			this.updateCodeIndexStatusSubscription()
		})
		this.webviewDisposables.push(activeEditorSubscription)

		// Listen for when the panel becomes visible.
		// https://github.com/microsoft/vscode-discussions/discussions/840
		if ("onDidChangeViewState" in webviewView) {
			// WebviewView and WebviewPanel have all the same properties except
			// for this visibility listener panel.
			const viewStateDisposable = webviewView.onDidChangeViewState(() => {
				if (this.view?.visible) {
					this.postMessageToWebview({ type: "action", action: "didBecomeVisible" })
				}
			})

			this.webviewDisposables.push(viewStateDisposable)
		} else if ("onDidChangeVisibility" in webviewView) {
			// sidebar
			const visibilityDisposable = webviewView.onDidChangeVisibility(() => {
				if (this.view?.visible) {
					this.postMessageToWebview({ type: "action", action: "didBecomeVisible" })
				}
			})

			this.webviewDisposables.push(visibilityDisposable)
		}

		// Listen for when the view is disposed
		// This happens when the user closes the view or when the view is closed programmatically
		webviewView.onDidDispose(
			async () => {
				if (inTabMode) {
					this.log("Disposing MirrorProvider instance for tab view")
					await this.dispose()
				} else {
					this.log("Clearing webview resources for sidebar view")
					this.clearWebviewResources()
					// Reset current workspace manager reference when view is disposed
					this.codeIndexManager = undefined
				}
			},
			null,
			this.disposables,
		)

		// Listen for when color changes
		const configDisposable = vscode.workspace.onDidChangeConfiguration(async (e) => {
			if (e && e.affectsConfiguration("workbench.colorTheme")) {
				// Sends latest theme name to webview
				await this.postMessageToWebview({ type: "theme", text: JSON.stringify(await getTheme()) })
			}
		})
		this.webviewDisposables.push(configDisposable)

		// If the extension is starting a new session, clear previous task state.
		// But don't clear if there's already an active task (e.g., resumed via IPC/bridge).
		const currentTask = this.getCurrentTask()
		if (!currentTask || currentTask.abandoned || currentTask.abort) {
			await this.removeMirrorFromStack()
		}

		// NOTE: Session restoration is intentionally NOT done here.
		// The webview sends "webviewDidLaunch" → handleWebviewDidLaunch() →
		// getOrCreateSession() → restoreSessionTabs() in that order.
		// A fire-and-forvest getOrCreateSession() here would race with the
		// deliberate await in handleWebviewDidLaunch(), potentially creating a
		// brand-new session before the persisted session ID is loaded, causing
		// restoreSessionTabs() to find zero history items for the wrong session.
		//
		// handleWebviewDidLaunch() handles session restoration properly via await.
	}

	public async createTaskWithHistoryItem(
		historyItem: HistoryItem & { rootTask?: Task; parentTask?: Task },
		options?: { startTask?: boolean; skipStackCleanup?: boolean; skipGlobalStateChanges?: boolean },
	) {
		const isCliRuntime = process.env.MIRROR_CLI_RUNTIME === "1"
		// CLI injects runtime provider settings from command flags/env at startup.
		// Restoring provider profiles from task history can overwrite those
		// runtime settings with stale/incomplete persisted profiles.
		const skipProfileRestoreFromHistory = isCliRuntime

		// Check if we're rehydrating the current task to avoid flicker
		const currentTask = this.getCurrentTask()
		const isRehydratingCurrentTask = currentTask && currentTask.taskId === historyItem.id

		if (!isRehydratingCurrentTask && !options?.skipStackCleanup) {
			await this.removeMirrorFromStack()
		}

		// If the history item has a saved mode, restore it and its associated API configuration.
		// Skip when restoring background tabs during session reload (skipGlobalStateChanges),
		// since only the focused task should drive global mode/config.
		if (historyItem.mode && !options?.skipGlobalStateChanges) {
			// Validate that the mode still exists
			const customModes = await this.customModesManager.getCustomModes()
			const modeExists = getModeBySlug(historyItem.mode, customModes) !== undefined

			if (!modeExists) {
				// Mode no longer exists, fall back to default mode.
				this.log(
					`Mode '${historyItem.mode}' from history no longer exists. Falling back to default mode '${defaultModeSlug}'.`,
				)
				historyItem.mode = defaultModeSlug
			}

			await this.updateGlobalState("mode", historyItem.mode)

			// Load the saved API config for the restored mode if it exists.
			// Skip mode-based profile activation if historyItem.apiConfigName exists,
			// since the task's specific provider profile will override it anyway.
			const lockApiConfigAcrossModes = this.context.workspaceState.get("lockApiConfigAcrossModes", false)

			if (!historyItem.apiConfigName && !lockApiConfigAcrossModes && !skipProfileRestoreFromHistory) {
				const savedConfigId = await this.providerSettingsManager.getModeConfigId(historyItem.mode)
				const listApiConfig = await this.providerSettingsManager.listConfig()

				// Update listApiConfigMeta first to ensure UI has latest data.
				await this.updateGlobalState("listApiConfigMeta", listApiConfig)

				// If this mode has a saved config, use it.
				if (savedConfigId) {
					const profile = listApiConfig.find(({ id }) => id === savedConfigId)

					if (profile?.name) {
						try {
							// Check if the profile has actual API configuration (not just an id).
							// In CLI mode, the ProviderSettingsManager may return empty default profiles
							// that only contain 'id' and 'name' fields. Activating such a profile would
							// overwrite the CLI's working API configuration with empty settings.
							const fullProfile = await this.providerSettingsManager.getProfile({ name: profile.name })
							const hasActualSettings = !!fullProfile.apiProvider

							if (hasActualSettings) {
								await this.activateProviderProfile({ name: profile.name })
							} else {
								// The task will continue with the current/default configuration.
							}
						} catch (error) {
							// Log the error but continue with task restoration.
							this.log(
								`Failed to restore API configuration for mode '${historyItem.mode}': ${
									error instanceof Error ? error.message : String(error)
								}. Continuing with default configuration.`,
							)
							// The task will continue with the current/default configuration.
						}
					}
				}
			}
		}

		// If the history item has a saved API config name (provider profile), restore it.
		// This overrides any mode-based config restoration above, because the task's
		// specific provider profile takes precedence over mode defaults.
		// Skip when restoring background tabs during session reload (skipGlobalStateChanges),
		// since only the focused task should drive global config.
		if (historyItem.apiConfigName && !skipProfileRestoreFromHistory && !options?.skipGlobalStateChanges) {
			const listApiConfig = await this.providerSettingsManager.listConfig()
			// Keep global state/UI in sync with latest profiles for parity with mode restoration above.
			await this.updateGlobalState("listApiConfigMeta", listApiConfig)
			const profile = listApiConfig.find(({ name }) => name === historyItem.apiConfigName)

			if (profile?.name) {
				try {
					await this.activateProviderProfile(
						{ name: profile.name },
						{ persistModeConfig: false, persistTaskHistory: false },
					)
				} catch (error) {
					// Log the error but continue with task restoration.
					this.log(
						`Failed to restore API configuration '${historyItem.apiConfigName}' for task: ${
							error instanceof Error ? error.message : String(error)
						}. Continuing with current configuration.`,
					)
				}
			} else {
				// Profile no longer exists, log warning but continue
				this.log(
					`Provider profile '${historyItem.apiConfigName}' from history no longer exists. Using current configuration.`,
				)
			}
		} else if (historyItem.apiConfigName && skipProfileRestoreFromHistory) {
			this.log(
				`Skipping restore of provider profile '${historyItem.apiConfigName}' for task ${historyItem.id} in CLI runtime.`,
			)
		}

		if (historyItem.sessionId && !options?.skipGlobalStateChanges) {
			this.setCurrentSessionId(historyItem.sessionId)
			await this.contextProxy.setValue("currentSessionId", historyItem.sessionId)
		}

		const { apiConfiguration, enableCheckpoints, checkpointTimeout, experiments } = await this.getState()

		const task = new Task({
			provider: this,
			apiConfiguration,
			enableCheckpoints,
			checkpointTimeout,
			consecutiveMistakeLimit: apiConfiguration.consecutiveMistakeLimit,
			historyItem,
			experiments,
			rootTask: historyItem.rootTask,
			parentTask: historyItem.parentTask,
			taskNumber: historyItem.number,
			workspacePath: historyItem.workspace,
			onCreated: this.taskCreationCallback,
			startTask: options?.startTask ?? true,
			// Preserve the status from the history item to avoid overwriting it when the task saves messages
			initialStatus: historyItem.status,
		})

		if (options?.startTask === false) {
			await task.loadSavedMessagesOnly()
		}

		if (isRehydratingCurrentTask) {
			// Replace the current task in-place to avoid UI flicker
			const stackIndex = this.mirrorStack.length - 1

			// Properly dispose of the old task to ensure garbage collection
			const oldTask = this.mirrorStack[stackIndex]

			// Abort the old task to stop running processes and mark as abandoned
			try {
				await oldTask.abortTask(true)
			} catch (e) {
				this.log(
					`[createTaskWithHistoryItem] abortTask() failed for old task ${oldTask.taskId}.${oldTask.instanceId}: ${e.message}`,
				)
			}

			// Remove event listeners from the old task
			const cleanupFunctions = this.taskEventListeners.get(oldTask)
			if (cleanupFunctions) {
				cleanupFunctions.forEach((cleanup) => cleanup())
				this.taskEventListeners.delete(oldTask)
			}

			// Replace the task in the stack
			this.mirrorStack[stackIndex] = task
			task.emit(MirrorVSEventName.TaskFocused)

			// Perform preparation tasks and set up event listeners
			await this.performPreparationTasks(task)

			this.log(
				`[createTaskWithHistoryItem] rehydrated task ${task.taskId}.${task.instanceId} in-place (flicker-free)`,
			)
		} else {
			await this.addMirrorToStack(task)

			this.log(
				`[createTaskWithHistoryItem] ${task.parentTask ? "child" : "parent"} task ${task.taskId}.${task.instanceId} instantiated`,
			)
		}

		// Check if there's a pending edit after checkpoint restoration
		const operationId = `task-${task.taskId}`
		const pendingEdit = this.getPendingEditOperation(operationId)
		if (pendingEdit) {
			this.clearPendingEditOperation(operationId) // Clear the pending edit

			this.log(`[createTaskWithHistoryItem] Processing pending edit after checkpoint restoration`)

			// Process the pending edit after a short delay to ensure the task is fully initialized
			setTimeout(async () => {
				try {
					// Find the message index in the restored state
					const { messageIndex, apiConversationHistoryIndex } = (() => {
						const messageIndex = task.mirrorMessages.findIndex((msg) => msg.ts === pendingEdit.messageTs)
						const apiConversationHistoryIndex = task.apiConversationHistory.findIndex(
							(msg) => msg.ts === pendingEdit.messageTs,
						)
						return { messageIndex, apiConversationHistoryIndex }
					})()

					if (messageIndex !== -1) {
						// Remove the target message and all subsequent messages
						await task.overwriteMirrorMessages(task.mirrorMessages.slice(0, messageIndex))

						if (apiConversationHistoryIndex !== -1) {
							await task.overwriteApiConversationHistory(
								task.apiConversationHistory.slice(0, apiConversationHistoryIndex),
							)
						}

						// Process the edited message
						await task.handleWebviewAskResponse(
							"messageResponse",
							pendingEdit.editedContent,
							pendingEdit.images,
						)
					}
				} catch (error) {
					this.log(`[createTaskWithHistoryItem] Error processing pending edit: ${error}`)
				}
			}, 100) // Small delay to ensure task is fully ready
		}

		return task
	}

	public async postMessageToWebview(message: ExtensionMessage) {
		await this.webviewManager.postMessageToWebview(message)
	}

	private async getHMRHtmlContent(webview: vscode.Webview): Promise<string> {
		return this.webviewManager.getHMRHtmlContent(webview)
	}

	/**
	 * Defines and returns the HTML that should be rendered within the webview panel.
	 *
	 * @remarks This is also the place where references to the React webview build files
	 * are created and inserted into the webview HTML.
	 *
	 * @param webview A reference to the extension webview
	 * @param extensionUri The URI of the directory containing the extension
	 * @returns A template string literal containing the HTML that should be
	 * rendered within the webview panel
	 */
	private async getHtmlContent(webview: vscode.Webview): Promise<string> {
		return this.webviewManager.getHtmlContent(webview)
	}

	/**
	 * Sets up an event listener to listen for messages passed from the webview context and
	 * executes code based on the message that is received.
	 *
	 * @param webview A reference to the extension webview
	 */
	private setWebviewMessageListener(webview: vscode.Webview) {
		this.webviewManager.setWebviewMessageListener(webview)
	}

	/**
	 * Handle switching to a new mode, including updating the associated API configuration
	 * @param newMode The mode to switch to
	 */
	public async handleModeSwitch(newMode: Mode) {
		const task = this.getCurrentTask()

		if (task) {
			task.emit(MirrorVSEventName.TaskModeSwitched, task.taskId, newMode)

			try {
				// Update the task history with the new mode first.
				const taskHistoryItem =
					this.taskHistoryStore.get(task.taskId) ??
					(this.getGlobalState("taskHistory") ?? []).find((item) => item.id === task.taskId)

				if (taskHistoryItem) {
					await this.updateTaskHistory({ ...taskHistoryItem, mode: newMode })
				}

				// Only update the task's mode after successful persistence.
				;(task as any)._taskMode = newMode
			} catch (error) {
				// If persistence fails, log the error but don't update the in-memory state.
				this.log(
					`Failed to persist mode switch for task ${task.taskId}: ${error instanceof Error ? error.message : String(error)}`,
				)

				// This ensures the in-memory state remains consistent with persisted state.
				throw error
			}
		}

		await this.updateGlobalState("mode", newMode)

		this.emit(MirrorVSEventName.ModeChanged, newMode)

		// If workspace lock is on, keep the current API config — don't load mode-specific config
		const lockApiConfigAcrossModes = this.context.workspaceState.get("lockApiConfigAcrossModes", false)
		if (lockApiConfigAcrossModes) {
			await this.postStateToWebview()
			return
		}

		// Load the saved API config for the new mode if it exists.
		const savedConfigId = await this.providerSettingsManager.getModeConfigId(newMode)
		const listApiConfig = await this.providerSettingsManager.listConfig()

		// Update listApiConfigMeta first to ensure UI has latest data.
		await this.updateGlobalState("listApiConfigMeta", listApiConfig)

		// If this mode has a saved config, use it.
		if (savedConfigId) {
			const profile = listApiConfig.find(({ id }) => id === savedConfigId)

			if (profile?.name) {
				// Check if the profile has actual API configuration (not just an id).
				// In CLI mode, the ProviderSettingsManager may return empty default profiles
				// that only contain 'id' and 'name' fields. Activating such a profile would
				// overwrite the CLI's working API configuration with empty settings.
				// Skip activation if the profile has no apiProvider set - this indicates
				// an unconfigured/empty profile.
				const fullProfile = await this.providerSettingsManager.getProfile({ name: profile.name })
				const hasActualSettings = !!fullProfile.apiProvider

				if (hasActualSettings) {
					await this.activateProviderProfile({ name: profile.name })
				} else {
					// The task will continue with the current/default configuration.
				}
			} else {
				// The task will continue with the current/default configuration.
			}
		} else {
			// If no saved config for this mode, save current config as default.
			const currentApiConfigNameAfter = this.getGlobalState("currentApiConfigName")

			if (currentApiConfigNameAfter) {
				const config = listApiConfig.find((c) => c.name === currentApiConfigNameAfter)

				if (config?.id) {
					await this.providerSettingsManager.setModeConfig(newMode, config.id)
				}
			}
		}

		await this.postStateToWebview()
	}

	// Provider Profile Management

	/**
	 * Updates the current task's API handler.
	 * Rebuilds when:
	 * - provider or model changes, OR
	 * - explicitly forced (e.g., user-initiated profile switch/save to apply changed settings like headers/baseUrl/tier).
	 * Always synchronizes task.apiConfiguration with latest provider settings.
	 * @param providerSettings The new provider settings to apply
	 * @param options.forceRebuild Force rebuilding the API handler regardless of provider/model equality
	 */
	private updateTaskApiHandlerIfNeeded(
		providerSettings: ProviderSettings,
		options: { forceRebuild?: boolean } = {},
	): void {
		this.profileManager["updateTaskApiHandlerIfNeeded"](providerSettings, options)
	}

	getProviderProfileEntries(): ProviderSettingsEntry[] {
		return this.profileManager.getProviderProfileEntries()
	}

	getProviderProfileEntry(name: string): ProviderSettingsEntry | undefined {
		return this.profileManager.getProviderProfileEntry(name)
	}

	public hasProviderProfileEntry(name: string): boolean {
		return this.profileManager.hasProviderProfileEntry(name)
	}

	async upsertProviderProfile(
		name: string,
		providerSettings: ProviderSettings,
		activate: boolean = true,
	): Promise<string | undefined> {
		return this.profileManager.upsertProviderProfile(name, providerSettings, activate)
	}

	async deleteProviderProfile(profileToDelete: ProviderSettingsEntry) {
		await this.profileManager.deleteProviderProfile(profileToDelete)
	}

	private async persistStickyProviderProfileToCurrentTask(apiConfigName: string): Promise<void> {
		await this.profileManager["persistStickyProviderProfileToCurrentTask"](apiConfigName)
	}

	async activateProviderProfile(
		args: { name: string } | { id: string },
		options?: { persistModeConfig?: boolean; persistTaskHistory?: boolean },
	) {
		await this.profileManager.activateProviderProfile(args, options)
	}

	async updateCustomInstructions(instructions?: string) {
		await this.profileManager.updateCustomInstructions(instructions)
	}

	// MCP

	async ensureMcpServersDirectoryExists(): Promise<string> {
		return this.helpers.ensureMcpServersDirectoryExists()
	}

	async ensureSettingsDirectoryExists(): Promise<string> {
		return this.helpers.ensureSettingsDirectoryExists()
	}

	// OpenRouter

	async handleOpenRouterCallback(code: string) {
		await this.profileManager.handleOpenRouterCallback(code)
	}

	// Requesty

	async handleRequestyCallback(code: string, baseUrl: string | null) {
		await this.profileManager.handleRequestyCallback(code, baseUrl)
	}

	// Task history (delegated to TaskHistoryManager)

	async getTaskWithId(id: string): Promise<{
		historyItem: HistoryItem
		taskDirPath: string
		apiConversationHistoryFilePath: string
		uiMessagesFilePath: string
		apiConversationHistory: Anthropic.MessageParam[]
	}> {
		return this.taskHistoryManager.getTaskWithId(id)
	}

	async getTaskWithAggregatedCosts(taskId: string): Promise<{
		historyItem: HistoryItem
		aggregatedCosts: AggregatedCosts
	}> {
		return this.taskHistoryManager.getTaskWithAggregatedCosts(taskId)
	}

	async showTaskWithId(id: string) {
		const currentTaskId = this.getCurrentTask()?.taskId

		if (id === currentTaskId) {
			// Already the current task — just open the chat UI
			await this.postMessageToWebview({ type: "action", action: "chatButtonClicked" })
			return
		}

		const { historyItem } = await this.getTaskWithId(id)

		if (historyItem.sessionId) {
			this.setCurrentSessionId(historyItem.sessionId)
			await this.contextProxy.setValue("currentSessionId", historyItem.sessionId)
		}

		// Check if this task is already running in the background
		if (this.backgroundTasks.has(id)) {
			// Swap focus: park current → focus background task
			await this.focusBackgroundTask(id)
		} else {
			// Park the current task (don't abort it — keep streaming in background)
			await this.parkCurrentTask()

			// Create a fresh task from history for the requested chat
			await this.createTaskWithHistoryItem(historyItem)
		}

		await this.postMessageToWebview({ type: "action", action: "chatButtonClicked" })
		await this.postStateToWebview()
	}

	/**
	 * Restores all tabs from the current session after VS Code restart or startup.
	 *
	 * Queries TaskHistoryStore for all history items matching the current
	 * session ID, then creates live Task objects from them (with startTask: false)
	 * so they appear as restored tabs in the webview.
	 *
	 * The most recent task becomes the focused (active) tab; all others are
	 * added as background tabs in the mirrorStack.
	 *
	 * Safe to call even if the session has no tasks or no session ID is set
	 * (both are no-ops).
	 */
	async restoreSessionTabs(): Promise<void> {
		const sessionId = this.getCurrentSessionId()
		if (!sessionId) {
			this.log("[restoreSessionTabs] No session ID — skipping tab restoration")
			return
		}

		// Ensure the task history store's in-memory cache is loaded before reading.
		await this.taskHistoryStore.initialized

		// Get ALL history items and filter by sessionId and workspace
		const allItems = this.taskHistoryStore.getAll()
		const currentWorkspace = path.resolve(this.cwd)
		const sessionItems = allItems.filter((item) => {
			if (item.sessionId !== sessionId) {
				return false
			}
			if (item.workspace) {
				return path.resolve(item.workspace) === currentWorkspace
			}
			return true // Fallback for legacy tasks without workspace
		})

		// ── Filter out tabs the user has explicitly closed ────────────────────
		const closedTabs: Record<string, string[]> = (await this.contextProxy.getValue("sessionClosedTabs")) || {}
		const closedForSession = closedTabs[sessionId] || []
		const openItems = sessionItems.filter((item) => !closedForSession.includes(item.id))

		if (openItems.length === 0) {
			this.log(
				`[restoreSessionTabs] No open history items found for session ${sessionId} in workspace ${currentWorkspace} — no tabs to restore`,
			)
			return
		}

		// Clear mirrorStack before restoring tasks to avoid duplicating existing items
		while (this.mirrorStack.length > 0) {
			const task = this.mirrorStack.pop()
			if (task) {
				task.emit(MirrorVSEventName.TaskUnfocused)
			}
		}

		if (closedForSession.length > 0) {
			this.log(
				`[restoreSessionTabs] Skipping ${closedForSession.length} previously closed tabs for session ${sessionId}`,
			)
		}

		// Sort ascending by timestamp so the newest item is last
		const sorted = openItems.sort((a, b) => a.ts - b.ts)

		// The newest item becomes the focused (active) tab.
		// All other items become background tabs in the mirrorStack.
		const focusedItem = sorted[sorted.length - 1]
		const backgroundItems = sorted.slice(0, -1)

		const { apiConfiguration, enableCheckpoints, checkpointTimeout, experiments } = await this.getState()

		// ── Restore background tabs (excludes the focused item) ─────────────
		const restoredTasks: Task[] = []
		for (const item of backgroundItems) {
			try {
				const task = new Task({
					provider: this,
					apiConfiguration,
					enableCheckpoints,
					checkpointTimeout,
					consecutiveMistakeLimit: apiConfiguration.consecutiveMistakeLimit,
					historyItem: item,
					experiments,
					taskNumber: item.number,
					workspacePath: item.workspace,
					onCreated: this.taskCreationCallback,
					startTask: false,
					initialStatus: item.status,
				})
				await task.loadSavedMessagesOnly()
				restoredTasks.push(task)
			} catch (error) {
				this.log(
					`[restoreSessionTabs] Failed to restore background tab ${item.id}: ${error instanceof Error ? error.message : String(error)}`,
				)
			}
		}

		// Push background tabs first (they will be at lower indices)
		// NOTE: Do NOT emit TaskFocused for background tabs — they are parked,
		// not focused. Only the active (top) tab should emit TaskFocused below.
		for (const task of restoredTasks) {
			this.mirrorStack.push(task)
			await this.performPreparationTasks(task)
		}

		// ── Restore the focused (active) tab last ───────────────────────────
		try {
			const task = new Task({
				provider: this,
				apiConfiguration,
				enableCheckpoints,
				checkpointTimeout,
				consecutiveMistakeLimit: apiConfiguration.consecutiveMistakeLimit,
				historyItem: focusedItem,
				experiments,
				taskNumber: focusedItem.number,
				workspacePath: focusedItem.workspace,
				onCreated: this.taskCreationCallback,
				startTask: false,
				initialStatus: focusedItem.status,
			})
			await task.loadSavedMessagesOnly()

			this.mirrorStack.push(task)
			task.emit(MirrorVSEventName.TaskFocused)
			await this.performPreparationTasks(task)

			// Start the focused restored task to show Resume banner and accept messages
			task.startRestoredTask().catch((error) => {
				this.log(`[restoreSessionTabs] Failed to start restored active task: ${error}`)
			})

			this.log(
				`[restoreSessionTabs] Restored ${restoredTasks.length + 1} tabs (${restoredTasks.length} background + 1 focused) for session ${sessionId}`,
			)
		} catch (error) {
			this.log(
				`[restoreSessionTabs] Failed to restore focused tab ${focusedItem.id}: ${error instanceof Error ? error.message : String(error)}`,
			)
		}

		await this.postStateToWebview()
	}

	async exportTaskWithId(id: string) {
		const { historyItem, apiConversationHistory } = await this.getTaskWithId(id)
		const fileName = getTaskFileName(historyItem.ts)
		const defaultUri = await resolveDefaultSaveUri(this.contextProxy, "lastTaskExportPath", fileName, {
			useWorkspace: false,
			fallbackDir: path.join(os.homedir(), "Downloads"),
		})
		const saveUri = await downloadTask(historyItem.ts, apiConversationHistory, defaultUri)

		if (saveUri) {
			await saveLastExportPath(this.contextProxy, "lastTaskExportPath", saveUri)
		}
	}

	/* Condenses a task's message history to use fewer tokens. */
	async condenseTaskContext(taskId: string) {
		return this.taskLifecycleManager.condenseTaskContext(taskId)
	}

	// this function deletes a task from task history, and deletes its checkpoints and delete the task folder
	// If the task has subtasks (childIds), they will also be deleted recursively
	async deleteTaskWithId(id: string, cascadeSubtasks: boolean = true) {
		return this.taskHistoryManager.deleteTaskWithId(id, cascadeSubtasks)
	}

	async deleteTaskFromState(id: string) {
		return this.taskHistoryManager.deleteTaskFromState(id)
	}

	// ── State management (delegated to StateManager) ───────────────────────────

	async refreshWorkspace() {
		await this.stateManager.refreshWorkspace()
	}

	async postStateToWebview() {
		await this.stateManager.postStateToWebview()
	}

	async postStateToWebviewWithoutTaskHistory(): Promise<void> {
		await this.stateManager.postStateToWebviewWithoutTaskHistory()
	}

	async postStateToWebviewWithoutMirrorMessages(): Promise<void> {
		await this.stateManager.postStateToWebviewWithoutMirrorMessages()
	}

	async getStateToPostToWebview(): Promise<ExtensionState> {
		return this.stateManager.getStateToPostToWebview()
	}

	async getState(): Promise<
		Omit<
			ExtensionState,
			| "mirrorMessages"
			| "fileEdits"
			| "renderContext"
			| "hasOpenedModeSelector"
			| "version"
			| "shouldShowAnnouncement"
			| "activeTerminalCount"
			| "activeTerminals"
			| "tabs"
			| "activeTabId"
		>
	> {
		return this.stateManager.getState()
	}

	/**
	 * Updates a task in the task history and optionally broadcasts the updated history to the webview.
	 * Now delegates to TaskHistoryStore for per-task file persistence.
	 *
	 * @param item The history item to update or add
	 * @param options.broadcast Whether to broadcast the updated history to the webview (default: true)
	 * @returns The updated task history array
	 */
	async updateTaskHistory(item: HistoryItem, options: { broadcast?: boolean } = {}): Promise<HistoryItem[]> {
		return this.taskHistoryManager.updateTaskHistory(item, options)
	}

	/**
	 * Schedule a debounced write-through of task history to globalState.
	 * Only used for backward compatibility during the transition period.
	 * Per-task files are authoritative; globalState is the downgrade fallback.
	 */
	private scheduleGlobalStateWriteThrough(): void {
		this.taskHistoryManager.scheduleGlobalStateWriteThrough()
	}

	/**
	 * Flush any pending debounced globalState write-through immediately.
	 */
	private flushGlobalStateWriteThrough(): void {
		this.taskHistoryManager.flushGlobalStateWriteThrough()
	}

	/**
	 * Broadcasts a task history update to the webview.
	 * This sends a lightweight message with just the task history, rather than the full state.
	 * @param history The task history to broadcast (if not provided, reads from the store)
	 */
	public async broadcastTaskHistoryUpdate(history?: HistoryItem[]): Promise<void> {
		await this.taskHistoryManager.broadcastTaskHistoryUpdate(history)
	}

	// ContextProxy

	// @deprecated - Use `ContextProxy#setValue` instead.
	private async updateGlobalState<K extends keyof GlobalState>(key: K, value: GlobalState[K]) {
		await this.contextProxy.setValue(key, value)
	}

	/**
	 * Public wrapper around getGlobalState — needed by StateManager (extracted class).
	 * @deprecated - Use `ContextProxy#getValue` instead.
	 */
	public getGlobalStateValue<K extends keyof GlobalState>(key: K) {
		return this.contextProxy.getValue(key)
	}

	// @deprecated - Use `ContextProxy#getValue` instead.
	private getGlobalState<K extends keyof GlobalState>(key: K) {
		return this.contextProxy.getValue(key)
	}

	public async setValue<K extends keyof MirrorVSSettings>(key: K, value: MirrorVSSettings[K]) {
		await this.contextProxy.setValue(key, value)
	}

	public getValue<K extends keyof MirrorVSSettings>(key: K) {
		return this.contextProxy.getValue(key)
	}

	public getValues() {
		return this.contextProxy.getValues()
	}

	public async setValues(values: MirrorVSSettings) {
		await this.contextProxy.setValues(values)
	}

	// dev

	async resetState() {
		return this.helpers.resetState()
	}

	// logging

	public log(message: string) {
		this.outputChannel.appendLine(message)
		console.log(message)
	}

	// getters

	public get workspaceTracker(): WorkspaceTracker | undefined {
		return this._workspaceTracker
	}

	get viewLaunched() {
		return this.isViewLaunched
	}

	get messages() {
		return this.getCurrentTask()?.mirrorMessages || []
	}

	/**
	 * Exposes the render context for StateManager (extracted class).
	 */
	public getRenderContext(): "sidebar" | "editor" {
		return this.renderContext
	}

	/**
	 * Exposes the mirrorMessages sequence number for StateManager (extracted class).
	 */
	public getMirrorMessagesSeq(): number {
		return this.mirrorMessagesSeq
	}

	/**
	 * Increments the mirrorMessages sequence number for StateManager (extracted class).
	 */
	public incrementMirrorMessagesSeq(): number {
		return ++this.mirrorMessagesSeq
	}

	/**
	 * Exposes the current workspace path for StateManager (extracted class).
	 */
	public getCurrentWorkspacePath(): string | undefined {
		return this.currentWorkspacePath
	}

	/**
	 * Sets the current workspace path for StateManager (extracted class).
	 */
	public setCurrentWorkspacePath(path: string | undefined): void {
		this.currentWorkspacePath = path
	}

	public getMcpHub(): McpHub | undefined {
		return this.mcpHub
	}

	public getSkillsManager(): SkillsManager | undefined {
		return this.skillsManager
	}

	/**
	 * Exposes the disposed flag for WebviewManager (extracted class).
	 */
	public isDisposed(): boolean {
		return this._disposed
	}

	/**
	 * Exposes the view reference for WebviewManager (extracted class).
	 */
	public getView(): vscode.WebviewView | vscode.WebviewPanel | undefined {
		return this.view
	}

	/**
	 * Exposes webview disposables for WebviewManager (extracted class).
	 */
	public getWebviewDisposables(): vscode.Disposable[] {
		return this.webviewDisposables
	}

	/**
	 * Gets the CodeIndexManager for the current active workspace
	 * @returns CodeIndexManager instance for the current workspace or the default one
	 */
	public getCurrentWorkspaceCodeIndexManager(): CodeIndexManager | undefined {
		return CodeIndexManager.getInstance(this.context)
	}

	/**
	 * Updates the code index status subscription to listen to the current workspace manager
	 */
	private updateCodeIndexStatusSubscription(): void {
		// Get the current workspace manager
		const currentManager = this.getCurrentWorkspaceCodeIndexManager()

		// If the manager hasn't changed, no need to update subscription
		if (currentManager === this.codeIndexManager) {
			return
		}

		// Dispose the old subscription if it exists
		if (this.codeIndexStatusSubscription) {
			this.codeIndexStatusSubscription.dispose()
			this.codeIndexStatusSubscription = undefined
		}

		// Update the current workspace manager reference
		this.codeIndexManager = currentManager

		// Subscribe to the new manager's progress updates if it exists
		if (currentManager) {
			this.codeIndexStatusSubscription = currentManager.onProgressUpdate((update: IndexProgressUpdate) => {
				// Only send updates if this manager is still the current one
				if (currentManager === this.getCurrentWorkspaceCodeIndexManager()) {
					// Get the full status from the manager to ensure we have all fields correctly formatted
					const fullStatus = currentManager.getCurrentStatus()
					this.postMessageToWebview({
						type: "indexingStatusUpdate",
						values: fullStatus,
					})
				}
			})

			if (this.view) {
				this.webviewDisposables.push(this.codeIndexStatusSubscription)
			}

			// Send initial status for the current workspace
			this.postMessageToWebview({
				type: "indexingStatusUpdate",
				values: currentManager.getCurrentStatus(),
			})
		}
	}

	/**
	 * TaskProviderLike
	 */

	public getCurrentTask(): Task | undefined {
		if (this.mirrorStack.length === 0) {
			return undefined
		}

		return this.mirrorStack[this.mirrorStack.length - 1]
	}

	/**
	 * Returns a lazily-initialized SessionContextManager for this provider.
	 */
	public getSessionContextManager(): SessionContextManager {
		if (!this.sessionContextManager) {
			this.sessionContextManager = new SessionContextManager(this)
		}
		return this.sessionContextManager
	}

	/**
	 * Builds the compact `# Session Shared Context` section for the given task's
	 * session. Falls back to the current task when no taskId is supplied.
	 * Returns "" when the task has no session, so callers inject nothing.
	 */
	public async buildSessionSharedContext(taskId?: string): Promise<string> {
		const task = taskId
			? (this.mirrorStack.find((t) => t.taskId === taskId) ??
				[...this.backgroundTasks.values()].find((t) => t.taskId === taskId))
			: this.getCurrentTask()
		if (!task?.sessionId) {
			return ""
		}
		return this.getSessionContextManager().buildCompactSummary(task.sessionId, task.taskId)
	}

	public getRecentTasks(): string[] {
		return this.taskHistoryManager.getRecentTasks()
	}

	// When initializing a new task, (not from history but from a tool command
	// new_task) there is no need to remove the previous task since the new
	// task is a subtask of the previous one, and when it finishes it is removed
	// from the stack and the caller is resumed in this way we can have a chain
	// of tasks, each one being a sub task of the previous one until the main
	// task is finished.
	public async createTask(
		text?: string,
		images?: string[],
		parentTask?: Task,
		options: CreateTaskOptions = {},
		configuration: MirrorVSSettings = {},
	): Promise<Task> {
		return this.taskLifecycleManager.createTask(text, images, parentTask, options, configuration)
	}

	public async createTaskFromHistory(
		historyItem: HistoryItem & { rootTask?: Task; parentTask?: Task },
		options?: { startTask?: boolean; parkCurrent?: boolean },
	): Promise<Task> {
		// If parking is requested, park the current task instead of removing it
		if (options?.parkCurrent) {
			await this.parkCurrentTask()
		}

		return this.createTaskWithHistoryItem(historyItem, options)
	}

	/**
	 * Branches a task into another workspace folder, creating a dedicated session,
	 * cloning its complete conversation history with model context notice,
	 * while allowing the current conversation to continue uninterrupted.
	 */
	public async branchTaskToWorkspace(
		sourceTaskId: string,
		targetWorkspacePath: string,
		taskTitle?: string,
	): Promise<Task | null> {
		const { historyItem } = await this.getTaskWithId(sourceTaskId)
		const globalStoragePath = this.context.globalStorageUri.fsPath

		// 1. Create a dedicated session for the target branch
		const branchSessionId = await this.sessionManager.createSession(targetWorkspacePath)
		const sessionNames = (await this.contextProxy.getValue("sessionNames")) || {}
		const sourceSessionName = historyItem.sessionId ? sessionNames[historyItem.sessionId] : "Session"
		const targetWorkspaceName = path.basename(targetWorkspacePath)
		const branchSessionName = `${sourceSessionName || "Session"} (Branch - ${targetWorkspaceName})`
		await this.sessionManager.setSessionName(branchSessionId, branchSessionName)

		// 2. Generate new task ID and clone conversation history
		const newTaskId = Date.now().toString()
		const cleanTitle = taskTitle || `${historyItem.task ? historyItem.task.slice(0, 30) : "Task"} (Branch)`

		const sourceName = historyItem.workspace ? path.basename(historyItem.workspace) : path.basename(this.cwd)
		const branchBanner = {
			ts: Date.now(),
			type: "say" as const,
			say: "text" as const,
			text: `🌿 Branched conversation from workspace "${sourceName}" to "${targetWorkspaceName}". Context and history transferred.`,
		}
		const sourceUiMessages = await readTaskMessages({ taskId: sourceTaskId, globalStoragePath })
		const clonedUiMessages = [...sourceUiMessages, branchBanner]

		const sourceApiMessages = await readApiMessages({ taskId: sourceTaskId, globalStoragePath })
		const branchNotice = {
			role: "user" as const,
			content: [
				{
					type: "text" as const,
					text: `[System Notice: This conversation was branched from workspace "${sourceName}" to "${targetWorkspaceName}". Context and previous history have been transferred. You are now operating in workspace "${targetWorkspaceName}".]`,
				},
			],
		}
		const clonedApiMessages = [...sourceApiMessages, branchNotice]

		// Save cloned files for the new task
		await saveTaskMessages({ messages: clonedUiMessages, taskId: newTaskId, globalStoragePath })
		await saveApiMessages({ messages: clonedApiMessages, taskId: newTaskId, globalStoragePath })

		// 3. Create and add the new HistoryItem in target workspace
		const newHistoryItem: HistoryItem = {
			id: newTaskId,
			number: this.taskHistoryStore.getAll().length + 1,
			ts: Date.now(),
			task: cleanTitle,
			tokensIn: historyItem.tokensIn,
			tokensOut: historyItem.tokensOut,
			totalCost: 0,
			workspace: targetWorkspacePath,
			sessionId: branchSessionId,
			status: "active",
		}
		await this.taskHistoryStore.upsert(newHistoryItem)

		// 4. If branching to a different workspace, keep current active conversation uninterrupted
		if (path.resolve(targetWorkspacePath) !== path.resolve(this.cwd)) {
			vscode.window.showInformationMessage(
				`🌿 Branched conversation to workspace "${targetWorkspaceName}". Your current chat continues uninterrupted here.`,
			)
			await this.postStateToWebview()
			return null
		}

		// If branching within the same workspace, switch to the new session
		this.currentSessionId = branchSessionId
		await this.contextProxy.setValue("currentSessionId", branchSessionId)
		const newTask = await this.createTaskWithHistoryItem(newHistoryItem, { startTask: false })
		newTask.startRestoredTask().catch((error) => {
			this.log(`[branchTaskToWorkspace] Failed to start restored task: ${error}`)
		})

		await this.postStateToWebview()
		return newTask
	}

	public async cancelTask(): Promise<void> {
		return this.taskLifecycleManager.cancelTask()
	}

	// Clear the current task without treating it as a subtask.
	// This is used when the user cancels a task that is not a subtask.
	public async clearTask(): Promise<void> {
		return this.taskLifecycleManager.clearTask()
	}

	public resumeTask(taskId: string): void {
		this.taskLifecycleManager.resumeTask(taskId)
	}

	// Modes

	public async getModes(): Promise<{ slug: string; name: string }[]> {
		try {
			const customModes = await this.customModesManager.getCustomModes()
			return [...DEFAULT_MODES, ...customModes].map(({ slug, name }) => ({ slug, name }))
		} catch (error) {
			return DEFAULT_MODES.map(({ slug, name }) => ({ slug, name }))
		}
	}

	public async getMode(): Promise<string> {
		const { mode } = await this.getState()
		return mode
	}

	public async setMode(mode: string): Promise<void> {
		await this.setValues({ mode })
	}

	// Provider Profiles

	public async getProviderProfiles(): Promise<{ name: string; provider?: string }[]> {
		const { listApiConfigMeta = [] } = await this.getState()
		return listApiConfigMeta.map((profile) => ({ name: profile.name, provider: profile.apiProvider }))
	}

	public async getProviderProfile(): Promise<string> {
		const { currentApiConfigName = "default" } = await this.getState()
		return currentApiConfigName
	}

	public async setProviderProfile(name: string): Promise<void> {
		await this.activateProviderProfile({ name })
	}

	public get cwd() {
		return this.currentWorkspacePath || getWorkspacePath()
	}

	/**
	 * Delegate parent task and open child task.
	 *
	 * - Enforce single-open invariant
	 * - Persist parent delegation metadata
	 * - Emit TaskDelegated (task-level; API forwards to provider/bridge)
	 * - Create child as sole active and switch mode to child's mode
	 */
	public async delegateParentAndOpenChild(params: {
		parentTaskId: string
		message: string
		initialTodos: TodoItem[]
		mode: string
	}): Promise<Task> {
		return this.delegationManager.delegateParentAndOpenChild(params)
	}

	public async reopenParentFromDelegation(params: {
		parentTaskId: string
		childTaskId: string
		completionResultSummary: string
	}): Promise<void> {
		return this.delegationManager.reopenParentFromDelegation(params)
	}

	/**
	 * Convert a file path to a webview-accessible URI
	 * This method safely converts file paths to URIs that can be loaded in the webview
	 *
	 * @param filePath - The absolute file path to convert
	 * @returns The webview URI string, or the original file URI if conversion fails
	 * @throws {Error} When webview is not available
	 * @throws {TypeError} When file path is invalid
	 */
	public convertToWebviewUri(filePath: string): string {
		try {
			const fileUri = vscode.Uri.file(filePath)

			// Check if we have a webview available
			if (this.view?.webview) {
				const webviewUri = this.view.webview.asWebviewUri(fileUri)
				return webviewUri.toString()
			}

			// Specific error for no webview available
			const error = new Error("No webview available for URI conversion")
			console.error(error.message)
			// Fallback to file URI if no webview available
			return fileUri.toString()
		} catch (error) {
			// More specific error handling
			if (error instanceof TypeError) {
				console.error("Invalid file path provided for URI conversion:", error)
			} else {
				console.error("Failed to convert to webview URI:", error)
			}
			// Return file URI as fallback
			return vscode.Uri.file(filePath).toString()
		}
	}
}

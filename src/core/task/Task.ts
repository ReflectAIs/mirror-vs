import * as path from "path"
import * as vscode from "vscode"
import os from "os"
import crypto from "crypto"
import { v7 as uuidv7 } from "uuid"
import EventEmitter from "events"

import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI from "openai"
import debounce from "lodash.debounce"
import delay from "delay"
import pWaitFor from "p-wait-for"
import { serializeError } from "serialize-error"
import { Package } from "../../shared/package"
import { formatToolInvocation } from "../tools/helpers/toolResultFormatting"

import {
	type TaskLike,
	type TaskMetadata,
	type TaskEvents,
	type ProviderSettings,
	type TokenUsage,
	type ToolUsage,
	type ToolName,
	type ContextCondense,
	type ContextTruncation,
	type MirrorMessage,
	type MirrorSay,
	type MirrorAsk,
	type ToolProgressStatus,
	type HistoryItem,
	type CreateTaskOptions,
	type ModelInfo,
	type MirrorApiReqCancelReason,
	type MirrorApiReqInfo,
	type FileEditRecord,
	MirrorVSEventName,
	TaskStatus,
	TodoItem,
	getApiProtocol,
	getModelId,
	isRetiredProvider,
	QueuedMessage,
	DEFAULT_CONSECUTIVE_MISTAKE_LIMIT,
	DEFAULT_CHECKPOINT_TIMEOUT_SECONDS,
	MAX_CHECKPOINT_TIMEOUT_SECONDS,
	MIN_CHECKPOINT_TIMEOUT_SECONDS,
	MAX_MCP_TOOLS_THRESHOLD,
	countEnabledMcpTools,
} from "@mirror-vs/types"

// api
import { ApiHandler, ApiHandlerCreateMessageMetadata, buildApiHandler } from "../../api"
import { ApiStream, GroundingSource } from "../../api/transform/stream"
import { maybeRemoveImageBlocks } from "../../api/transform/image-cleaning"

// shared
import { findLastIndex } from "../../shared/array"
import { combineApiRequests } from "../../shared/combineApiRequests"
import { combineCommandSequences } from "../../shared/combineCommandSequences"
import { t } from "../../i18n"
import { getApiMetrics, hasTokenUsageChanged, hasToolUsageChanged } from "../../shared/getApiMetrics"
import { MirrorAskResponse } from "../../shared/WebviewMessage"
import { defaultModeSlug, getModeBySlug } from "../../shared/modes"
import { DiffStrategy, type ToolUse, type ToolParamName, toolParamNames } from "../../shared/tools"
import { getModelMaxOutputTokens } from "../../shared/api"

// services
import { McpHub } from "../../services/mcp/McpHub"
import { McpServerManager } from "../../services/mcp/McpServerManager"
import { RepoPerTaskCheckpointService } from "../../services/checkpoints"

// integrations
import { DiffViewProvider } from "../../integrations/editor/DiffViewProvider"
import { findToolName } from "../../integrations/misc/export-markdown"
import { MirrorTerminalProcess } from "../../integrations/terminal/types"
import { TerminalRegistry } from "../../integrations/terminal/TerminalRegistry"
import { OutputInterceptor } from "../../integrations/terminal/OutputInterceptor"

// utils
import { calculateApiCostAnthropic, calculateApiCostOpenAI } from "../../shared/cost"
import { getWorkspacePath } from "../../utils/path"
import { sanitizeToolUseId } from "../../utils/tool-id"
import { getTaskDirectoryPath } from "../../utils/storage"

// prompts
import { formatResponse } from "../prompts/responses"
import { SYSTEM_PROMPT } from "../prompts/system"
import { buildNativeToolsArrayWithRestrictions } from "./build-tools"

// core modules
import { ToolRepetitionDetector } from "../tools/ToolRepetitionDetector"
import { FileContextTracker } from "../context-tracking/FileContextTracker"
import { MirrorIgnoreController } from "../ignore/MirrorIgnoreController"
import { MirrorProtectedController } from "../protect/MirrorProtectedController"
import { type AssistantMessageContent, presentAssistantMessage } from "../assistant-message"
import { NativeToolCallParser } from "../assistant-message/NativeToolCallParser"
import { manageContext, willManageContext } from "../context-management"
import { MirrorProvider } from "../webview/MirrorProvider"
import { MultiSearchReplaceDiffStrategy } from "../diff/strategies/multi-search-replace"
import { type ApiMessage, readApiMessages } from "../task-persistence"
import { getEnvironmentDetails } from "../environment/getEnvironmentDetails"
import { checkContextWindowExceededError } from "../context/context-management/context-error-handling"
import {
	type CheckpointDiffOptions,
	type CheckpointRestoreOptions,
	getCheckpointService,
	checkpointSave,
	checkpointRestore,
	checkpointDiff,
} from "../checkpoints"
import { processUserContentMentions } from "../mentions/processUserContentMentions"
import { getMessagesSinceLastSummary, summarizeConversation, getEffectiveApiHistory } from "../condense"
import { MessageQueueService } from "../message-queue/MessageQueueService"
import { AutoApprovalHandler } from "../auto-approval"
import { MessageManager } from "../message-manager"
import { mergeConsecutiveApiMessages } from "./mergeConsecutiveApiMessages"
import { TaskConversationHistory } from "./TaskConversationHistory"
import { TaskMirrorMessages } from "./TaskMirrorMessages"
import { TaskUserInteraction } from "./TaskUserInteraction"
import { TaskLifecycle } from "./TaskLifecycle"
import { TaskMainLoop } from "./TaskMainLoop"
import { TaskApiRequest } from "./TaskApiRequest"
import { TaskContextManagement } from "./TaskContextManagement"
import { TaskToolTracking } from "./TaskToolTracking"
import { TaskGetters } from "./TaskGetters"
import { StruggleLedger } from "./TaskMainLoop"

const MAX_EXPONENTIAL_BACKOFF_SECONDS = 600 // 10 minutes
const DEFAULT_USAGE_COLLECTION_TIMEOUT_MS = 5000 // 5 seconds
const FORCED_CONTEXT_REDUCTION_PERCENT = 75 // Keep 75% of context (remove 25%) on context window errors
const MAX_CONTEXT_WINDOW_RETRIES = 3 // Maximum retries for context window errors

/**
 * Single source of truth for task lifecycle state.
 * Replaces scattered boolean checks (_aborted, _completed, etc.).
 */
export enum TaskState {
	Idle = "idle",
	Streaming = "streaming",
	WaitingApproval = "interactive",
	Completed = "completed",
	Error = "error",
	Aborted = "aborted",
}

export interface TaskOptions extends CreateTaskOptions {
	provider: MirrorProvider
	apiConfiguration: ProviderSettings
	enableCheckpoints?: boolean
	checkpointTimeout?: number
	consecutiveMistakeLimit?: number
	task?: string
	images?: string[]
	historyItem?: HistoryItem
	experiments?: Record<string, boolean>
	startTask?: boolean
	rootTask?: Task
	parentTask?: Task
	taskNumber?: number
	onCreated?: (task: Task) => void
	initialTodos?: TodoItem[]
	workspacePath?: string
	/** Initial status for the task's history item (e.g., "active" for child tasks) */
	initialStatus?: "active" | "delegated" | "completed"
}

export class Task extends EventEmitter<TaskEvents> implements TaskLike {
	readonly taskId: string
	readonly rootTaskId?: string
	readonly parentTaskId?: string
	childTaskId?: string
	pendingNewTaskToolCallId?: string

	/** Session grouping key. Tasks sharing the same sessionId appear as one session in history. */
	readonly sessionId?: string

	readonly instanceId: string
	readonly metadata: TaskMetadata

	todoList?: TodoItem[]

	/** In-between steering messages to inject directly into the ongoing agent loop. */
	public inBetweenMessages: { text: string; images?: string[] }[] = []

	readonly rootTask: Task | undefined = undefined
	readonly parentTask: Task | undefined = undefined
	readonly taskNumber: number
	readonly workspacePath: string

	/** Stable display title for tabs, set once on creation from task text. */
	public name?: string
	/** Timestamp of task creation — for deterministic tab ordering (createdAt ASC). */
	public readonly createdAt: number = Date.now()
	/** Monotonic timestamp updated on any activity (message sent, received, etc.). */
	public lastActivity: number = Date.now()
	/** Single source of truth for task lifecycle state. Replaces scattered boolean checks. */
	public state: TaskState = TaskState.Idle
	/** Flag indicating if a tool is actively executing (between approval and result). */
	public isExecutingTool = false

	/**
	 * The mode associated with this task. Persisted across sessions
	 * to maintain user context when reopening tasks from history.
	 *
	 * ## Lifecycle
	 *
	 * ### For new tasks:
	 * 1. Initially `undefined` during construction
	 * 2. Asynchronously initialized from provider state via `initializeTaskMode()`
	 * 3. Falls back to `defaultModeSlug` if provider state is unavailable
	 *
	 * ### For history items:
	 * 1. Immediately set from `historyItem.mode` during construction
	 * 2. Falls back to `defaultModeSlug` if mode is not stored in history
	 *
	 * ## Important
	 * This property should NOT be accessed directly until `taskModeReady` promise resolves.
	 * Use `getTaskMode()` for async access or `taskMode` getter for sync access after initialization.
	 *
	 * @private
	 * @see {@link getTaskMode} - For safe async access
	 * @see {@link taskMode} - For sync access after initialization
	 * @see {@link waitForModeInitialization} - To ensure initialization is complete
	 * @internal
	 */
	/** @internal */
	_taskMode: string | undefined

	/**
	 * Promise that resolves when the task mode has been initialized.
	 * This ensures async mode initialization completes before the task is used.
	 *
	 * ## Purpose
	 * - Prevents race conditions when accessing task mode
	 * - Ensures provider state is properly loaded before mode-dependent operations
	 * - Provides a synchronization point for async initialization
	 *
	 * ## Resolution timing
	 * - For history items: Resolves immediately (sync initialization)
	 * - For new tasks: Resolves after provider state is fetched (async initialization)
	 *
	 * @private
	 * @see {@link waitForModeInitialization} - Public method to await this promise
	 */
	private taskModeReady: Promise<void>

	/**
	 * The API configuration name (provider profile) associated with this task.
	 * Persisted across sessions to maintain the provider profile when reopening tasks from history.
	 *
	 * ## Lifecycle
	 *
	 * ### For new tasks:
	 * 1. Initially `undefined` during construction
	 * 2. Asynchronously initialized from provider state via `initializeTaskApiConfigName()`
	 * 3. Falls back to "default" if provider state is unavailable
	 *
	 * ### For history items:
	 * 1. Immediately set from `historyItem.apiConfigName` during construction
	 * 2. Falls back to undefined if not stored in history (for backward compatibility)
	 *
	 * ## Important
	 * If you need a non-`undefined` provider profile (e.g., for profile-dependent operations),
	 * wait for `taskApiConfigReady` first (or use `getTaskApiConfigName()`).
	 * The sync `taskApiConfigName` getter may return `undefined` for backward compatibility.
	 *
	 * @private
	 * @see {@link getTaskApiConfigName} - For safe async access
	 * @see {@link taskApiConfigName} - For sync access after initialization
	 * @internal
	 */
	/** @internal */
	_taskApiConfigName: string | undefined

	/**
	 * Promise that resolves when the task API config name has been initialized.
	 * This ensures async API config name initialization completes before the task is used.
	 *
	 * ## Purpose
	 * - Prevents race conditions when accessing task API config name
	 * - Ensures provider state is properly loaded before profile-dependent operations
	 * - Provides a synchronization point for async initialization
	 *
	 * ## Resolution timing
	 * - For history items: Resolves immediately (sync initialization)
	 * - For new tasks: Resolves after provider state is fetched (async initialization)
	 *
	 * @private
	 * @internal
	 */
	/** @internal */
	taskApiConfigReady: Promise<void>

	providerRef: WeakRef<MirrorProvider>
	/** @internal */
	readonly globalStoragePath: string
	abort: boolean = false
	currentRequestAbortController?: AbortController
	skipPrevResponseIdOnce: boolean = false

	// TaskStatus
	idleAsk?: MirrorMessage
	resumableAsk?: MirrorMessage
	interactiveAsk?: MirrorMessage

	didFinishAbortingStream = false
	abandoned = false
	abortReason?: MirrorApiReqCancelReason
	isInitialized = false
	isPaused: boolean = false

	// API
	apiConfiguration: ProviderSettings
	api: ApiHandler
	/** @internal */
	static lastGlobalApiRequestTime?: number
	/** @internal */
	autoApprovalHandler: AutoApprovalHandler

	/**
	 * Serialization gate for concurrent provider requests across ALL tasks/tabs.
	 *
	 * When 2-3 tabs run simultaneously, every tab would otherwise transmit its
	 * streaming request at the same instant, tripping the provider's overload
	 * protection (Anthropic HTTP 529 "overloaded_error" → "The provider couldn't
	 * process the request as made."). This promise-chain mutex lets only one tab
	 * transmit at a time; the slot is released once the provider accepts the
	 * request (first chunk arrives) or the request fails, so other tabs queue up
	 * instead of firing together.
	 * @internal
	 */
	static globalRequestGate: Promise<void> = Promise.resolve()

	/**
	 * Acquire the global request gate. Resolves with a `release` function once
	 * it is this caller's turn to transmit. Callers MUST call `release` exactly
	 * once (in both the success and failure paths) to avoid deadlocking the gate.
	 * @internal
	 */
	static acquireGlobalRequestGate(): Promise<() => void> {
		const previous = Task.globalRequestGate
		let release!: () => void
		Task.globalRequestGate = new Promise<void>((resolve) => {
			release = resolve
		})
		return previous.then(async () => {
			// Enforce a minimum 350ms stagger delay between consecutive request transmissions
			// to avoid tripping provider rate limits on concurrent parallel tab bursts.
			const STAGGER_MS = 350
			const now = performance.now()
			if (Task.lastGlobalApiRequestTime) {
				const elapsed = now - Task.lastGlobalApiRequestTime
				if (elapsed < STAGGER_MS) {
					await new Promise((r) => setTimeout(r, STAGGER_MS - elapsed))
				}
			}
			Task.lastGlobalApiRequestTime = performance.now()
			return release
		})
	}

	/**
	 * Reset the global request gate. This should only be used for testing.
	 * @internal
	 */
	static resetGlobalRequestGate(): void {
		Task.globalRequestGate = Promise.resolve()
	}

	/**
	 * Reset the global API request timestamp. This should only be used for testing.
	 * @internal
	 */
	static resetGlobalApiRequestTime(): void {
		Task.lastGlobalApiRequestTime = undefined
	}

	toolRepetitionDetector: ToolRepetitionDetector
	mirrorIgnoreController?: MirrorIgnoreController
	mirrorProtectedController?: MirrorProtectedController
	fileContextTracker: FileContextTracker
	terminalProcess?: MirrorTerminalProcess

	// Editing
	diffViewProvider: DiffViewProvider
	diffStrategy?: DiffStrategy
	didEditFile: boolean = false

	// LLM Messages & Chat Messages
	apiConversationHistory: ApiMessage[] = []
	mirrorMessages: MirrorMessage[] = []

	/**
	 * Local-only edit history. Populated by presentAssistantMessage whenever an
	 * edit tool (apply_diff, write_to_file, etc.) succeeds. Persisted to disk
	 * alongside mirrorMessages. NEVER sent to the LLM — kept purely for frontend
	 * display and revert (FileChangesPanel).
	 *
	 * @see FileEditRecord
	 * @see presentAssistantMessage.ts — population hook
	 * @see MirrorProviderState — inclusion in ExtensionState
	 */
	fileEdits: FileEditRecord[] = []

	// Extracted managers
	readonly conversationHistory!: TaskConversationHistory
	readonly mirrorMessagesManager!: TaskMirrorMessages
	readonly userInteractionManager!: TaskUserInteraction
	readonly lifecycleManager!: TaskLifecycle
	readonly mainLoopManager!: TaskMainLoop
	readonly apiRequestManager!: TaskApiRequest
	readonly contextManager!: TaskContextManagement
	readonly toolTrackingManager!: TaskToolTracking
	readonly getters!: TaskGetters

	// Ask
	/** @internal */
	askResponse?: MirrorAskResponse
	/** @internal */
	askResponseText?: string
	/** @internal */
	askResponseImages?: string[]
	public lastMessageTs?: number
	/** @internal */
	autoApprovalTimeoutRef?: NodeJS.Timeout

	// Tool Use
	consecutiveMistakeCount: number = 0
	consecutiveMistakeLimit: number
	consecutiveMistakeCountForApplyDiff: Map<string, number> = new Map()
	consecutiveMistakeCountForEditFile: Map<string, number> = new Map()
	consecutiveNoToolUseCount: number = 0
	consecutiveNoAssistantMessagesCount: number = 0
	toolUsage: ToolUsage = {}

	// Struggle Ledger — tracks repeated failure patterns for auto-recovery
	/** @internal */
	struggleLedger: StruggleLedger = new StruggleLedger()

	// Checkpoints
	enableCheckpoints: boolean
	checkpointTimeout: number
	checkpointService?: RepoPerTaskCheckpointService
	checkpointServiceInitializing = false

	// Message Queue Service
	public readonly messageQueueService: MessageQueueService
	/** @internal */
	messageQueueStateChangedHandler: (() => void) | undefined

	// Streaming
	isWaitingForFirstChunk = false
	isStreaming = false
	isLoopActive = false
	currentStreamingContentIndex = 0
	currentStreamingDidCheckpoint = false
	assistantMessageContent: AssistantMessageContent[] = []
	presentAssistantMessageLocked = false
	presentAssistantMessageHasPendingUpdates = false
	userMessageContent: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam | Anthropic.ToolResultBlockParam)[] = []
	userMessageContentReady = false

	/**
	 * Flag indicating whether the assistant message for the current streaming session
	 * has been saved to API conversation history.
	 *
	 * This is critical for parallel tool calling: tools should NOT execute until
	 * the assistant message is saved. Otherwise, if a tool like `new_task` triggers
	 * `flushPendingToolResultsToHistory()`, the user message with tool_results would
	 * appear BEFORE the assistant message with tool_uses, causing API errors.
	 *
	 * Reset to `false` at the start of each API request.
	 * Set to `true` after the assistant message is saved in `recursivelyMakeMirrorRequests`.
	 */
	assistantMessageSavedToHistory = false

	public pushToolResultToUserContent(toolResult: Anthropic.ToolResultBlockParam): boolean {
		return this.toolTrackingManager.pushToolResultToUserContent(toolResult)
	}
	didRejectTool = false
	didAlreadyUseTool = false
	didToolFailInCurrentTurn = false
	didCompleteReadingStream = false
	/** @internal */
	_started = false
	// Re-entrant guard for tryDrainQueuedMessage()
	/** @internal */
	_draining = false
	// No streaming parser is required.
	assistantMessageParser?: undefined
	/** @internal */
	providerProfileChangeListener?: (config: { name: string; provider?: string }) => void

	// Native tool call streaming state (track which index each tool is at)
	/** @internal */
	streamingToolCallIndices: Map<string, number> = new Map()

	// Cached model info for current streaming session (set at start of each API request)
	// This prevents excessive getModel() calls during tool execution
	cachedStreamingModel?: { id: string; info: ModelInfo }

	// Token Usage Cache
	/** @internal */
	tokenUsageSnapshot?: TokenUsage
	/** @internal */
	tokenUsageSnapshotAt?: number

	// Tool Usage Cache
	private toolUsageSnapshot?: ToolUsage

	// Token Usage Throttling - Debounced emit function
	private readonly TOKEN_USAGE_EMIT_INTERVAL_MS = 2000 // 2 seconds
	/** @internal */
	debouncedEmitTokenUsage: ReturnType<typeof debounce>

	// Cloud Sync Tracking
	// Initial status for the task's history item (set at creation time to avoid race conditions)
	/** @internal */
	readonly initialStatus?: "active" | "delegated" | "completed"
	readonly historyItem?: HistoryItem

	// MessageManager for high-level message operations (lazy initialized)
	/** @internal */
	_messageManager?: MessageManager

	constructor({
		provider,
		apiConfiguration,
		enableCheckpoints = true,
		checkpointTimeout = DEFAULT_CHECKPOINT_TIMEOUT_SECONDS,
		consecutiveMistakeLimit = DEFAULT_CONSECUTIVE_MISTAKE_LIMIT,
		taskId,
		task,
		images,
		historyItem,
		experiments: experimentsConfig,
		startTask = true,
		rootTask,
		parentTask,
		taskNumber = -1,
		onCreated,
		initialTodos,
		workspacePath,
		initialStatus,
		sessionId,
	}: TaskOptions) {
		super()
		this.conversationHistory = new TaskConversationHistory(this)
		this.mirrorMessagesManager = new TaskMirrorMessages(this)
		this.userInteractionManager = new TaskUserInteraction(this)
		this.lifecycleManager = new TaskLifecycle(this)
		this.mainLoopManager = new TaskMainLoop(this)
		this.apiRequestManager = new TaskApiRequest(this)
		this.contextManager = new TaskContextManagement(this)
		this.toolTrackingManager = new TaskToolTracking(this)
		this.getters = new TaskGetters(this)
		this.providerRef = new WeakRef(provider)

		if (startTask && !task && !images && !historyItem) {
			throw new Error("Either historyItem or task/images must be provided")
		}

		if (
			!checkpointTimeout ||
			checkpointTimeout > MAX_CHECKPOINT_TIMEOUT_SECONDS ||
			checkpointTimeout < MIN_CHECKPOINT_TIMEOUT_SECONDS
		) {
			throw new Error(
				"checkpointTimeout must be between " +
					MIN_CHECKPOINT_TIMEOUT_SECONDS +
					" and " +
					MAX_CHECKPOINT_TIMEOUT_SECONDS +
					" seconds",
			)
		}

		this.historyItem = historyItem
		this.taskId = historyItem ? historyItem.id : (taskId ?? uuidv7())
		this.rootTaskId = historyItem ? historyItem.rootTaskId : rootTask?.taskId
		this.parentTaskId = historyItem ? historyItem.parentTaskId : parentTask?.taskId
		this.childTaskId = undefined
		this.sessionId = historyItem ? historyItem.sessionId : sessionId

		this.metadata = {
			task: historyItem ? historyItem.task : task,
			images: historyItem ? [] : images,
		}

		// Normal use-case is usually retry similar history task with new workspace.
		this.workspacePath = parentTask
			? parentTask.workspacePath
			: (workspacePath ?? getWorkspacePath(path.join(os.homedir(), "Desktop")))

		this.instanceId = crypto.randomUUID().slice(0, 8)
		this.taskNumber = -1

		this.mirrorIgnoreController = new MirrorIgnoreController(this.cwd)
		this.mirrorProtectedController = new MirrorProtectedController(this.cwd)
		this.fileContextTracker = new FileContextTracker(provider, this.taskId)

		this.mirrorIgnoreController.initialize().catch((error) => {
			console.error("Failed to initialize MirrorIgnoreController:", error)
		})

		this.apiConfiguration = apiConfiguration
		this.api = buildApiHandler(this.apiConfiguration)
		this.autoApprovalHandler = new AutoApprovalHandler()

		this.consecutiveMistakeLimit = consecutiveMistakeLimit ?? DEFAULT_CONSECUTIVE_MISTAKE_LIMIT
		this.providerRef = new WeakRef(provider)
		this.globalStoragePath = provider.context.globalStorageUri.fsPath
		this.diffViewProvider = new DiffViewProvider(this.cwd, this)
		this.enableCheckpoints = enableCheckpoints
		this.checkpointTimeout = checkpointTimeout

		this.parentTask = parentTask
		this.taskNumber = taskNumber
		this.initialStatus = initialStatus

		this.assistantMessageParser = undefined

		this.messageQueueService = new MessageQueueService()

		this.messageQueueStateChangedHandler = () => {
			this.emit(MirrorVSEventName.TaskUserMessage, this.taskId)
			this.emit(MirrorVSEventName.QueuedMessagesUpdated, this.taskId, this.messageQueueService.messages)
			this.providerRef.deref()?.postStateToWebviewWithoutTaskHistory()

			// Auto-drain: if a queued message arrives while the task is
			// blocked on a text-accepting ask (e.g. followup, tool,
			// completion_result, resume_task), consume it immediately
			// instead of waiting for the user to respond.
			this.tryDrainQueuedMessage()
		}

		this.messageQueueService.on("stateChanged", this.messageQueueStateChangedHandler)

		// Listen for provider profile changes to update parser state
		this.setupProviderProfileChangeListener(provider)

		// Set up diff strategy
		this.diffStrategy = new MultiSearchReplaceDiffStrategy()

		this.toolRepetitionDetector = new ToolRepetitionDetector(this.consecutiveMistakeLimit)

		// Initialize todo list if provided
		if (initialTodos && initialTodos.length > 0) {
			this.todoList = initialTodos
		}

		// Initialize debounced token usage emit function
		// Uses debounce with maxWait to achieve throttle-like behavior:
		// - leading: true  - Emit immediately on first call
		// - trailing: true - Emit final state when updates stop
		// - maxWait        - Ensures at most one emit per interval during rapid updates (throttle behavior)
		this.debouncedEmitTokenUsage = debounce(
			(tokenUsage: TokenUsage, toolUsage: ToolUsage) => {
				const tokenChanged = hasTokenUsageChanged(tokenUsage, this.tokenUsageSnapshot)
				const toolChanged = hasToolUsageChanged(toolUsage, this.toolUsageSnapshot)

				if (tokenChanged || toolChanged) {
					this.emit(MirrorVSEventName.TaskTokenUsageUpdated, this.taskId, tokenUsage, toolUsage)
					this.tokenUsageSnapshot = tokenUsage
					this.tokenUsageSnapshotAt = this.mirrorMessages.at(-1)?.ts
					// Deep copy tool usage for snapshot
					this.toolUsageSnapshot = JSON.parse(JSON.stringify(toolUsage))
				}
			},
			this.TOKEN_USAGE_EMIT_INTERVAL_MS,
			{ leading: true, trailing: true, maxWait: this.TOKEN_USAGE_EMIT_INTERVAL_MS },
		)

		if (historyItem) {
			this._taskMode = historyItem.mode || defaultModeSlug
			this._taskApiConfigName = historyItem.apiConfigName
			this.taskModeReady = Promise.resolve()
			this.taskApiConfigReady = Promise.resolve()
		} else {
			this._taskMode = undefined
			this._taskApiConfigName = undefined
			this.taskModeReady = this.initializeTaskMode(provider)
			this.taskApiConfigReady = this.initializeTaskApiConfigName(provider)
		}

		onCreated?.(this)

		if (startTask) {
			this._started = true
			if (task || images) {
				this.lifecycleManager.startTask(task, images)
			} else if (historyItem) {
				this.lifecycleManager.resumeTaskFromHistory()
			} else {
				throw new Error("Either historyItem or task/images must be provided")
			}
		}
	}

	public async loadSavedMessagesOnly(): Promise<void> {
		return this.lifecycleManager.loadSavedMessagesOnly()
	}

	/**
	 * Initialize the task mode from the provider state.
	 * This method handles async initialization with proper error handling.
	 *
	 * ## Flow
	 * 1. Attempts to fetch the current mode from provider state
	 * 2. Sets `_taskMode` to the fetched mode or `defaultModeSlug` if unavailable
	 * 3. Handles errors gracefully by falling back to default mode
	 * 4. Logs any initialization errors for debugging
	 *
	 * ## Error handling
	 * - Network failures when fetching provider state
	 * - Provider not yet initialized
	 * - Invalid state structure
	 *
	 * All errors result in fallback to `defaultModeSlug` to ensure task can proceed.
	 *
	 * @private
	 * @param provider - The MirrorProvider instance to fetch state from
	 * @returns Promise that resolves when initialization is complete
	 */
	private async initializeTaskMode(provider: MirrorProvider): Promise<void> {
		try {
			const state = await provider.getState()
			this._taskMode = state?.mode || defaultModeSlug
		} catch (error) {
			// If there's an error getting state, use the default mode
			this._taskMode = defaultModeSlug
			// Use the provider's log method for better error visibility
			const errorMessage = `Failed to initialize task mode: ${error instanceof Error ? error.message : String(error)}`
			provider.log(errorMessage)
		}
	}

	/**
	 * Initialize the task API config name from the provider state.
	 * This method handles async initialization with proper error handling.
	 *
	 * ## Flow
	 * 1. Attempts to fetch the current API config name from provider state
	 * 2. Sets `_taskApiConfigName` to the fetched name or "default" if unavailable
	 * 3. Handles errors gracefully by falling back to "default"
	 * 4. Logs any initialization errors for debugging
	 *
	 * ## Error handling
	 * - Network failures when fetching provider state
	 * - Provider not yet initialized
	 * - Invalid state structure
	 *
	 * All errors result in fallback to "default" to ensure task can proceed.
	 *
	 * @private
	 * @param provider - The MirrorProvider instance to fetch state from
	 * @returns Promise that resolves when initialization is complete
	 */
	private async initializeTaskApiConfigName(provider: MirrorProvider): Promise<void> {
		try {
			const state = await provider.getState()

			// Avoid clobbering a newer value that may have been set while awaiting provider state
			// (e.g., user switches provider profile immediately after task creation).
			if (this._taskApiConfigName === undefined) {
				this._taskApiConfigName = state?.currentApiConfigName ?? "default"
			}
		} catch (error) {
			// If there's an error getting state, use the default profile (unless a newer value was set).
			if (this._taskApiConfigName === undefined) {
				this._taskApiConfigName = "default"
			}
			// Use the provider's log method for better error visibility
			const errorMessage = `Failed to initialize task API config name: ${error instanceof Error ? error.message : String(error)}`
			provider.log(errorMessage)
		}
	}

	/**
	 * Sets up a listener for provider profile changes.
	 *
	 * @private
	 * @param provider - The MirrorProvider instance to listen to
	 */
	private setupProviderProfileChangeListener(provider: MirrorProvider): void {
		// Only set up listener if provider has the on method (may not exist in test mocks)
		if (typeof provider.on !== "function") {
			return
		}

		this.providerProfileChangeListener = async () => {
			try {
				const newState = await provider.getState()
				if (newState?.apiConfiguration) {
					this.updateApiConfiguration(newState.apiConfiguration)
				}
			} catch (error) {
				console.error(
					`[Task#${this.taskId}.${this.instanceId}] Failed to update API configuration on profile change:`,
					error,
				)
			}
		}

		provider.on(MirrorVSEventName.ProviderProfileChanged, this.providerProfileChangeListener)
	}

	/**
	 * Wait for the task mode to be initialized before proceeding.
	 * This method ensures that any operations depending on the task mode
	 * will have access to the correct mode value.
	 *
	 * ## When to use
	 * - Before accessing mode-specific configurations
	 * - When switching between tasks with different modes
	 * - Before operations that depend on mode-based permissions
	 *
	 * ## Example usage
	 * ```typescript
	 * // Wait for mode initialization before mode-dependent operations
	 * await task.waitForModeInitialization();
	 * const mode = task.taskMode; // Now safe to access synchronously
	 *
	 * // Or use with getTaskMode() for a one-liner
	 * const mode = await task.getTaskMode(); // Internally waits for initialization
	 * ```
	 *
	 * @returns Promise that resolves when the task mode is initialized
	 * @public
	 */
	public async waitForModeInitialization(): Promise<void> {
		return this.taskModeReady
	}

	/**
	 * Get the task mode asynchronously, ensuring it's properly initialized.
	 * This is the recommended way to access the task mode as it guarantees
	 * the mode is available before returning.
	 *
	 * ## Async behavior
	 * - Internally waits for `taskModeReady` promise to resolve
	 * - Returns the initialized mode or `defaultModeSlug` as fallback
	 * - Safe to call multiple times - subsequent calls return immediately if already initialized
	 *
	 * ## Example usage
	 * ```typescript
	 * // Safe async access
	 * const mode = await task.getTaskMode();
	 * console.log(`Task is running in ${mode} mode`);
	 *
	 * // Use in conditional logic
	 * if (await task.getTaskMode() === 'architect') {
	 *   // Perform architect-specific operations
	 * }
	 * ```
	 *
	 * @returns Promise resolving to the task mode string
	 * @public
	 */
	public async getTaskMode(): Promise<string> {
		await this.taskModeReady
		return this._taskMode || defaultModeSlug
	}

	/**
	 * Get the task mode synchronously. This should only be used when you're certain
	 * that the mode has already been initialized (e.g., after waitForModeInitialization).
	 *
	 * ## When to use
	 * - In synchronous contexts where async/await is not available
	 * - After explicitly waiting for initialization via `waitForModeInitialization()`
	 * - In event handlers or callbacks where mode is guaranteed to be initialized
	 *
	 * ## Example usage
	 * ```typescript
	 * // After ensuring initialization
	 * await task.waitForModeInitialization();
	 * const mode = task.taskMode; // Safe synchronous access
	 *
	 * // In an event handler after task is started
	 * task.on('taskStarted', () => {
	 *   console.log(`Task started in ${task.taskMode} mode`); // Safe here
	 * });
	 * ```
	 *
	 * @throws {Error} If the mode hasn't been initialized yet
	 * @returns The task mode string
	 * @public
	 */
	public get taskMode(): string {
		if (this._taskMode === undefined) {
			throw new Error("Task mode accessed before initialization. Use getTaskMode() or wait for taskModeReady.")
		}

		return this._taskMode
	}

	/**
	 * Wait for the task API config name to be initialized before proceeding.
	 * This method ensures that any operations depending on the task's provider profile
	 * will have access to the correct value.
	 *
	 * ## When to use
	 * - Before accessing provider profile-specific configurations
	 * - When switching between tasks with different provider profiles
	 * - Before operations that depend on the provider profile
	 *
	 * @returns Promise that resolves when the task API config name is initialized
	 * @public
	 */
	public async waitForApiConfigInitialization(): Promise<void> {
		return this.taskApiConfigReady
	}

	/**
	 * Get the task API config name asynchronously, ensuring it's properly initialized.
	 * This is the recommended way to access the task's provider profile as it guarantees
	 * the value is available before returning.
	 *
	 * ## Async behavior
	 * - Internally waits for `taskApiConfigReady` promise to resolve
	 * - Returns the initialized API config name or undefined as fallback
	 * - Safe to call multiple times - subsequent calls return immediately if already initialized
	 *
	 * @returns Promise resolving to the task API config name string or undefined
	 * @public
	 */
	public async getTaskApiConfigName(): Promise<string | undefined> {
		await this.taskApiConfigReady
		return this._taskApiConfigName
	}

	/**
	 * Get the task API config name synchronously. This should only be used when you're certain
	 * that the value has already been initialized (e.g., after waitForApiConfigInitialization).
	 *
	 * ## When to use
	 * - In synchronous contexts where async/await is not available
	 * - After explicitly waiting for initialization via `waitForApiConfigInitialization()`
	 * - In event handlers or callbacks where API config name is guaranteed to be initialized
	 *
	 * Note: Unlike taskMode, this getter does not throw if uninitialized since the API config
	 * name can legitimately be undefined (backward compatibility with tasks created before
	 * this feature was added).
	 *
	 * @returns The task API config name string or undefined
	 * @public
	 */
	public get taskApiConfigName(): string | undefined {
		return this._taskApiConfigName
	}

	/**
	 * Update the task's API config name. This is called when the user switches
	 * provider profiles while a task is active, allowing the task to remember
	 * its new provider profile.
	 *
	 * @param apiConfigName - The new API config name to set
	 * @internal
	 */
	public setTaskApiConfigName(apiConfigName: string | undefined): void {
		this._taskApiConfigName = apiConfigName
	}

	static create(options: TaskOptions): [Task, Promise<void>] {
		const instance = new Task({ ...options, startTask: false })
		const { images, task, historyItem } = options
		let promise

		if (images || task) {
			promise = instance.lifecycleManager.startTask(task, images)
		} else if (historyItem) {
			promise = instance.lifecycleManager.resumeTaskFromHistory()
		} else {
			throw new Error("Either historyItem or task/images must be provided")
		}

		return [instance, promise]
	}

	// API Messages

	private async getSavedApiConversationHistory(): Promise<ApiMessage[]> {
		return readApiMessages({ taskId: this.taskId, globalStoragePath: this.globalStoragePath })
	}

	private async addToApiConversationHistory(message: Anthropic.MessageParam, reasoning?: string) {
		return this.conversationHistory.addToApiConversationHistory(message, reasoning)
	}

	// NOTE: We intentionally do NOT mutate stored messages to merge consecutive user turns.
	// For API requests, consecutive same-role messages are merged via mergeConsecutiveApiMessages()
	// so rewind/edit behavior can still reference original message boundaries.

	async overwriteApiConversationHistory(newHistory: ApiMessage[]) {
		return this.conversationHistory.overwriteApiConversationHistory(newHistory)
	}

	/**
	 * Flush any pending tool results to the API conversation history.
	 *
	 * This is critical when the task is about to be
	 * delegated (e.g., via new_task). Before delegation, if other tools were
	 * called in the same turn before new_task, their tool_result blocks are
	 * accumulated in `userMessageContent` but haven't been saved to the API
	 * history yet. If we don't flush them before the parent is disposed,
	 * the API conversation will be incomplete and cause 400 errors when
	 * the parent resumes (missing tool_result for tool_use blocks).
	 *
	 * NOTE: The assistant message is typically already in history by the time
	 * tools execute (added in recursivelyMakeMirrorRequests after streaming completes).
	 * So we usually only need to flush the pending user message with tool_results.
	 */
	public async flushPendingToolResultsToHistory(): Promise<boolean> {
		return this.conversationHistory.flushPendingToolResultsToHistory()
	}

	private async saveApiConversationHistory(): Promise<boolean> {
		return this.conversationHistory.saveApiConversationHistory()
	}

	/**
	 * Public wrapper to retry saving the API conversation history.
	 * Uses exponential backoff: up to 3 attempts with delays of 100 ms, 500 ms, 1500 ms.
	 * Used by delegation flow when flushPendingToolResultsToHistory reports failure.
	 */
	public async retrySaveApiConversationHistory(): Promise<boolean> {
		return this.conversationHistory.retrySaveApiConversationHistory()
	}

	// Mirror Messages

	private async getSavedMirrorMessages(): Promise<MirrorMessage[]> {
		return this.mirrorMessagesManager.getSavedMirrorMessages()
	}

	private async addToMirrorMessages(message: MirrorMessage) {
		await this.mirrorMessagesManager.addToMirrorMessages(message)
	}

	public async overwriteMirrorMessages(newMessages: MirrorMessage[]) {
		await this.mirrorMessagesManager.overwriteMirrorMessages(newMessages)
	}

	private async updateMirrorMessage(message: MirrorMessage) {
		await this.mirrorMessagesManager.updateMirrorMessage(message)
	}

	public async saveMirrorMessages(): Promise<boolean> {
		return this.mirrorMessagesManager.saveMirrorMessages()
	}

	private findMessageByTimestamp(ts: number): MirrorMessage | undefined {
		return this.mirrorMessagesManager.findMessageByTimestamp(ts)
	}

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
		return this.userInteractionManager.ask(type, text, partial, progressStatus, isProtected)
	}

	public handleWebviewAskResponse(askResponse: MirrorAskResponse, text?: string, images?: string[]) {
		return this.userInteractionManager.handleWebviewAskResponse(askResponse, text, images)
	}

	/**
	 * Injects an urgent steering message directly into the active loop.
	 * If the task is waiting on an ask, it immediately answers it;
	 * otherwise, the message is queued to be included in the very next model iteration.
	 */
	public async injectInBetweenMessage(
		text: string,
		images?: string[],
		sayType: "user_feedback" | "terminal_callback" = "user_feedback",
	): Promise<void> {
		this.inBetweenMessages.push({ text, images })

		// If the task is currently waiting on an ask (askResponse is undefined),
		// answer it immediately so the waiting ask promise unblocks.
		const wasWaitingOnAsk = this.askResponse === undefined
		if (wasWaitingOnAsk) {
			this.userInteractionManager.handleWebviewAskResponse("messageResponse", text, images)
		}

		await this.say(sayType as any, text, images)

		// If a terminal command is actively running in the foreground, interrupt/continue it
		// so the loop immediately yields back to the model with this steering message.
		if (this.terminalProcess) {
			try {
				this.terminalProcess.continue()
			} catch (e) {
				console.error("[Task#injectInBetweenMessage] Failed to continue terminalProcess:", e)
			}
		}

		// If the task loop is not currently running (and wasn't just unblocked via askResponse),
		// reactivate initiateTaskLoop so the model immediately receives and acts on the user's steering message.
		if (!this.isLoopActive && !this.abort && this._started && !wasWaitingOnAsk) {
			const { formatResponse } = await import("../prompts/responses")
			const imageBlocks = formatResponse.imageBlocks(images)
			const userContent = [
				{ type: "text" as const, text: `<user_message>\n${text}\n</user_message>` },
				...imageBlocks,
			]
			void this.initiateTaskLoop(userContent)
		}
	}

	/**
	 * Cancel any pending auto-approval timeout.
	 * Called when user interacts (types, clicks buttons, etc.) to prevent the timeout from firing.
	 */
	public cancelAutoApprovalTimeout(): void {
		return this.userInteractionManager.cancelAutoApprovalTimeout()
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
		return this.userInteractionManager.tryDrainQueuedMessage()
	}

	public approveAsk({ text, images }: { text?: string; images?: string[] } = {}) {
		return this.userInteractionManager.approveAsk({ text, images })
	}

	public denyAsk({ text, images }: { text?: string; images?: string[] } = {}) {
		return this.userInteractionManager.denyAsk({ text, images })
	}

	public supersedePendingAsk(): void {
		return this.userInteractionManager.supersedePendingAsk()
	}

	/**
	 * Updates the API configuration and rebuilds the API handler.
	 * There is no tool-protocol switching or tool parser swapping.
	 *
	 * @param newApiConfiguration - The new API configuration to use
	 */
	public updateApiConfiguration(newApiConfiguration: ProviderSettings): void {
		return this.userInteractionManager.updateApiConfiguration(newApiConfiguration)
	}

	public async submitUserMessage(
		text: string,
		images?: string[],
		mode?: string,
		providerProfile?: string,
	): Promise<void> {
		return this.userInteractionManager.submitUserMessage(text, images, mode, providerProfile)
	}

	async handleTerminalOperation(terminalOperation: "continue" | "abort") {
		return this.userInteractionManager.handleTerminalOperation(terminalOperation)
	}

	/** @internal */
	async getFilesReadByMirrorSafely(context: string): Promise<string[] | undefined> {
		try {
			return await this.fileContextTracker.getFilesReadByMirror()
		} catch (error) {
			console.error(`[Task#${context}] Failed to get files read by Mirror VS:`, error)
			return undefined
		}
	}

	public async condenseContext(): Promise<void> {
		return this.contextManager.condenseContext()
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
		return this.userInteractionManager.say(
			type,
			text,
			images,
			partial,
			checkpoint,
			progressStatus,
			options,
			contextCondense,
			contextTruncation,
		)
	}

	async sayAndCreateMissingParamError(toolName: ToolName, paramName: string, relPath?: string) {
		return this.userInteractionManager.sayAndCreateMissingParamError(toolName, paramName, relPath)
	}

	// Lifecycle
	// Start / Resume / Abort / Dispose

	/**
	 * Get enabled MCP tools count for this task.
	 * Returns the count along with the number of servers contributing.
	 *
	 * @returns Object with enabledToolCount and enabledServerCount
	 */
	private async getEnabledMcpToolsCount(): Promise<{ enabledToolCount: number; enabledServerCount: number }> {
		try {
			const provider = this.providerRef.deref()
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
		return this.lifecycleManager.start()
	}

	/**
	 * Start an idle task (created via "+" button with no content) with user
	 * text and images.  This is the public entry point for the
	 * "sub-session" flow — clicking "+" creates an empty idle tab, and
	 * typing + sending in that tab starts its AI loop.
	 */
	public async startWithContent(text?: string, images?: string[]): Promise<void> {
		this._started = true
		return this.lifecycleManager.startTask(text, images)
	}

	/**
	 * Starts or resumes a restored task when it is focused or selected in the UI.
	 * If the task has not been started yet, this triggers resumeTaskFromHistory()
	 * to show the Resume banner and wait for user messages without queueing.
	 */
	public async startRestoredTask(): Promise<void> {
		if (this._started) {
			return
		}
		this._started = true
		await this.lifecycleManager.resumeTaskFromHistory()
	}

	private async startTask(task?: string, images?: string[]): Promise<void> {
		return this.lifecycleManager.startTask(task, images)
	}

	private async resumeTaskFromHistory() {
		return this.lifecycleManager.resumeTaskFromHistory()
	}

	/**
	 * Cancels the current HTTP request if one is in progress.
	 * This immediately aborts the underlying stream rather than waiting for the next chunk.
	 */
	public cancelCurrentRequest(): void {
		return this.lifecycleManager.cancelCurrentRequest()
	}

	/**
	 * Force emit a final token usage update, ignoring throttle.
	 * Called before task completion or abort to ensure final stats are captured.
	 * Triggers the debounce with current values and immediately flushes to ensure emit.
	 */
	public emitFinalTokenUsageUpdate(): void {
		return this.lifecycleManager.emitFinalTokenUsageUpdate()
	}

	public async abortTask(isAbandoned = false) {
		return this.lifecycleManager.abortTask(isAbandoned)
	}

	public dispose(): void {
		return this.lifecycleManager.dispose()
	}

	// Subtasks
	// Spawn / Wait / Complete

	public async startSubtask(message: string, initialTodos: TodoItem[], mode: string) {
		return this.lifecycleManager.startSubtask(message, initialTodos, mode)
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
		return this.lifecycleManager.resumeAfterDelegation()
	}

	// Task Loop

	/** @internal */
	async initiateTaskLoop(userContent: Anthropic.Messages.ContentBlockParam[]): Promise<void> {
		return this.mainLoopManager.initiateTaskLoop(userContent)
	}

	public async recursivelyMakeMirrorRequests(
		userContent: Anthropic.Messages.ContentBlockParam[],
		includeFileDetails: boolean = false,
	): Promise<boolean> {
		return this.mainLoopManager.recursivelyMakeMirrorRequests(userContent, includeFileDetails)
	}

	/** @internal */
	async getSystemPrompt(): Promise<string> {
		return this.apiRequestManager.getSystemPrompt()
	}

	/** @internal */
	async maybeWaitForProviderRateLimit(retryAttempt: number): Promise<void> {
		return this.apiRequestManager.maybeWaitForProviderRateLimit(retryAttempt)
	}

	public async *attemptApiRequest(
		retryAttempt: number = 0,
		options: { skipProviderRateLimit?: boolean } = {},
	): ApiStream {
		yield* this.apiRequestManager.attemptApiRequest(retryAttempt, options)
	}

	/** @internal */
	async backoffAndAnnounce(retryAttempt: number, error: any): Promise<void> {
		return this.apiRequestManager.backoffAndAnnounce(retryAttempt, error)
	}
	public async checkpointRestore(options: CheckpointRestoreOptions) {
		return checkpointRestore(this, options)
	}

	public async checkpointDiff(options: CheckpointDiffOptions) {
		return checkpointDiff(this, options)
	}

	// Metrics

	public combineMessages(messages: MirrorMessage[]) {
		return this.toolTrackingManager.combineMessages(messages)
	}

	public getTokenUsage(): TokenUsage {
		return this.toolTrackingManager.getTokenUsage()
	}

	public recordToolUsage(toolName: ToolName) {
		return this.toolTrackingManager.recordToolUsage(toolName)
	}

	public recordToolError(toolName: ToolName, error?: string) {
		return this.toolTrackingManager.recordToolError(toolName, error)
	}

	// Getters — delegated to TaskGetters

	public get taskStatus(): TaskStatus {
		return this.getters.taskStatus
	}

	public get taskAsk(): MirrorMessage | undefined {
		return this.getters.taskAsk
	}

	public get queuedMessages(): QueuedMessage[] {
		return this.getters.queuedMessages
	}

	public get tokenUsage(): TokenUsage | undefined {
		return this.getters.tokenUsage
	}

	public get cwd() {
		return this.getters.cwd
	}

	get messageManager(): MessageManager {
		return this.getters.messageManager
	}
}

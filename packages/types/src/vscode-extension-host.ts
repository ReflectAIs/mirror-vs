import { z } from "zod"

import type { GlobalSettings, MirrorVSSettings } from "./global-settings.js"
import type { ProviderSettings, ProviderSettingsEntry } from "./provider-settings.js"
import type { HistoryItem } from "./history.js"
import type { ModeConfig, PromptComponent } from "./mode.js"
import type { Experiments } from "./experiment.js"
import type { MirrorMessage, QueuedMessage } from "./message.js"
import type { TodoItem } from "./todo.js"
import type { OrganizationAllowList } from "./organization.js"
import type { SerializedCustomToolDefinition } from "./custom-tool.js"
import type { GitCommit } from "./git.js"
import type { McpServer } from "./mcp.js"
import type { ModelRecord, RouterModels } from "./model.js"
import type { OpenAiCodexRateLimitInfo } from "./providers/openai-codex-rate-limits.js"
import type { SkillMetadata } from "./skills.js"
import type { WorktreeIncludeStatus } from "./worktree.js"

/**
 * ExtensionMessage
 * Extension -> Webview | CLI
 */
export interface ImageProviderModelInfo {
	id: string
	name: string
	provider: string
}

export interface ExtensionMessage {
	type:
		| "action"
		| "state"
		| "taskHistoryUpdated"
		| "taskHistoryItemUpdated"
		| "selectedImages"
		| "theme"
		| "workspaceUpdated"
		| "invoke"
		| "messageUpdated"
		| "mcpServers"
		| "enhancedPrompt"
		| "commitSearchResults"
		| "listApiConfig"
		| "routerModels"
		| "openAiModels"
		| "ollamaModels"
		| "lmStudioModels"
		| "vsCodeLmModels"
		| "vsCodeLmApiAvailable"
		| "updatePrompt"
		| "systemPrompt"
		| "autoApprovalEnabled"
		| "updateCustomMode"
		| "deleteCustomMode"
		| "exportModeResult"
		| "importModeResult"
		| "checkRulesDirectoryResult"
		| "deleteCustomModeCheck"
		| "currentCheckpointUpdated"
		| "checkpointInitWarning"
		| "ttsStart"
		| "ttsStop"
		| "fileSearchResults"
		| "toggleApiConfigPin"
		| "acceptInput"
		| "setHistoryPreviewCollapsed"
		| "commandExecutionStatus"
		| "mcpExecutionStatus"
		| "vsCodeSetting"
		| "authenticatedUser"
		| "condenseTaskContextStarted"
		| "condenseTaskContextResponse"
		| "singleRouterModelFetchResponse"
		| "mirrorCreditBalance"
		| "indexingStatusUpdate"
		| "indexCleared"
		| "codebaseIndexConfig"
		| "codeIndexSettingsSaved"
		| "codeIndexSecretStatus"
		| "showDeleteMessageDialog"
		| "showEditMessageDialog"
		| "commands"
		| "insertTextIntoTextarea"
		| "dismissedUpsells"
		| "interactionRequired"
		| "customToolsResult"
		| "modes"
		| "taskWithAggregatedCosts"
		| "openAiCodexRateLimits"
		// Worktree response types
		| "worktreeList"
		| "worktreeResult"
		| "worktreeCopyProgress"
		| "branchList"
		| "worktreeDefaults"
		| "worktreeIncludeStatus"
		| "branchWorktreeIncludeResult"
		| "folderSelected"
		| "skills"
		| "fileContent"
		| "imageAutoSetupResult"
		| "imageProviderModels"
		// Pipeline response types
		| "pipelines"
		| "importPipelineResult"
		| "deletePipelineResult"
		| "setDefaultPipelineResult"
		| "hidePipelineResult"
		| "unhidePipelineResult"
		| "comfyuiHardwareProfileResult"
		| "saveSecureTokensResult"
		| "saveSettingsResult"
		| "requestAllowlists"
		| "updateAllowlists"
		| "scanComfyuiWorkflowsResult"
		| "importComfyuiWorkflows"
		| "importComfyuiWorkflowsResult"
		| "deleteComfyuiWorkflowResult"
	text?: string
	/** For fileContent: { path, content, error? } */
	fileContent?: { path: string; content: string | null; error?: string }
	payload?: any // eslint-disable-line @typescript-eslint/no-explicit-any
	checkpointWarning?: {
		type: "WAIT_TIMEOUT" | "INIT_TIMEOUT"
		timeout: number
	}
	action?:
		| "chatButtonClicked"
		| "settingsButtonClicked"
		| "historyButtonClicked"
		| "didBecomeVisible"
		| "focusInput"
		| "switchTab"
		| "toggleAutoApprove"
		| "toggleAutonomousMode"
	invoke?: "newChat" | "sendMessage" | "primaryButtonClick" | "secondaryButtonClick" | "setChatBoxMessage"
	/**
	 * When set to "continueOrCreate", the backend will attempt to continue an existing
	 * session by creating a new task within it (if no active task exists).
	 * Used by ChatView when sending a newTask message.
	 */
	sessionMode?: "continueOrCreate"
	/**
	 * Partial state updates are allowed to reduce message size (e.g. omit large fields like taskHistory).
	 * The webview is responsible for merging.
	 */
	state?: Partial<ExtensionState>
	images?: string[]
	filePaths?: string[]
	openedTabs?: Array<{
		label: string
		isActive: boolean
		path?: string
	}>
	mirrorMessage?: MirrorMessage
	routerModels?: RouterModels
	/** Dynamic model list from local image generation providers (ComfyUI) */
	imageProviderModels?: Record<string, ImageProviderModelInfo[]>
	openAiModels?: string[]
	ollamaModels?: ModelRecord
	lmStudioModels?: ModelRecord
	vsCodeLmModels?: { vendor?: string; family?: string; version?: string; id?: string }[]
	mcpServers?: McpServer[]
	commits?: GitCommit[]
	listApiConfig?: ProviderSettingsEntry[]
	mode?: string
	customMode?: ModeConfig
	slug?: string
	/** Array of slugs (e.g. imported workflow slugs) */
	slugs?: string[]
	success?: boolean
	/** Generic payload for extension messages that use `values` */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	values?: Record<string, any>
	requestId?: string
	promptText?: string
	results?:
		| { path: string; type: "file" | "folder"; label?: string }[]
		| { name: string; description?: string; argumentHint?: string; source: "global" | "project" | "built-in" }[]
	error?: string
	setting?: string
	value?: any // eslint-disable-line @typescript-eslint/no-explicit-any
	hasContent?: boolean
	organizationAllowList?: OrganizationAllowList
	tab?: string
	errors?: string[]
	rulesFolderPath?: string
	settings?: any // eslint-disable-line @typescript-eslint/no-explicit-any
	messageTs?: number
	hasCheckpoint?: boolean
	context?: string
	commands?: Command[]
	queuedMessages?: QueuedMessage[]
	list?: string[] // For dismissedUpsells
	tools?: SerializedCustomToolDefinition[] // For customToolsResult
	skills?: SkillMetadata[] // For skills response
	modes?: { slug: string; name: string }[] // For modes response
	/** Pipeline list response */
	pipelines?: Array<{
		slug: string
		name: string
		description: string
		type: string
		tags: string[]
		source: string
		isDefault: boolean
	}>
	/** Pipeline type for setDefaultPipelineResult */
	pipelineType?: string
	/** Global pipeline allowlist (requestAllowlists response) */
	allowedPipelines?: string[] | null
	/** Per-model pipeline allowlist (requestAllowlists response) */
	modelPipelineAllowlist?: Record<string, string[]> | null
	/** Workflow scan results (scanComfyuiWorkflowsResult response) */
	workflows?: Array<{ name: string; filename: string }>
	/** Directory scanned for workflows (scanComfyuiWorkflowsResult response) */
	workflowDir?: string
	aggregatedCosts?: {
		// For taskWithAggregatedCosts response
		totalCost: number
		ownCost: number
		childrenCost: number
	}
	historyItem?: HistoryItem
	taskHistory?: HistoryItem[] // For taskHistoryUpdated: full sorted task history
	/** For taskHistoryItemUpdated: single updated/added history item */
	taskHistoryItem?: HistoryItem
	// Worktree response properties
	worktrees?: Array<{
		path: string
		branch: string
		commitHash: string
		isCurrent: boolean
		isBare: boolean
		isDetached: boolean
		isLocked: boolean
		lockReason?: string
	}>
	step?: string
	/** 0-100 progress percentage for image auto-setup */
	progress?: number
	isGitRepo?: boolean
	isMultiRoot?: boolean
	isSubfolder?: boolean
	gitRootPath?: string
	worktreeResult?: {
		success: boolean
		message: string
		worktree?: {
			path: string
			branch: string
			commitHash: string
			isCurrent: boolean
			isBare: boolean
			isDetached: boolean
			isLocked: boolean
			lockReason?: string
		}
	}
	localBranches?: string[]
	remoteBranches?: string[]
	currentBranch?: string
	suggestedBranch?: string
	suggestedPath?: string
	worktreeIncludeExists?: boolean
	worktreeIncludeStatus?: WorktreeIncludeStatus
	hasGitignore?: boolean
	gitignoreContent?: string
	// branchWorktreeIncludeResult
	branch?: string
	hasWorktreeInclude?: boolean
	// worktreeCopyProgress (size-based)
	copyProgressBytesCopied?: number
	copyProgressTotalBytes?: number
	copyProgressItemName?: string
	// folderSelected
	path?: string
}

export interface OpenAiCodexRateLimitsMessage {
	type: "openAiCodexRateLimits"
	values?: OpenAiCodexRateLimitInfo
	error?: string
}

export interface TerminalInfo {
	id: number
	command: string
	cwd: string
	taskId?: string
	/** Distinguishes VSCode terminals from SSH sessions */
	type?: "terminal" | "ssh"
	/** SSH host (only for SSH sessions) */
	host?: string
	/** SSH port (only for SSH sessions) */
	port?: number
}

/**
 * Records a single file edit operation for the local edit history.
 * This is populated on every successful edit tool execution and is
 * NEVER sent to the LLM — it's kept purely for frontend display and revert.
 */
export interface FileEditRecord {
	/** Path of the file that was edited (relative to workspace) */
	path: string
	/**
	 * For diff-based tools (apply_diff, search_and_replace, etc.):
	 * the raw diff string that was applied.
	 */
	diff?: string
	/**
	 * For content-replacement tools (write_to_file):
	 * the full new content that was written.
	 */
	content?: string
	/** Original file content before the edit (if available) */
	originalContent?: string
	/** Unified diff statistics (lines added/removed) */
	diffStats?: { added: number; removed: number }
	/** Timestamp (ms since epoch) when the edit was applied */
	timestamp: number
	/** Name of the tool that performed the edit (e.g. "apply_diff", "write_to_file") */
	toolName: string
	/** Git checkpoint hash, if checkpoints are enabled */
	checkpointId?: string
}

/**
 * Tab status for multi-tab interface.
 * - `streaming`: Task is actively streaming a response
 * - `interactive`: Task is waiting for user input (approval/response)
 * - `idle`: Task is idle/waiting (e.g., waiting for a tool result)
 * - `completed`: Task has completed successfully
 * - `error`: Task encountered an error
 */
export type TabStatus = "streaming" | "interactive" | "idle" | "completed" | "error"

/**
 * Represents one tab in the multi-tab interface.
 * The frontend derives `isActive` from `activeTabId` and `hasUnread` from `lastActivity`.
 */
export interface TabInfo {
	taskId: string
	/** Stable display title, set once on task creation from task.name */
	title: string
	/** Current tab status derived from TaskState internally */
	status: TabStatus
	/** Whether the task is waiting for user approval on an action */
	hasPendingApproval: boolean
	/** Monotonic timestamp of last activity — frontend derives unread from this */
	lastActivity: number
	/** Timestamp of task creation — used for stable tab ordering (createdAt ASC) */
	createdAt: number
}

export type ExtensionState = Pick<
	GlobalSettings,
	| "currentSessionId"
	| "sessionNames"
	| "taskNames"
	| "sessionClosedTabs"
	| "currentApiConfigName"
	| "listApiConfigMeta"
	| "pinnedApiConfigs"
	| "customInstructions"
	| "dismissedUpsells"
	| "autoApprovalEnabled"
	| "autonomousMode"
	| "alwaysAllowReadOnly"
	| "alwaysAllowReadOnlyOutsideWorkspace"
	| "alwaysAllowWrite"
	| "alwaysAllowWriteOutsideWorkspace"
	| "alwaysAllowWriteProtected"
	| "alwaysAllowMcp"
	| "alwaysAllowModeSwitch"
	| "alwaysAllowSubtasks"
	| "alwaysAllowFollowupQuestions"
	| "alwaysAllowExecute"
	| "alwaysAllowGitCommit"
	| "alwaysAllowBrowser"
	| "followupAutoApproveTimeoutMs"
	| "allowedCommands"
	| "deniedCommands"
	| "allowedMaxRequests"
	| "allowedMaxCost"
	| "ttsEnabled"
	| "ttsSpeed"
	| "soundEnabled"
	| "soundVolume"
	| "terminalOutputPreviewSize"
	| "terminalShellIntegrationTimeout"
	| "terminalShellIntegrationDisabled"
	| "terminalCommandDelay"
	| "terminalPowershellCounter"
	| "terminalZshClearEolMark"
	| "terminalZshOhMy"
	| "terminalZshP10k"
	| "terminalZdotdir"
	| "execaShellPath"
	| "diagnosticsEnabled"
	| "language"
	| "modeApiConfigs"
	| "customModePrompts"
	| "customSupportPrompts"
	| "enhancementApiConfigId"
	| "customCondensingPrompt"
	| "codebaseIndexConfig"
	| "codebaseIndexModels"
	| "profileThresholds"
	| "includeDiagnosticMessages"
	| "maxDiagnosticMessages"
	| "imageGenerationProvider"
	| "openRouterImageGenerationSelectedModel"
	| "includeTaskHistoryInEnhance"
	| "reasoningBlockCollapsed"
	| "enterBehavior"
	| "includeCurrentTime"
	| "includeCurrentCost"
	| "maxGitStatusFiles"
	| "requestDelaySeconds"
	| "showWorktreesInHomeScreen"
	| "disabledTools"
	| "comfyuiAutoSetup"
	| "activeSearchProvider"
	| "userBraveApiKey"
	| "comfyuiDefaultPipelines"
	| "comfyuiHardwareProfile"
	| "allowedPipelines"
	| "modelPipelineAllowlist"
	| "huggingFaceApiToken"
	| "generationProviders"
	| "openRouterModels"
	| "atlasCloudModels"
	| "comfyCloudApiToken"
	| "atlasCloudApiToken"
> & {
	lockApiConfigAcrossModes?: boolean
	version: string
	mirrorMessages: MirrorMessage[]
	fileEdits: FileEditRecord[]
	currentTaskId?: string
	currentTaskItem?: HistoryItem
	currentTaskTodos?: TodoItem[] // Initial todos for the current task
	apiConfiguration: ProviderSettings
	uriScheme?: string
	shouldShowAnnouncement: boolean

	taskHistory: HistoryItem[]

	writeDelayMs: number

	enableCheckpoints: boolean
	checkpointTimeout: number // Timeout for checkpoint initialization in seconds (default: 15)
	maxOpenTabsContext: number // Maximum number of VSCode open tabs to include in context (0-500)
	maxWorkspaceFiles: number // Maximum number of files to include in current working directory details (0-500)
	showMirrorIgnoredFiles: boolean // Whether to show .mirrorignore'd files in listings
	enableSubfolderRules: boolean // Whether to load rules from subdirectories
	maxReadFileLine?: number // Maximum line limit for read_file tool (-1 for default)
	maxImageFileSize: number // Maximum size of image files to process in MB
	maxTotalImageSize: number // Maximum total size for all images in a single read operation in MB

	experiments: Experiments // Map of experiment IDs to their enabled state

	mcpEnabled: boolean

	mode: string
	customModes: ModeConfig[]
	toolRequirements?: Record<string, boolean> // Map of tool names to their requirements (e.g. {"apply_diff": true})

	cwd?: string // Current working directory
	renderContext: "sidebar" | "editor"
	settingsImportedAt?: number
	historyPreviewCollapsed?: boolean

	organizationAllowList: OrganizationAllowList

	autoCondenseContext: boolean
	autoCondenseContextPercent: number
	profileThresholds: Record<string, number>
	hasOpenedModeSelector: boolean
	filesReadByMirror?: Array<{
		path: string
		record_source: "read_tool" | "user_edited" | "mirror_edited" | "file_mentioned"
		storage_tier?: "hot" | "cold"
		mirror_read_date?: number | null
	}>
	openRouterImageApiKey?: string
	messageQueue?: QueuedMessage[]
	lastShownAnnouncementId?: string
	apiModelId?: string
	mcpServers?: McpServer[]
	openAiCodexIsAuthenticated?: boolean
	debug?: boolean

	/**
	 * Monotonically increasing sequence number for mirrorMessages state pushes.
	 * When present, the frontend should only apply mirrorMessages from a state push
	 * if its seq is greater than the last applied seq. This prevents stale state
	 * (captured during async getStateToPostToWebview) from overwriting newer messages.
	 */
	mirrorMessagesSeq?: number
	hasActiveReviews?: boolean
	/** All open tabs from mirrorStack + backgroundTasks, sorted by createdAt ASC */
	tabs: TabInfo[]
	/** Currently active tab's taskId */
	activeTabId: string
	activeTerminalCount: number
	activeTerminals: TerminalInfo[]
}

export interface Command {
	name: string
	source: "global" | "project" | "built-in"
	filePath?: string
	description?: string
	argumentHint?: string
}

/**
 * WebviewMessage
 * Webview | CLI -> Extension
 */

export type MirrorAskResponse = "yesButtonClicked" | "noButtonClicked" | "messageResponse" | "objectResponse"

export type AudioType = "notification" | "celebration" | "progress_loop"

export interface UpdateTodoListPayload {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	todos: any[]
}

export type EditQueuedMessagePayload = Pick<QueuedMessage, "id" | "text" | "images">

export interface WebviewMessage {
	type:
		| "forgetContextFile"
		| "toggleContextFileStorageTier"
		| "updateTodoList"
		| "deleteMultipleTasksWithIds"
		| "currentApiConfigName"
		| "saveApiConfiguration"
		| "upsertApiConfiguration"
		| "deleteApiConfiguration"
		| "loadApiConfiguration"
		| "loadApiConfigurationById"
		| "renameApiConfiguration"
		| "getListApiConfiguration"
		| "customInstructions"
		| "webviewDidLaunch"
		| "newTask"
		| "askResponse"
		| "terminalOperation"
		| "killTerminal"
		| "clearTask"
		| "didShowAnnouncement"
		| "selectImages"
		| "exportCurrentTask"
		| "showTaskWithId"
		| "deleteTaskWithId"
		| "exportTaskWithId"
		| "importSettings"
		| "exportSettings"
		| "resetState"
		| "flushRouterModels"
		| "requestRouterModels"
		| "requestOpenAiModels"
		| "requestOllamaModels"
		| "requestLmStudioModels"
		| "requestVsCodeLmModels"
		| "openImage"
		| "saveImage"
		| "openFile"
		| "readFileContent"
		| "openMention"
		| "cancelTask"
		| "cancelAutoApproval"
		| "updateVSCodeSetting"
		| "getVSCodeSetting"
		| "vsCodeSetting"
		| "updateCondensingPrompt"
		| "playSound"
		| "playTts"
		| "stopTts"
		| "ttsEnabled"
		| "ttsSpeed"
		| "openKeyboardShortcuts"
		| "openMcpSettings"
		| "openProjectMcpSettings"
		| "restartMcpServer"
		| "refreshAllMcpServers"
		| "toggleToolAlwaysAllow"
		| "toggleToolEnabledForPrompt"
		| "toggleMcpServer"
		| "updateMcpTimeout"
		| "enhancePrompt"
		| "enhanceImagePrompt"
		| "enhancedPrompt"
		| "draggedImages"
		| "deleteMessage"
		| "deleteMessageConfirm"
		| "revertHistory"
		| "submitEditedMessage"
		| "editMessageConfirm"
		| "searchCommits"
		| "setApiConfigPassword"
		| "mode"
		| "updatePrompt"
		| "getSystemPrompt"
		| "copySystemPrompt"
		| "systemPrompt"
		| "enhancementApiConfigId"
		| "autoApprovalEnabled"
		| "updateCustomMode"
		| "deleteCustomMode"
		| "setopenAiCustomModelInfo"
		| "openCustomModesSettings"
		| "checkpointDiff"
		| "checkpointRestore"
		| "deleteMcpServer"
		| "codebaseIndexEnabled"
		| "searchFiles"
		| "toggleApiConfigPin"
		| "hasOpenedModeSelector"
		| "lockApiConfigAcrossModes"
		| "openAiCodexSignIn"
		| "openAiCodexSignOut"
		| "condenseTaskContextRequest"
		| "requestIndexingStatus"
		| "startIndexing"
		| "stopIndexing"
		| "clearIndexData"
		| "indexingStatusUpdate"
		| "indexCleared"
		| "toggleWorkspaceIndexing"
		| "setAutoEnableDefault"
		| "focusPanelRequest"
		| "openExternal"
		| "switchTab"
		// Multi-tab messages
		| "switchTaskTab" // Switch to a specific task's tab
		| "closeTaskTab" // Close a task tab (frontend has already confirmed)
		| "exportMode"
		| "exportModeResult"
		| "importMode"
		| "importModeResult"
		| "checkRulesDirectory"
		| "checkRulesDirectoryResult"
		| "saveCodeIndexSettingsAtomic"
		| "requestCodeIndexSecretStatus"
		| "requestCommands"
		| "openCommandFile"
		| "deleteCommand"
		| "createCommand"
		| "insertTextIntoTextarea"
		| "imageGenerationSettings"
		| "imageAutoSetup"
		| "requestImageProviderModels"
		| "queueMessage"
		| "removeQueuedMessage"
		| "editQueuedMessage"
		| "dismissUpsell"
		| "getDismissedUpsells"
		| "openMarkdownPreview"
		| "updateSettings"
		| "allowedCommands"
		| "getTaskWithAggregatedCosts"
		| "deniedCommands"
		| "openDebugApiHistory"
		| "openDebugUiHistory"
		| "downloadErrorDiagnostics"
		| "requestOpenAiCodexRateLimits"
		| "refreshCustomTools"
		| "requestModes"
		| "switchMode"
		| "debugSetting"
		// Worktree messages
		| "listWorktrees"
		| "createWorktree"
		| "deleteWorktree"
		| "switchWorktree"
		| "getAvailableBranches"
		| "getWorktreeDefaults"
		| "getWorktreeIncludeStatus"
		| "checkBranchWorktreeInclude"
		| "createWorktreeInclude"
		| "checkoutBranch"
		| "browseForWorktreePath"
		// Skills messages
		| "requestSkills"
		| "createSkill"
		| "deleteSkill"
		| "moveSkill"
		| "updateSkillModes"
		| "openSkillFile"
		| "acceptAllReviews"
		// Pipeline messages
		| "requestPipelines"
		| "importPipeline"
		| "deletePipeline"
		| "setDefaultPipeline"
		| "setComfyuiDefaultPipeline"
		| "hidePipeline"
		| "unhidePipeline"
		| "requestHardwareProfile"
		| "saveSecureTokens"
		| "saveSettings"
		| "comfyuiHardwareProfileResult"
		// Allowlist messages
		| "requestAllowlists"
		| "updateAllowlists"
		// ComfyUI workflow scanning messages
		| "scanComfyuiWorkflows"
		| "scanComfyuiWorkflowsResult"
		| "importComfyuiWorkflows"
		| "importComfyuiWorkflowsResult"
		| "deleteComfyuiWorkflow"
		// Session messages
		| "renameSession"
		// Task/tab rename
		| "renameTask"
		// Model change messages
		| "modelChange"
	/** Session ID for session management operations */
	sessionId?: string
	/** New name for the session (for renameSession message) */
	sessionName?: string
	/** Session mode: "continueOrCreate" means create a new task within the current session */
	sessionMode?: "continueOrCreate"
	text?: string
	taskId?: string
	editedMessageContent?: string
	tab?: "settings" | "history" | "mcp" | "modes" | "chat" | "brain" | "analytics"
	disabled?: boolean
	context?: string
	dataUri?: string
	askResponse?: MirrorAskResponse
	apiConfiguration?: ProviderSettings
	images?: string[]
	bool?: boolean
	value?: number
	stepIndex?: number
	isLaunchAction?: boolean
	forceShow?: boolean
	commands?: string[]
	audioType?: AudioType
	serverName?: string
	toolName?: string
	alwaysAllow?: boolean
	isEnabled?: boolean
	mode?: string
	promptMode?: string | "enhance"
	customPrompt?: PromptComponent
	dataUrls?: string[]
	/** Generic payload for webview messages that use `values` */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	values?: Record<string, any>
	query?: string
	setting?: string
	slug?: string
	modeConfig?: ModeConfig
	timeout?: number
	payload?: WebViewMessagePayload
	source?: "global" | "project"
	skillName?: string // For skill operations (createSkill, deleteSkill, moveSkill, openSkillFile)
	/** @deprecated Use skillModeSlugs instead */
	skillMode?: string // For skill operations (current mode restriction)
	/** @deprecated Use newSkillModeSlugs instead */
	newSkillMode?: string // For moveSkill (target mode)
	skillDescription?: string // For createSkill (skill description)
	/** Mode slugs for skill operations. undefined/empty = any mode */
	skillModeSlugs?: string[] // For skill operations (mode restrictions)
	/** Target mode slugs for updateSkillModes */
	newSkillModeSlugs?: string[] // For updateSkillModes (new mode restrictions)
	requestId?: string
	ids?: string[]
	terminalOperation?: "continue" | "abort"
	terminalId?: number
	terminalType?: "terminal" | "ssh"
	messageTs?: number
	inclusive?: boolean
	restoreCheckpoint?: boolean
	historyPreviewCollapsed?: boolean
	filters?: { type?: string; search?: string; tags?: string[] }
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	settings?: any
	url?: string // For openExternal
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	config?: Record<string, any> // Add config to the payload
	hasContent?: boolean // For checkRulesDirectoryResult
	checkOnly?: boolean // For deleteCustomMode check
	upsellId?: string // For dismissUpsell
	list?: string[] // For dismissedUpsells response
	organizationId?: string | null // For organization switching
	codeIndexSettings?: {
		// Global state settings
		codebaseIndexEnabled: boolean
		codebaseIndexQdrantUrl: string
		codebaseIndexEmbedderProvider:
			| "openai"
			| "ollama"
			| "openai-compatible"
			| "gemini"
			| "mistral"
			| "vercel-ai-gateway"
			| "bedrock"
			| "openrouter"
			| "anthropic"
			| "cohere"
			| "jina"
			| "voyage"
		codebaseIndexEmbedderBaseUrl?: string
		codebaseIndexEmbedderModelId: string
		codebaseIndexEmbedderModelDimension?: number // Generic dimension for all providers
		codebaseIndexOpenAiCompatibleBaseUrl?: string
		codebaseIndexBedrockRegion?: string
		codebaseIndexBedrockProfile?: string
		codebaseIndexSearchMaxResults?: number
		codebaseIndexSearchMinScore?: number
		codebaseIndexOpenRouterSpecificProvider?: string // OpenRouter provider routing

		// Secret settings
		codeIndexOpenAiKey?: string
		codeIndexQdrantApiKey?: string
		codebaseIndexOpenAiCompatibleApiKey?: string
		codebaseIndexGeminiApiKey?: string
		codebaseIndexMistralApiKey?: string
		codebaseIndexVercelAiGatewayApiKey?: string
		codebaseIndexOpenRouterApiKey?: string
	}
	updatedSettings?: MirrorVSSettings
	/** Task configuration applied via `createTask()`. */
	taskConfiguration?: MirrorVSSettings
	// Worktree properties
	worktreePath?: string
	worktreeBranch?: string
	worktreeBaseBranch?: string
	worktreeCreateNewBranch?: boolean
	worktreeForce?: boolean
	worktreeNewWindow?: boolean
	worktreeIncludeContent?: string
}

export interface RequestOpenAiCodexRateLimitsMessage {
	type: "requestOpenAiCodexRateLimits"
}

export const checkoutDiffPayloadSchema = z.object({
	ts: z.number().optional(),
	previousCommitHash: z.string().optional(),
	commitHash: z.string(),
	mode: z.enum(["full", "checkpoint", "from-init", "to-current"]),
})

export type CheckpointDiffPayload = z.infer<typeof checkoutDiffPayloadSchema>

export const checkoutRestorePayloadSchema = z.object({
	ts: z.number(),
	commitHash: z.string(),
	mode: z.enum(["preview", "restore"]),
})

export type CheckpointRestorePayload = z.infer<typeof checkoutRestorePayloadSchema>

export interface IndexingStatusPayload {
	state: "Standby" | "Indexing" | "Indexed" | "Error" | "Stopping"
	message: string
}

export interface IndexClearedPayload {
	success: boolean
	error?: string
}

export type WebViewMessagePayload =
	| CheckpointDiffPayload
	| CheckpointRestorePayload
	| IndexingStatusPayload
	| IndexClearedPayload
	| UpdateTodoListPayload
	| EditQueuedMessagePayload

export interface IndexingStatus {
	systemStatus: string
	message?: string
	processedItems: number
	totalItems: number
	currentItemUnit?: string
	workspacePath?: string
	workspaceEnabled?: boolean
	autoEnableDefault?: boolean
}

export interface IndexingStatusUpdateMessage {
	type: "indexingStatusUpdate"
	values: IndexingStatus
}

export interface LanguageModelChatSelector {
	vendor?: string
	family?: string
	version?: string
	id?: string
}

export interface MirrorSayTool {
	tool:
		| "editedExistingFile"
		| "appliedDiff"
		| "newFileCreated"
		| "codebaseSearch"
		| "readFile"
		| "readCommandOutput"
		| "listFilesTopLevel"
		| "listFilesRecursive"
		| "searchFiles"
		| "switchMode"
		| "newTask"
		| "finishTask"
		| "generateImage"
		| "imageGenerated"
		| "runSlashCommand"
		| "updateTodoList"
		| "skill"
		| "browserNavigate"
		| "browserClick"
		| "browserType"
		| "browserScreenshot"
		| "browserScroll"
		| "browserSelect"
		| "browserEvaluate"
		| "renderPreview"
	path?: string
	// For readCommandOutput
	readStart?: number
	readEnd?: number
	totalBytes?: number
	searchPattern?: string
	matchCount?: number
	diff?: string
	content?: string
	// Original file content before first edit (for merged diff display in FileChangesPanel)
	originalContent?: string
	// Unified diff statistics computed by the extension
	diffStats?: { added: number; removed: number }
	regex?: string
	filePattern?: string
	mode?: string
	reason?: string
	isOutsideWorkspace?: boolean
	isProtected?: boolean
	additionalFileCount?: number // Number of additional files in the same read_file request
	lineNumber?: number
	startLine?: number // Starting line for read_file operations (for navigation on click)
	query?: string
	batchFiles?: Array<{
		path: string
		lineSnippet: string
		isOutsideWorkspace?: boolean
		key: string
		content?: string
	}>
	batchDiffs?: Array<{
		path: string
		changeCount: number
		key: string
		content: string
		// Per-file unified diff statistics computed by the extension
		diffStats?: { added: number; removed: number }
		diffs?: Array<{
			content: string
			startLine?: number
		}>
	}>
	batchDirs?: Array<{
		path: string
		recursive: boolean
		isOutsideWorkspace?: boolean
		key: string
	}>
	question?: string
	imageData?: string // Base64 encoded image data for generated images
	inputImage?: string // Path to input image for generateImage edits
	pipeline?: string // Generic pipeline type for display (e.g. "txt2img", "img2img")
	pipelineName?: string // Human-readable pipeline name (e.g. "SDXL Turbo Flash", "Standard Quality")
	// Properties for runSlashCommand tool
	command?: string
	args?: string
	source?: string
	description?: string
	// Properties for skill tool
	skill?: string
	// Properties for browser tools
	url?: string
	selector?: string
	text?: string
	direction?: string
	amount?: number
	value?: string
	script?: string
	width?: number
	height?: number
}

export interface MirrorAskUseMcpServer {
	serverName: string
	type: "use_mcp_tool" | "access_mcp_resource"
	toolName?: string
	arguments?: string
	uri?: string
	response?: string
}

export interface MirrorApiReqInfo {
	request?: string
	tokensIn?: number
	tokensOut?: number
	cacheWrites?: number
	cacheReads?: number
	cost?: number
	cancelReason?: MirrorApiReqCancelReason
	streamingFailedMessage?: string
	apiProtocol?: "anthropic" | "openai"
}

export type MirrorApiReqCancelReason = "streaming_failed" | "user_cancelled"

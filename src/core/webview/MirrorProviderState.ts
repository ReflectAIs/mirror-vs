import * as path from "path"
import * as vscode from "vscode"

import {
	type ProviderName,
	type ExtensionState,
	type HistoryItem,
	type TabInfo,
	type TabStatus,
	openRouterDefaultModelId,
	DEFAULT_WRITE_DELAY_MS,
	DEFAULT_CHECKPOINT_TIMEOUT_SECONDS,
	ORGANIZATION_ALLOW_ALL,
	isRetiredProvider,
} from "@mirror-vs/types"

import { TaskState } from "../task/Task"

import { defaultModeSlug } from "../../shared/modes"

import { Package } from "../../shared/package"
import { formatLanguage } from "../../shared/language"
import { experimentDefault } from "../../shared/experiments"
import { EMBEDDING_MODEL_PROFILES } from "../../shared/embeddingModels"

import { Terminal } from "../../integrations/terminal/Terminal"
import { TerminalRegistry } from "../../integrations/terminal/TerminalRegistry"
import { SshSessionRegistry } from "../tools/helpers/SshSessionRegistry"

import type { MirrorProvider } from "./MirrorProvider"

/**
 * Manages state assembly, merging, and posting to the webview for MirrorProvider.
 *
 * Extracted from MirrorProvider.ts lines 2000–2479 to reduce the monolithic class.
 */
export class StateManager {
	constructor(private provider: MirrorProvider) {}

	// ── Post-state helpers ──────────────────────────────────────────────────

	async refreshWorkspace() {
		this.provider.setCurrentWorkspacePath(this.provider.cwd)
		await this.postStateToWebview()
	}

	async postStateToWebview() {
		const state = await this.getStateToPostToWebview()
		const seq = this.provider.incrementMirrorMessagesSeq()
		state.mirrorMessagesSeq = seq
		this.provider.postMessageToWebview({ type: "state", state })
	}

	/**
	 * Like postStateToWebview but intentionally omits taskHistory.
	 *
	 * Rationale:
	 * - taskHistory can be large and was being resent on every chat message update.
	 * - The webview maintains taskHistory in-memory and receives updates via
	 *   `taskHistoryUpdated` / `taskHistoryItemUpdated`.
	 */
	async postStateToWebviewWithoutTaskHistory(): Promise<void> {
		const state = await this.getStateToPostToWebview()
		const seq = this.provider.incrementMirrorMessagesSeq()
		state.mirrorMessagesSeq = seq
		const { taskHistory: _omit, ...rest } = state
		this.provider.postMessageToWebview({ type: "state", state: rest })
	}

	/**
	 * Like postStateToWebview but intentionally omits both mirrorMessages and taskHistory.
	 *
	 * Rationale:
	 * - Settings and mode changes trigger state pushes
	 *   that have nothing to do with chat messages. Including mirrorMessages in these pushes
	 *   creates race conditions where a stale snapshot of mirrorMessages (captured during async
	 *   getStateToPostToWebview) overwrites newer messages the task has streamed in the meantime.
	 * - This method ensures non-message events only push the state fields they actually affect
	 *   without interfering with task message streaming.
	 */
	async postStateToWebviewWithoutMirrorMessages(): Promise<void> {
		const state = await this.getStateToPostToWebview()
		const { mirrorMessages: _omitMessages, fileEdits: _omitEdits, taskHistory: _omitHistory, ...rest } = state
		this.provider.postMessageToWebview({ type: "state", state: rest })
	}

	// ── Command list merging ───────────────────────────────────────────────

	/**
	 * Merges allowed commands from global state and workspace configuration
	 * with proper validation and deduplication
	 */
	public mergeAllowedCommands(globalStateCommands?: string[]): string[] {
		return this.mergeCommandLists("allowedCommands", "allowed", globalStateCommands)
	}

	/**
	 * Merges denied commands from global state and workspace configuration
	 * with proper validation and deduplication
	 */
	private mergeDeniedCommands(globalStateCommands?: string[]): string[] {
		return this.mergeCommandLists("deniedCommands", "denied", globalStateCommands)
	}

	/**
	 * Common utility for merging command lists from global state and workspace configuration.
	 * Implements the Command Denylist feature's merging strategy with proper validation.
	 *
	 * @param configKey - VSCode workspace configuration key
	 * @param commandType - Type of commands for error logging
	 * @param globalStateCommands - Commands from global state
	 * @returns Merged and deduplicated command list
	 */
	private mergeCommandLists(
		configKey: "allowedCommands" | "deniedCommands",
		commandType: "allowed" | "denied",
		globalStateCommands?: string[],
	): string[] {
		try {
			// Validate and sanitize global state commands
			const validGlobalCommands = Array.isArray(globalStateCommands)
				? globalStateCommands.filter((cmd) => typeof cmd === "string" && cmd.trim().length > 0)
				: []

			// Get workspace configuration commands
			const workspaceCommands = vscode.workspace.getConfiguration(Package.name).get<string[]>(configKey) || []

			// Validate and sanitize workspace commands
			const validWorkspaceCommands = Array.isArray(workspaceCommands)
				? workspaceCommands.filter((cmd) => typeof cmd === "string" && cmd.trim().length > 0)
				: []

			// Combine and deduplicate commands
			// Global state takes precedence over workspace configuration
			const mergedCommands = [...new Set([...validGlobalCommands, ...validWorkspaceCommands])]

			return mergedCommands
		} catch (error) {
			console.error(`Error merging ${commandType} commands:`, error)
			// Return empty array as fallback to prevent crashes
			return []
		}
	}

	// ── State assembly ─────────────────────────────────────────────────────

	async getStateToPostToWebview(): Promise<ExtensionState> {
		// Ensure the store is initialized before reading task history
		await this.provider.taskHistoryStore.initialized

		const {
			apiConfiguration,
			lastShownAnnouncementId,
			customInstructions,
			alwaysAllowReadOnly,
			alwaysAllowReadOnlyOutsideWorkspace,
			alwaysAllowWrite,
			alwaysAllowWriteOutsideWorkspace,
			alwaysAllowWriteProtected,
			alwaysAllowExecute,
			alwaysAllowGitCommit,
			allowedCommands,
			deniedCommands,
			alwaysAllowMcp,
			alwaysAllowModeSwitch,
			alwaysAllowBrowser,
			alwaysAllowSubtasks,
			allowedMaxRequests,
			allowedMaxCost,
			autoCondenseContext,
			autoCondenseContextPercent,
			soundEnabled,
			ttsEnabled,
			ttsSpeed,
			enableCheckpoints,
			checkpointTimeout,
			taskHistory,
			soundVolume,
			writeDelayMs,
			terminalShellIntegrationTimeout,
			terminalShellIntegrationDisabled,
			terminalCommandDelay,
			terminalPowershellCounter,
			terminalZshClearEolMark,
			terminalZshOhMy,
			terminalZshP10k,
			terminalZdotdir,
			mcpEnabled,
			mcpToolsThreshold,
			currentApiConfigName,
			listApiConfigMeta,
			pinnedApiConfigs,
			mode,
			customModePrompts,
			customSupportPrompts,
			enhancementApiConfigId,
			autoApprovalEnabled,
			autonomousMode,
			customModes,
			experiments,
			maxOpenTabsContext,
			maxWorkspaceFiles,
			disabledTools,
			showMirrorIgnoredFiles,
			enableSubfolderRules,
			language,
			maxImageFileSize,
			maxTotalImageSize,
			historyPreviewCollapsed,
			reasoningBlockCollapsed,
			enterBehavior,
			disableTabBar,
			organizationAllowList,
			customCondensingPrompt,
			codebaseIndexConfig,
			codebaseIndexModels,
			profileThresholds,
			alwaysAllowFollowupQuestions,
			followupAutoApproveTimeoutMs,
			includeDiagnosticMessages,
			maxDiagnosticMessages,
			includeTaskHistoryInEnhance,
			includeCurrentTime,
			includeCurrentCost,
			maxGitStatusFiles,
			imageGenerationProvider,
			openRouterImageApiKey,
			openRouterImageGenerationSelectedModel,
			comfyuiAutoSetup,
			lockApiConfigAcrossModes,
			currentSessionId,
			sessionNames,
			taskNames,
			sessionNotes,
			sessionSharedContexts,
			comfyCloudApiToken,
			atlasCloudApiToken,
			atlasCloudModels,
		} = await this.getState()

		const mergedAllowedCommands = this.mergeAllowedCommands(allowedCommands)
		const mergedDeniedCommands = this.mergeDeniedCommands(deniedCommands)
		const cwd = this.provider.cwd
		const currentTask = this.provider.getCurrentTask()

		// Fetch filesReadByMirror safely
		let filesReadByMirror: any[] = []
		if (currentTask) {
			try {
				const metadata = await currentTask.fileContextTracker.getTaskMetadata(currentTask.taskId)
				const rawFiles = metadata?.files_in_context || []
				const seen = new Set<string>()
				const deduped: any[] = []
				// Iterate backwards to keep the latest entries
				for (let i = rawFiles.length - 1; i >= 0; i--) {
					const entry = rawFiles[i]
					const normPath = path.normalize(entry.path).replace(/\\/g, "/")
					if (!seen.has(normPath)) {
						seen.add(normPath)
						deduped.unshift({
							path: entry.path,
							record_source: entry.record_source,
							storage_tier: entry.storage_tier || "hot",
							mirror_read_date: entry.mirror_read_date,
						})
					}
				}
				filesReadByMirror = deduped
			} catch (e) {
				console.error("Failed to read context files metadata for webview state:", e)
			}
		}

		// Build tabs array from live tasks belonging to the active session
		const activeSessionId = currentTask?.sessionId || this.provider.getCurrentSessionId() || currentSessionId

		const allTasks = this.provider.getAllTasksSorted().filter((task) => {
			// Only show tabs for the active session
			return activeSessionId ? task.sessionId === activeSessionId : true
		})

		// Extract knowledge from active tasks so the shared session context stays up to date
		for (const t of allTasks) {
			if (t.sessionId) {
				try {
					await this.provider.getSessionContextManager().extractKnowledgeFromTask(t)
				} catch {
					// non-fatal
				}
			}
		}

		const rawSharedContexts =
			(await this.provider.contextProxy.getValue("sessionSharedContexts")) ?? sessionSharedContexts ?? {}
		const tabs: TabInfo[] = allTasks.map((task) => {
			// Determine hasPendingApproval — task has an ask that's pending user response
			const hasPendingApproval = task.taskAsk !== undefined && task.taskAsk?.isAnswered === false

			// Derive TabStatus from live streaming/ask flags & TaskState
			let status: TabStatus
			if (task.isStreaming || task.isWaitingForFirstChunk) {
				status = "streaming"
			} else if (hasPendingApproval) {
				status = "interactive"
			} else {
				switch (task.state) {
					case TaskState.Streaming:
						status = "streaming"
						break
					case TaskState.WaitingApproval:
						status = "interactive"
						break
					case TaskState.Completed:
						status = "completed"
						break
					case TaskState.Error:
					case TaskState.Aborted:
						status = "error"
						break
					default:
						status = "idle"
						break
				}
			}

			return {
				taskId: task.taskId,
				title:
					taskNames?.[task.taskId] ||
					task.name ||
					task.metadata.task ||
					`Task ${task.taskNumber > -1 ? `#${task.taskNumber}` : task.taskId.slice(0, 8)}`,
				status,
				hasPendingApproval,
				lastActivity: task.lastActivity,
				createdAt: task.createdAt,
			}
		})

		return {
			version: this.provider.context.extension?.packageJSON?.version ?? "",
			tabs,
			activeTabId: currentTask?.taskId ?? (tabs.length > 0 ? tabs[0].taskId : ""),
			filesReadByMirror,
			apiConfiguration,
			customInstructions,
			alwaysAllowReadOnly: alwaysAllowReadOnly ?? false,
			alwaysAllowReadOnlyOutsideWorkspace: alwaysAllowReadOnlyOutsideWorkspace ?? false,
			alwaysAllowWrite: alwaysAllowWrite ?? false,
			alwaysAllowWriteOutsideWorkspace: alwaysAllowWriteOutsideWorkspace ?? false,
			alwaysAllowWriteProtected: alwaysAllowWriteProtected ?? false,
			alwaysAllowExecute: alwaysAllowExecute ?? false,
			alwaysAllowGitCommit: alwaysAllowGitCommit ?? false,
			alwaysAllowMcp: alwaysAllowMcp ?? false,
			alwaysAllowModeSwitch: alwaysAllowModeSwitch ?? false,
			alwaysAllowSubtasks: alwaysAllowSubtasks ?? false,
			allowedMaxRequests,
			allowedMaxCost,
			autoCondenseContext: autoCondenseContext ?? true,
			autoCondenseContextPercent: autoCondenseContextPercent ?? 100,
			uriScheme: vscode.env.uriScheme,
			currentTaskId: currentTask?.taskId,
			currentTaskItem: currentTask?.taskId ? this.provider.taskHistoryStore.get(currentTask.taskId) : undefined,
			mirrorMessages: currentTask?.mirrorMessages || [],
			fileEdits: currentTask?.fileEdits || [],
			currentTaskTodos: currentTask?.todoList || [],
			messageQueue: currentTask?.messageQueueService?.messages,
			taskHistory: this.provider.taskHistoryStore.getAll().filter((item: HistoryItem) => item.ts && item.task),
			soundEnabled: soundEnabled ?? false,
			ttsEnabled: ttsEnabled ?? false,
			ttsSpeed: ttsSpeed ?? 1.0,
			enableCheckpoints: enableCheckpoints ?? true,
			checkpointTimeout: checkpointTimeout ?? DEFAULT_CHECKPOINT_TIMEOUT_SECONDS,
			shouldShowAnnouncement: lastShownAnnouncementId !== this.provider.latestAnnouncementId,
			allowedCommands: mergedAllowedCommands,
			deniedCommands: mergedDeniedCommands,
			hasActiveReviews: (() => {
				try {
					const { ReviewManager } = require("../../services/review-manager")
					return ReviewManager.getInstance().getActiveReviewsCount() > 0
				} catch {
					return false
				}
			})(),
			soundVolume: soundVolume ?? 0.5,
			writeDelayMs: writeDelayMs ?? DEFAULT_WRITE_DELAY_MS,
			terminalShellIntegrationTimeout: terminalShellIntegrationTimeout ?? Terminal.defaultShellIntegrationTimeout,
			terminalShellIntegrationDisabled: terminalShellIntegrationDisabled ?? false,
			terminalCommandDelay: terminalCommandDelay ?? 0,
			terminalPowershellCounter: terminalPowershellCounter ?? false,
			terminalZshClearEolMark: terminalZshClearEolMark ?? true,
			terminalZshOhMy: terminalZshOhMy ?? false,
			terminalZshP10k: terminalZshP10k ?? false,
			terminalZdotdir: terminalZdotdir ?? false,
			mcpEnabled: mcpEnabled ?? true,
			mcpToolsThreshold: mcpToolsThreshold ?? 40,
			currentApiConfigName: currentApiConfigName ?? "default",
			listApiConfigMeta: listApiConfigMeta ?? [],
			pinnedApiConfigs: pinnedApiConfigs ?? {},
			mode: mode ?? defaultModeSlug,
			customModePrompts: customModePrompts ?? {},
			customSupportPrompts: customSupportPrompts ?? {},
			enhancementApiConfigId,
			alwaysAllowBrowser: alwaysAllowBrowser ?? false,
			autoApprovalEnabled: autoApprovalEnabled ?? false,
			autonomousMode: autonomousMode ?? false,
			customModes,
			experiments: experiments ?? experimentDefault,
			mcpServers: this.provider.getMcpHub()?.getAllServers() ?? [],
			maxOpenTabsContext: maxOpenTabsContext ?? 20,
			maxWorkspaceFiles: maxWorkspaceFiles ?? 200,
			cwd,
			disabledTools,
			showMirrorIgnoredFiles: showMirrorIgnoredFiles ?? false,
			enableSubfolderRules: enableSubfolderRules ?? false,
			language: language ?? formatLanguage(vscode.env.language),
			renderContext: this.provider.getRenderContext(),
			maxImageFileSize: maxImageFileSize ?? 5,
			maxTotalImageSize: maxTotalImageSize ?? 20,
			settingsImportedAt: this.provider.settingsImportedAt,
			historyPreviewCollapsed: historyPreviewCollapsed ?? false,
			reasoningBlockCollapsed: reasoningBlockCollapsed ?? true,
			enterBehavior: enterBehavior ?? "send",
			disableTabBar: disableTabBar ?? false,
			organizationAllowList,
			customCondensingPrompt,
			codebaseIndexModels: codebaseIndexModels ?? EMBEDDING_MODEL_PROFILES,
			codebaseIndexConfig: {
				codebaseIndexEnabled: codebaseIndexConfig?.codebaseIndexEnabled ?? false,
				codebaseIndexQdrantUrl: codebaseIndexConfig?.codebaseIndexQdrantUrl ?? "http://localhost:6333",
				codebaseIndexEmbedderProvider: codebaseIndexConfig?.codebaseIndexEmbedderProvider ?? "openai",
				codebaseIndexEmbedderBaseUrl: codebaseIndexConfig?.codebaseIndexEmbedderBaseUrl ?? "",
				codebaseIndexEmbedderModelId: codebaseIndexConfig?.codebaseIndexEmbedderModelId ?? "",
				codebaseIndexEmbedderModelDimension: codebaseIndexConfig?.codebaseIndexEmbedderModelDimension ?? 1536,
				codebaseIndexOpenAiCompatibleBaseUrl: codebaseIndexConfig?.codebaseIndexOpenAiCompatibleBaseUrl,
				codebaseIndexSearchMaxResults: codebaseIndexConfig?.codebaseIndexSearchMaxResults,
				codebaseIndexSearchMinScore: codebaseIndexConfig?.codebaseIndexSearchMinScore,
				codebaseIndexBedrockRegion: codebaseIndexConfig?.codebaseIndexBedrockRegion,
				codebaseIndexBedrockProfile: codebaseIndexConfig?.codebaseIndexBedrockProfile,
				codebaseIndexOpenRouterSpecificProvider: codebaseIndexConfig?.codebaseIndexOpenRouterSpecificProvider,
			},
			profileThresholds: profileThresholds ?? {},
			hasOpenedModeSelector: this.provider.getGlobalStateValue("hasOpenedModeSelector") ?? false,
			lockApiConfigAcrossModes: lockApiConfigAcrossModes ?? false,
			alwaysAllowFollowupQuestions: alwaysAllowFollowupQuestions ?? false,
			followupAutoApproveTimeoutMs: followupAutoApproveTimeoutMs ?? 60000,
			includeDiagnosticMessages: includeDiagnosticMessages ?? true,
			maxDiagnosticMessages: maxDiagnosticMessages ?? 50,
			includeTaskHistoryInEnhance: includeTaskHistoryInEnhance ?? true,
			includeCurrentTime: includeCurrentTime ?? true,
			includeCurrentCost: includeCurrentCost ?? true,
			maxGitStatusFiles: maxGitStatusFiles ?? 0,
			imageGenerationProvider,
			openRouterImageApiKey,
			openRouterImageGenerationSelectedModel,
			comfyuiAutoSetup,
			imageAutoSetupRunning: (await import("../../services/image-runtime")).isAutoSetupRunning(),
			imageAutoSetupStatus: (await import("../../services/image-runtime")).getLastAutoSetupStatus(),
			openAiCodexIsAuthenticated: await (async () => {
				try {
					const { openAiCodexOAuthManager } = await import("../../integrations/openai-codex/oauth")
					return await openAiCodexOAuthManager.isAuthenticated()
				} catch {
					return false
				}
			})(),
			activeTerminalCount: TerminalRegistry.getTerminals(true).length + SshSessionRegistry.getSessions().length,
			activeTerminals: [
				...TerminalRegistry.getTerminals(true).map((t) => ({
					id: t.id,
					command: t.getLastCommand(),
					cwd: t.getCurrentWorkingDirectory(),
					taskId: t.taskId,
					type: "terminal" as const,
				})),
				...SshSessionRegistry.getSessions().map(({ host, port, session }) => ({
					// Use a deterministic negative id based on host:port hash
					id:
						-Math.abs(host.split("").reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0) + port) ||
						-1,
					command: `SSH: ${host}:${port}`,
					cwd: "",
					host,
					port,
					type: "ssh" as const,
				})),
			],
			currentSessionId: activeSessionId || currentSessionId,
			sessionNames: sessionNames ?? {},
			taskNames: taskNames ?? {},
			sessionNotes,
			sessionSharedContexts: rawSharedContexts,
			comfyCloudApiToken,
			atlasCloudApiToken,
			atlasCloudModels: atlasCloudModels ?? {},
			debug: vscode.workspace.getConfiguration(Package.name).get<boolean>("debug", false),
		}
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
		const provider = this.provider
		const stateValues = provider.contextProxy.getValues()
		const customModes = await provider.customModesManager.getCustomModes()

		// Determine apiProvider with the same logic as before, while filtering retired providers.
		const apiProvider: ProviderName =
			stateValues.apiProvider && !isRetiredProvider(stateValues.apiProvider)
				? stateValues.apiProvider
				: "openrouter"

		// Build the apiConfiguration object combining state values and secrets.
		const providerSettings = provider.contextProxy.getProviderSettings()

		// Ensure apiProvider is set properly if not already in state
		if (!providerSettings.apiProvider) {
			providerSettings.apiProvider = apiProvider
		}
		if (providerSettings.apiProvider === "openrouter" && !providerSettings.openRouterModelId) {
			providerSettings.openRouterModelId = openRouterDefaultModelId
		}

		const organizationAllowList = ORGANIZATION_ALLOW_ALL

		// Return the same structure as before.
		return {
			apiConfiguration: providerSettings,
			lastShownAnnouncementId: stateValues.lastShownAnnouncementId,
			customInstructions: stateValues.customInstructions,
			apiModelId: stateValues.apiModelId,
			alwaysAllowReadOnly: stateValues.alwaysAllowReadOnly ?? false,
			alwaysAllowReadOnlyOutsideWorkspace: stateValues.alwaysAllowReadOnlyOutsideWorkspace ?? false,
			alwaysAllowWrite: stateValues.alwaysAllowWrite ?? false,
			alwaysAllowWriteOutsideWorkspace: stateValues.alwaysAllowWriteOutsideWorkspace ?? false,
			alwaysAllowWriteProtected: stateValues.alwaysAllowWriteProtected ?? false,
			alwaysAllowExecute: stateValues.alwaysAllowExecute ?? false,
			alwaysAllowGitCommit: stateValues.alwaysAllowGitCommit ?? false,
			alwaysAllowMcp: stateValues.alwaysAllowMcp ?? false,
			alwaysAllowModeSwitch: stateValues.alwaysAllowModeSwitch ?? false,
			alwaysAllowSubtasks: stateValues.alwaysAllowSubtasks ?? false,
			alwaysAllowFollowupQuestions: stateValues.alwaysAllowFollowupQuestions ?? false,
			followupAutoApproveTimeoutMs: stateValues.followupAutoApproveTimeoutMs ?? 60000,
			diagnosticsEnabled: stateValues.diagnosticsEnabled ?? true,
			allowedMaxRequests: stateValues.allowedMaxRequests,
			allowedMaxCost: stateValues.allowedMaxCost,
			autoCondenseContext: stateValues.autoCondenseContext ?? true,
			autoCondenseContextPercent: stateValues.autoCondenseContextPercent ?? 100,
			taskHistory: provider.taskHistoryStore.getAll(),
			allowedCommands: stateValues.allowedCommands,
			deniedCommands: stateValues.deniedCommands,
			soundEnabled: stateValues.soundEnabled ?? false,
			ttsEnabled: stateValues.ttsEnabled ?? false,
			ttsSpeed: stateValues.ttsSpeed ?? 1.0,
			enableCheckpoints: stateValues.enableCheckpoints ?? true,
			checkpointTimeout: stateValues.checkpointTimeout ?? DEFAULT_CHECKPOINT_TIMEOUT_SECONDS,
			soundVolume: stateValues.soundVolume,
			writeDelayMs: stateValues.writeDelayMs ?? DEFAULT_WRITE_DELAY_MS,
			terminalShellIntegrationTimeout:
				stateValues.terminalShellIntegrationTimeout ?? Terminal.defaultShellIntegrationTimeout,
			terminalShellIntegrationDisabled: stateValues.terminalShellIntegrationDisabled ?? false,
			terminalCommandDelay: stateValues.terminalCommandDelay ?? 0,
			terminalPowershellCounter: stateValues.terminalPowershellCounter ?? false,
			terminalZshClearEolMark: stateValues.terminalZshClearEolMark ?? true,
			terminalZshOhMy: stateValues.terminalZshOhMy ?? false,
			terminalZshP10k: stateValues.terminalZshP10k ?? false,
			terminalZdotdir: stateValues.terminalZdotdir ?? false,
			mode: stateValues.mode ?? defaultModeSlug,
			language: stateValues.language ?? formatLanguage(vscode.env.language),
			mcpEnabled: stateValues.mcpEnabled ?? true,
			mcpToolsThreshold: stateValues.mcpToolsThreshold ?? 40,
			mcpServers: provider.getMcpHub()?.getAllServers() ?? [],
			currentApiConfigName: stateValues.currentApiConfigName ?? "default",
			listApiConfigMeta: stateValues.listApiConfigMeta ?? [],
			pinnedApiConfigs: stateValues.pinnedApiConfigs ?? {},
			modeApiConfigs: stateValues.modeApiConfigs ?? ({} as Record<string, string>),
			customModePrompts: stateValues.customModePrompts ?? {},
			customSupportPrompts: stateValues.customSupportPrompts ?? {},
			enhancementApiConfigId: stateValues.enhancementApiConfigId,
			experiments: stateValues.experiments ?? experimentDefault,
			autoApprovalEnabled: stateValues.autoApprovalEnabled ?? false,
			alwaysAllowBrowser: stateValues.alwaysAllowBrowser ?? false,
			autonomousMode: stateValues.autonomousMode ?? false,
			customModes,
			maxOpenTabsContext: stateValues.maxOpenTabsContext ?? 20,
			maxWorkspaceFiles: stateValues.maxWorkspaceFiles ?? 200,
			disabledTools: stateValues.disabledTools,
			showMirrorIgnoredFiles: stateValues.showMirrorIgnoredFiles ?? false,
			enableSubfolderRules: stateValues.enableSubfolderRules ?? false,
			maxImageFileSize: stateValues.maxImageFileSize ?? 5,
			maxTotalImageSize: stateValues.maxTotalImageSize ?? 20,
			historyPreviewCollapsed: stateValues.historyPreviewCollapsed ?? false,
			reasoningBlockCollapsed: stateValues.reasoningBlockCollapsed ?? true,
			enterBehavior: stateValues.enterBehavior ?? "send",
			disableTabBar: stateValues.disableTabBar ?? false,
			organizationAllowList,
			customCondensingPrompt: stateValues.customCondensingPrompt,
			codebaseIndexModels: stateValues.codebaseIndexModels ?? EMBEDDING_MODEL_PROFILES,
			codebaseIndexConfig: {
				codebaseIndexEnabled: stateValues.codebaseIndexConfig?.codebaseIndexEnabled ?? false,
				codebaseIndexQdrantUrl:
					stateValues.codebaseIndexConfig?.codebaseIndexQdrantUrl ?? "http://localhost:6333",
				codebaseIndexEmbedderProvider:
					stateValues.codebaseIndexConfig?.codebaseIndexEmbedderProvider ?? "openai",
				codebaseIndexEmbedderBaseUrl: stateValues.codebaseIndexConfig?.codebaseIndexEmbedderBaseUrl ?? "",
				codebaseIndexEmbedderModelId: stateValues.codebaseIndexConfig?.codebaseIndexEmbedderModelId ?? "",
				codebaseIndexEmbedderModelDimension:
					stateValues.codebaseIndexConfig?.codebaseIndexEmbedderModelDimension,
				codebaseIndexOpenAiCompatibleBaseUrl:
					stateValues.codebaseIndexConfig?.codebaseIndexOpenAiCompatibleBaseUrl,
				codebaseIndexSearchMaxResults: stateValues.codebaseIndexConfig?.codebaseIndexSearchMaxResults,
				codebaseIndexSearchMinScore: stateValues.codebaseIndexConfig?.codebaseIndexSearchMinScore,
				codebaseIndexBedrockRegion: stateValues.codebaseIndexConfig?.codebaseIndexBedrockRegion,
				codebaseIndexBedrockProfile: stateValues.codebaseIndexConfig?.codebaseIndexBedrockProfile,
				codebaseIndexOpenRouterSpecificProvider:
					stateValues.codebaseIndexConfig?.codebaseIndexOpenRouterSpecificProvider,
			},
			profileThresholds: stateValues.profileThresholds ?? {},
			lockApiConfigAcrossModes: provider.context.workspaceState.get("lockApiConfigAcrossModes", false),
			includeDiagnosticMessages: stateValues.includeDiagnosticMessages ?? true,
			maxDiagnosticMessages: stateValues.maxDiagnosticMessages ?? 50,
			includeTaskHistoryInEnhance: stateValues.includeTaskHistoryInEnhance ?? true,
			includeCurrentTime: stateValues.includeCurrentTime ?? true,
			includeCurrentCost: stateValues.includeCurrentCost ?? true,
			maxGitStatusFiles: stateValues.maxGitStatusFiles ?? 0,
			imageGenerationProvider: stateValues.imageGenerationProvider,
			openRouterImageApiKey: stateValues.openRouterImageApiKey,
			openRouterImageGenerationSelectedModel: stateValues.openRouterImageGenerationSelectedModel,
			comfyuiAutoSetup: stateValues.comfyuiAutoSetup,
			currentSessionId: stateValues.currentSessionId,
			sessionNames: stateValues.sessionNames ?? {},
			taskNames: stateValues.taskNames ?? {},
			sessionNotes:
				stateValues.currentSessionId && stateValues.sessionSharedContexts?.[stateValues.currentSessionId]
					? stateValues.sessionSharedContexts[stateValues.currentSessionId].notes
					: undefined,
			sessionSharedContexts: stateValues.sessionSharedContexts ?? {},
			activeSearchProvider: stateValues.activeSearchProvider ?? "duckduckgo",
			userBraveApiKey: stateValues.userBraveApiKey,
			comfyuiDefaultPipelines: stateValues.comfyuiDefaultPipelines ?? {},
			comfyuiHardwareProfile: stateValues.comfyuiHardwareProfile,
			huggingFaceApiToken: stateValues.huggingFaceApiToken ? "********" : undefined,
			comfyCloudApiToken: stateValues.comfyCloudApiToken ? "********" : undefined,
			atlasCloudApiToken: stateValues.atlasCloudApiToken ? "********" : undefined,
			generationProviders: stateValues.generationProviders ?? {},
			openRouterModels: stateValues.openRouterModels ?? {},
			atlasCloudModels: stateValues.atlasCloudModels ?? {},
			workspaceFolders:
				vscode.workspace.workspaceFolders?.map((f) => ({ name: f.name, path: f.uri.fsPath })) ?? [],
			currentWorkspacePath: provider.cwd,
		}
	}
}

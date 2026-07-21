import * as vscode from "vscode"

import type { WebviewMessage } from "@mirror-vs/types"

import type { MirrorProvider } from "../MirrorProvider"
import { resolveIncomingImages } from "./_helpers"
import { t } from "../../../i18n"

/**
 * Handles the webviewDidLaunch message - initializes custom modes, MCP, API config, theme.
 */
export async function handleWebviewDidLaunch(provider: MirrorProvider): Promise<void> {
	const customModes = await provider.customModesManager.getCustomModes()
	await provider.contextProxy.setValue("customModes", customModes)

	provider.postStateToWebview()
	provider.workspaceTracker?.initializeFilePaths() // Don't await.

	const { getTheme } = await import("../../../integrations/theme/getTheme")
	getTheme().then((theme) => provider.postMessageToWebview({ type: "theme", text: JSON.stringify(theme) }))

	// If MCP Hub is already initialized, update the webview with current server list.
	const mcpHub = provider.getMcpHub()

	if (mcpHub) {
		provider.postMessageToWebview({ type: "mcpServers", mcpServers: mcpHub.getAllServers() })
	}

	const { checkExistKey } = await import("../../../shared/checkExistApiConfig")

	provider.providerSettingsManager
		.listConfig()
		.then(async (listApiConfig) => {
			if (!listApiConfig) {
				return
			}

			if (listApiConfig.length === 1) {
				if (!checkExistKey(listApiConfig[0])) {
					const { apiConfiguration } = await provider.getState()

					if (checkExistKey(apiConfiguration)) {
						await provider.providerSettingsManager.saveConfig(
							listApiConfig[0].name ?? "default",
							apiConfiguration,
						)

						listApiConfig[0].apiProvider = apiConfiguration.apiProvider
					}
				}
			}

			const currentConfigName = provider.contextProxy.getValue("currentApiConfigName")

			if (currentConfigName) {
				if (!(await provider.providerSettingsManager.hasConfig(currentConfigName))) {
					const name = listApiConfig[0]?.name
					await provider.contextProxy.setValue("currentApiConfigName", name)

					if (name) {
						await provider.activateProviderProfile({ name })
						return
					}
				}
			}

			await Promise.all([
				await provider.contextProxy.setValue("listApiConfigMeta", listApiConfig),
				await provider.postMessageToWebview({ type: "listApiConfig", listApiConfig }),
			])
		})
		.catch((error) =>
			provider.log(
				`Error list api configuration: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
			),
		)

	provider.isViewLaunched = true
}

/**
 * Handles the newTask message - creates a new task.
 */
export async function handleNewTask(provider: MirrorProvider, message: WebviewMessage): Promise<void> {
	try {
		const resolved = await resolveIncomingImages(provider, { text: message.text, images: message.images })

		const currentTask = provider.getCurrentTask()
		const hasActiveTask = currentTask !== undefined && !currentTask.abandoned && !currentTask.abort
		const sessionId = provider.getCurrentSessionId()

		if (message.sessionMode === "continueOrCreate" && sessionId && !hasActiveTask) {
			await provider.startNewTaskInSession(resolved.text, resolved.images)
		} else {
			await provider.createTask(
				resolved.text,
				resolved.images,
				undefined,
				{ taskId: message.taskId },
				message.taskConfiguration,
			)
		}

		await provider.postMessageToWebview({ type: "invoke", invoke: "newChat" })
	} catch (error) {
		await provider.postMessageToWebview({ type: "invoke", invoke: "newChat" })
		vscode.window.showErrorMessage(
			`Failed to create task: ${error instanceof Error ? error.message : String(error)}`,
		)
	}
}

/**
 * Handles the renameSession message.
 */
export async function handleRenameSession(
	provider: MirrorProvider,
	sessionId?: string,
	sessionName?: string,
): Promise<void> {
	if (sessionId && sessionName !== undefined) {
		await provider.renameSession(sessionId, sessionName)
	}
}

/**
 * Handles the customInstructions message.
 */
export async function handleCustomInstructions(provider: MirrorProvider, text?: string): Promise<void> {
	await provider.updateCustomInstructions(text)
}

/**
 * Handles the askResponse message.
 */
export async function handleAskResponse(provider: MirrorProvider, message: WebviewMessage): Promise<void> {
	const resolved = await resolveIncomingImages(provider, { text: message.text, images: message.images })
	provider.getCurrentTask()?.handleWebviewAskResponse(message.askResponse!, resolved.text, resolved.images)
}

/**
 * Handles the terminalOperation message.
 */
export async function handleTerminalOperation(
	provider: MirrorProvider,
	terminalOp?: "continue" | "abort",
): Promise<void> {
	if (terminalOp) {
		provider.getCurrentTask()?.handleTerminalOperation(terminalOp)
	}
}

/**
 * Handles the killTerminal message — kills a specific terminal or SSH session.
 */
export async function handleKillTerminal(
	provider: MirrorProvider,
	terminalId?: number,
	terminalType?: "terminal" | "ssh",
): Promise<void> {
	if (terminalId === undefined) {
		return
	}

	if (terminalType === "ssh") {
		// Kill SSH session — need to find the host/port from the registry
		const { SshSessionRegistry } = await import("../../tools/helpers/SshSessionRegistry")
		const sessions = SshSessionRegistry.getSessions()
		// The id for SSH sessions is a deterministic negative hash; we find the matching session
		for (const { host, port, session } of sessions) {
			const computedId =
				-Math.abs(host.split("").reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0) + port) || -1
			if (computedId === terminalId) {
				SshSessionRegistry.removeSession(host, port)
				break
			}
		}
	} else {
		// Kill VSCode terminal
		const { TerminalRegistry } = await import("../../../integrations/terminal/TerminalRegistry")
		TerminalRegistry.killTerminal(terminalId)
	}

	await provider.postStateToWebview()
}

/**
 * Handles the clearTask message.
 */
export async function handleClearTask(provider: MirrorProvider): Promise<void> {
	await provider.clearTask()
	await provider.postStateToWebview()
}

/**
 * Handles the cancelTask message.
 */
export async function handleCancelTask(provider: MirrorProvider): Promise<void> {
	await provider.cancelTask()
}

/**
 * Handles the cancelAutoApproval message.
 */
export async function handleCancelAutoApproval(provider: MirrorProvider): Promise<void> {
	provider.getCurrentTask()?.cancelAutoApprovalTimeout()
}

/**
 * Handles the didShowAnnouncement message.
 */
export async function handleDidShowAnnouncement(provider: MirrorProvider): Promise<void> {
	await provider.contextProxy.setValue("lastShownAnnouncementId", provider.latestAnnouncementId)
	await provider.postStateToWebview()
}

/**
 * Handles the selectImages message.
 */
export async function handleSelectImages(
	provider: MirrorProvider,
	context?: string,
	messageTs?: number,
): Promise<void> {
	const { selectImages } = await import("../../../integrations/misc/process-images")
	const images = await selectImages()
	await provider.postMessageToWebview({
		type: "selectedImages",
		images,
		context,
		messageTs,
	})
}

/**
 * Handles the exportCurrentTask message.
 */
export async function handleExportCurrentTask(provider: MirrorProvider): Promise<void> {
	const currentTaskId = provider.getCurrentTask()?.taskId
	if (currentTaskId) {
		provider.exportTaskWithId(currentTaskId)
	}
}

/**
 * Handles the showTaskWithId message.
 */
export async function handleShowTaskWithId(provider: MirrorProvider, text?: string): Promise<void> {
	provider.showTaskWithId(text!)
}

/**
 * Handles the condenseTaskContextRequest message.
 */
export async function handleCondenseTaskContext(provider: MirrorProvider, text?: string): Promise<void> {
	provider.condenseTaskContext(text!)
}

/**
 * Handles the deleteTaskWithId message.
 */
export async function handleDeleteTaskWithId(provider: MirrorProvider, text?: string): Promise<void> {
	provider.deleteTaskWithId(text!)
}

/**
 * Handles the deleteMultipleTasksWithIds message - batch deletion with progress.
 */
export async function handleDeleteMultipleTasksWithIds(provider: MirrorProvider, ids?: string[]): Promise<void> {
	if (Array.isArray(ids)) {
		const batchSize = 20
		const results: { id: string; success: boolean }[] = []

		console.log(`Batch deletion started: ${ids.length} tasks total`)

		for (let i = 0; i < ids.length; i += batchSize) {
			const batch = ids.slice(i, i + batchSize)

			const batchPromises = batch.map(async (id) => {
				try {
					await provider.deleteTaskWithId(id)
					return { id, success: true }
				} catch (error) {
					console.log(
						`Failed to delete task ${id}: ${error instanceof Error ? error.message : String(error)}`,
					)
					return { id, success: false }
				}
			})

			const batchResults = await Promise.all(batchPromises)
			results.push(...batchResults)

			await provider.postStateToWebview()
		}

		const successCount = results.filter((r) => r.success).length
		const failCount = results.length - successCount
		console.log(
			`Batch deletion completed: ${successCount}/${ids.length} tasks successful, ${failCount} tasks failed`,
		)
	}
}

/**
 * Handles the exportTaskWithId message.
 */
export async function handleExportTaskWithId(provider: MirrorProvider, text?: string): Promise<void> {
	provider.exportTaskWithId(text!)
}

/**
 * Handles the getTaskWithAggregatedCosts message.
 */
export async function handleGetTaskWithAggregatedCosts(provider: MirrorProvider, taskId?: string): Promise<void> {
	try {
		if (!taskId) {
			throw new Error("Task ID is required")
		}
		const result = await provider.getTaskWithAggregatedCosts(taskId)
		await provider.postMessageToWebview({
			type: "taskWithAggregatedCosts",
			text: taskId,
			historyItem: result.historyItem,
			aggregatedCosts: result.aggregatedCosts,
		})
	} catch (error) {
		console.error("Error getting task with aggregated costs:", error)
		await provider.postMessageToWebview({
			type: "taskWithAggregatedCosts",
			text: taskId,
			error: error instanceof Error ? error.message : String(error),
		})
	}
}

/**
 * Handles the mode message - switches the current mode.
 */
export async function handleModeSwitch(provider: MirrorProvider, mode?: string): Promise<void> {
	if (mode) {
		await provider.handleModeSwitch(mode)
	}
}

/**
 * Handles the enhancePrompt message.
 */
export async function handleEnhancePrompt(provider: MirrorProvider, text?: string, isImage?: boolean): Promise<void> {
	if (text) {
		try {
			const { MessageEnhancer } = await import("../messageEnhancer")
			const state = await provider.getState()

			const {
				apiConfiguration,
				customSupportPrompts,
				listApiConfigMeta = [],
				enhancementApiConfigId,
				includeTaskHistoryInEnhance,
			} = state

			const currentMirror = provider.getCurrentTask()

			const result = await MessageEnhancer.enhanceMessage({
				text,
				apiConfiguration,
				customSupportPrompts,
				listApiConfigMeta,
				enhancementApiConfigId,
				includeTaskHistoryInEnhance,
				currentMirrorMessages: currentMirror?.mirrorMessages,
				providerSettingsManager: provider.providerSettingsManager,
				isImage,
			})

			if (result.success && result.enhancedText) {
				await provider.postMessageToWebview({ type: "enhancedPrompt", text: result.enhancedText })
			} else {
				throw new Error(result.error || "Unknown error")
			}
		} catch (error) {
			provider.log(`Error enhancing prompt: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`)

			vscode.window.showErrorMessage(t("common:errors.enhance_prompt"))
			await provider.postMessageToWebview({ type: "enhancedPrompt" })
		}
	}
}

/**
 * Handles the getSystemPrompt message.
 */
export async function handleGetSystemPrompt(provider: MirrorProvider, message: WebviewMessage): Promise<void> {
	try {
		const { generateSystemPrompt } = await import("../generateSystemPrompt")
		const systemPrompt = await generateSystemPrompt(provider, message)

		await provider.postMessageToWebview({
			type: "systemPrompt",
			text: systemPrompt,
			mode: message.mode,
		})
	} catch (error) {
		provider.log(`Error getting system prompt:  ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`)
		vscode.window.showErrorMessage(t("common:errors.get_system_prompt"))
	}
}

/**
 * Handles the copySystemPrompt message.
 */
export async function handleCopySystemPrompt(provider: MirrorProvider, message: WebviewMessage): Promise<void> {
	try {
		const { generateSystemPrompt } = await import("../generateSystemPrompt")
		const systemPrompt = await generateSystemPrompt(provider, message)

		await vscode.env.clipboard.writeText(systemPrompt)
		await vscode.window.showInformationMessage(t("common:info.clipboard_copy"))
	} catch (error) {
		provider.log(`Error getting system prompt:  ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`)
		vscode.window.showErrorMessage(t("common:errors.get_system_prompt"))
	}
}

/**
 * Handles the updatePrompt message.
 */
export async function handleUpdatePrompt(
	provider: MirrorProvider,
	promptMode?: string,
	customPrompt?: any,
): Promise<void> {
	if (promptMode && customPrompt !== undefined) {
		const existingPrompts = (provider.contextProxy.getValue("customModePrompts") ?? {}) as Record<string, unknown>
		const updatedPrompts = { ...existingPrompts, [promptMode]: customPrompt }
		await provider.contextProxy.setValue("customModePrompts", updatedPrompts as any)
		const currentState = await provider.getStateToPostToWebview()
		const stateWithPrompts = {
			...currentState,
			customModePrompts: updatedPrompts,
			hasOpenedModeSelector: currentState.hasOpenedModeSelector ?? false,
		} as any
		provider.postMessageToWebview({ type: "state", state: stateWithPrompts })
	}
}

/**
 * Handles the hasOpenedModeSelector message.
 */
export async function handleHasOpenedModeSelector(provider: MirrorProvider, bool?: boolean): Promise<void> {
	await provider.contextProxy.setValue("hasOpenedModeSelector", bool ?? true)
	await provider.postStateToWebview()
}

/**
 * Handles the updateTodoList message.
 */
export async function handleUpdateTodoList(message: WebviewMessage): Promise<void> {
	const { setPendingTodoList } = await import("../../../core/tools/UpdateTodoListTool")
	const payload = message.payload as { todos?: any[] }
	const todos = payload?.todos
	if (Array.isArray(todos)) {
		await setPendingTodoList(todos)
	}
}

/**
 * Handles the focusPanelRequest message.
 */
export async function handleFocusPanelRequest(): Promise<void> {
	const { getCommand } = await import("../../../utils/commands")
	await vscode.commands.executeCommand(getCommand("focusPanel"))
}

/**
 * Handles the switchTab message.
 */
export async function handleSwitchTab(provider: MirrorProvider, tab?: string, values?: any): Promise<void> {
	if (tab) {
		await provider.postMessageToWebview({
			type: "action",
			action: "switchTab",
			tab,
			values,
		})
	}
}

/**
 * Handles the insertTextIntoTextarea message.
 */
export async function handleInsertTextIntoTextarea(provider: MirrorProvider, text?: string): Promise<void> {
	if (text) {
		await provider.postMessageToWebview({
			type: "insertTextIntoTextarea",
			text,
		})
	}
}

/**
 * Handles the refreshCustomTools message.
 */
export async function handleRefreshCustomTools(provider: MirrorProvider): Promise<void> {
	try {
		const { getMirrorDirectoriesForCwd } = await import("../../../services/mirror-config/index.js")
		const { customToolRegistry } = await import("@mirror-vs/core")
		const { getCurrentCwd } = await import("./_helpers")
		const p = getCurrentCwd(provider)
		const toolDirs = getMirrorDirectoriesForCwd(p).map((dir: string) => require("path").join(dir, "tools"))
		await customToolRegistry.loadFromDirectories(toolDirs)

		await provider.postMessageToWebview({
			type: "customToolsResult",
			tools: customToolRegistry.getAllSerialized(),
		})
	} catch (error) {
		await provider.postMessageToWebview({
			type: "customToolsResult",
			tools: [],
			error: error instanceof Error ? error.message : String(error),
		})
	}
}

/**
 * Handles the openCustomModesSettings message.
 */
export async function handleOpenCustomModesSettings(provider: MirrorProvider): Promise<void> {
	const customModesFilePath = await provider.customModesManager.getCustomModesFilePath()

	if (customModesFilePath) {
		const { openFile } = await import("../../../integrations/misc/open-file")
		openFile(customModesFilePath)
	}
}

/**
 * Handles the openKeyboardShortcuts message.
 */
export async function handleOpenKeyboardShortcuts(text?: string): Promise<void> {
	const searchQuery = text || ""
	if (searchQuery) {
		await vscode.commands.executeCommand("workbench.action.openGlobalKeybindings", searchQuery)
	} else {
		await vscode.commands.executeCommand("workbench.action.openGlobalKeybindings")
	}
}

/**
 * Handles the acceptAllReviews message.
 */
export async function handleAcceptAllReviews(): Promise<void> {
	await vscode.commands.executeCommand("mirror-vs.acceptAllReviews")
}

/**
 * Handles the openMarkdownPreview message.
 */
export async function handleOpenMarkdownPreview(provider: MirrorProvider, text?: string): Promise<void> {
	if (text) {
		try {
			const os = await import("os")
			const path = await import("path")
			const fs = await import("fs/promises")
			const tmpDir = os.tmpdir()
			const timestamp = Date.now()
			const tempFileName = `mirror-preview-${timestamp}.md`
			const tempFilePath = path.join(tmpDir, tempFileName)

			await fs.writeFile(tempFilePath, text, "utf8")

			const doc = await vscode.workspace.openTextDocument(tempFilePath)
			await vscode.commands.executeCommand("markdown.showPreview", doc.uri)
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)
			provider.log(`Error opening markdown preview: ${errorMessage}`)
			vscode.window.showErrorMessage(`Failed to open markdown preview: ${errorMessage}`)
		}
	}
}

import * as vscode from "vscode"

import type { WebviewMessage } from "@mirror-vs/types"

import type { MirrorProvider } from "../MirrorProvider"
import { resolveIncomingImages } from "./_helpers"
import { t } from "../../../i18n"
import { TaskState } from "../../task/Task"

/**
 * Handles the webviewDidLaunch message - initializes custom modes, MCP, API config, theme.
 */
export async function handleWebviewDidLaunch(provider: MirrorProvider): Promise<void> {
	const customModes = await provider.customModesManager.getCustomModes()
	await provider.contextProxy.setValue("customModes", customModes)

	// Restore the persisted session ID so new tasks created during this session
	// inherit the same sessionId for history grouping.
	await provider.getOrCreateSession()

	// Restore the session's last active tab so the tab bar shows existing tabs
	// from the current session. The task is created idle (startTask: false)
	// so no AI loop runs — the user can interact with it by clicking.
	await provider.restoreSessionTabs()

	// If no tabs were restored (e.g. fresh session or all tabs were closed),
	// ensure a clean idle task exists ready to receive user messages.
	if (provider.mirrorStack.length === 0) {
		await provider.createTask("", [], undefined, {}, {})
	}

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

		// ── New session from TabBar "+" ──────────────────────────────────────
		// When the user clicks "+" in the tab bar, the intent is to create a
		// brand-new session with a fresh idle tab.  Detect this by checking for
		// empty text, no images, and no sessionMode (TabBar never sets it).
		//
		// Steps:
		//   1. Create a new session (generates a fresh sessionId)
		//   2. Create an idle task in that session
		//   3. Post invoke:newChat so the webview switches to the new tab
		const isEmptyTabCreation =
			!resolved.text?.trim() && (!resolved.images || resolved.images.length === 0) && !message.sessionMode

		if (isEmptyTabCreation) {
			// Do not allow creating multiple empty tabs.
			// Switch to the existing empty tab if one is already present on the stack.
			const allTasks = provider.getAllTasksSorted()
			const emptyTask = allTasks.find((t) => t.mirrorMessages.length === 0)

			if (emptyTask) {
				provider.log(
					`[handleNewTask] Found existing empty tab ${emptyTask.taskId} — switching instead of creating a new one`,
				)
				await provider.switchToTask(emptyTask.taskId)
				await provider.postStateToWebview()
				return
			}

			// Use existing session if one exists; otherwise create a new one.
			// This ensures clicking "+" adds a tab to the current session
			// instead of creating a separate session for each new tab.
			await provider.getOrCreateSession()
			await provider.createTask("", [], undefined, { taskId: message.taskId }, message.taskConfiguration)
			await provider.postStateToWebview()
			await provider.postMessageToWebview({ type: "invoke", invoke: "newChat" })
			return
		}

		// ── Idle task detection ───────────────────────────────────────────────
		// When the user clicks "+" in the tab bar, an empty idle task is created
		// (_started remains false, state is TaskState.Idle). If the user then
		// types and sends a message in that tab, we detect here that the current
		// task is idle and start it with content instead of creating a second task.
		//
		// IMPORTANT: Do NOT post "invoke: newChat" here — startWithContent()
		// already triggers a natural state update via startTask() → say(),
		// and posting newChat would race with handleChatReset() clearing state
		// that the user just populated.
		// When the user clicks "+", an empty newTask message is sent.
		// Only start the idle task if there's actual content to send —
		// otherwise clicking "+" a second time would start the previous
		// idle tab with an empty message.
		if (
			currentTask &&
			!currentTask._started &&
			currentTask.state === TaskState.Idle &&
			(resolved.text?.trim() || (resolved.images && resolved.images.length > 0))
		) {
			await currentTask.startWithContent(resolved.text, resolved.images)
			return
		}

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
	} catch (error) {
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

export async function handleRenameTask(provider: MirrorProvider, taskId?: string, taskName?: string): Promise<void> {
	if (taskId && taskName !== undefined) {
		await provider.renameTask(taskId, taskName)
	}
}

/**
 * Handles the branchTaskToWorkspace message.
 */
export async function handleBranchTaskToWorkspace(provider: MirrorProvider, message: WebviewMessage): Promise<void> {
	const payload = message.payload as { taskId?: string; targetWorkspacePath?: string; title?: string } | undefined
	let targetPath = payload?.targetWorkspacePath || message.text

	// If no target path was passed, prompt user with VS Code folder picker
	if (!targetPath) {
		const selected = await vscode.window.showOpenDialog({
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
			openLabel: "Select Workspace for Branch",
		})
		if (!selected || selected.length === 0) return
		targetPath = selected[0].fsPath
	}

	const sourceTaskId = payload?.taskId || provider.getCurrentTask()?.taskId
	if (!sourceTaskId) return

	try {
		await provider.branchTaskToWorkspace(sourceTaskId, targetPath, payload?.title)
	} catch (error) {
		vscode.window.showErrorMessage(
			`Failed to branch task to workspace: ${error instanceof Error ? error.message : String(error)}`,
		)
	}
}

/**
 * Handles the updateSessionNotes message — persists user-curated notes for a
 * session via SessionContextManager.setSessionNotes.
 */
export async function handleUpdateSessionNotes(
	provider: MirrorProvider,
	sessionId?: string,
	notes?: string,
): Promise<void> {
	if (sessionId && notes !== undefined) {
		await provider.getSessionContextManager().setSessionNotes(sessionId, notes)
		// Refresh the webview so the saved notes are reflected in the UI.
		await provider.postStateToWebview()
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
	const currentTask = provider.getLiveTask ? provider.getLiveTask(message.taskId) : provider.getCurrentTask?.()
	if (currentTask) {
		const lastMsg = currentTask.mirrorMessages?.at(-1)
		const isWaitingOnAsk = currentTask.askResponse === undefined
		const isButtonResponse = message.askResponse === "yesButtonClicked" || message.askResponse === "noButtonClicked"
		const hasPendingAsk =
			currentTask.idleAsk !== undefined ||
			currentTask.resumableAsk !== undefined ||
			currentTask.interactiveAsk !== undefined

		console.log(
			`[handleAskResponse] taskId=${currentTask.taskId} askResponse=${message.askResponse} ` +
				`isWaitingOnAsk=${isWaitingOnAsk} isButtonResponse=${isButtonResponse} hasPendingAsk=${hasPendingAsk} ` +
				`lastMsgType=${lastMsg?.type} lastMsgAsk=${lastMsg?.ask} started=${(currentTask as any)._started}`,
		)

		if (isWaitingOnAsk || isButtonResponse || hasPendingAsk || !currentTask.startWithContent) {
			currentTask.handleWebviewAskResponse(message.askResponse!, resolved.text, resolved.images)
		} else if (!(currentTask as any)._started) {
			await currentTask.startWithContent(resolved.text, resolved.images)
		} else {
			// If task is started and has no active ask (e.g. background terminal running),
			// inject as an in-between steering message so the model receives and considers it immediately.
			if (resolved.text || (resolved.images && resolved.images.length > 0)) {
				await currentTask.injectInBetweenMessage(resolved.text ?? "", resolved.images, "user_feedback")
			}
		}
	}
}

/**
 * Handles the terminalOperation message.
 */
export async function handleTerminalOperation(
	provider: MirrorProvider,
	terminalOp?: "continue" | "abort",
	message?: WebviewMessage,
): Promise<void> {
	if (terminalOp) {
		const targetTask = provider.getLiveTask ? provider.getLiveTask(message?.taskId) : provider.getCurrentTask?.()
		targetTask?.handleTerminalOperation(terminalOp)
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
		// Kill SSH session — find the matching session by deterministic negative hash
		const { SshSessionRegistry } = await import("../../tools/helpers/SshSessionRegistry")
		const sessions = SshSessionRegistry.getSessions()
		for (const { taskId, host, port } of sessions) {
			const computedId =
				-Math.abs(host.split("").reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0) + port) || -1
			if (computedId === terminalId && taskId) {
				SshSessionRegistry.removeSession(taskId, host, port)
				break
			}
		}
		// Also abort the current task's terminal process to resolve Promise.race
		const task = provider.getCurrentTask?.()
		if (task) {
			task.handleTerminalOperation("abort")
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
	await provider.createSession()
	while (provider.mirrorStack.length > 0) {
		await provider.removeMirrorFromStack()
	}
	await provider.createTask("", [])
	await provider.postStateToWebview()
	await provider.postMessageToWebview({ type: "invoke", invoke: "newChat" })
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
 * Handles the switchTaskTab message — switches the active task tab.
 * The frontend sends this when the user clicks on a different tab.
 */
export async function handleSwitchTaskTab(provider: MirrorProvider, taskId?: string): Promise<void> {
	if (taskId) {
		await provider.switchToTask(taskId)
	}
}

/**
 * Handles the closeTaskTab message — closes a task tab.
 * The frontend is expected to have already confirmed with the user before
 * sending this message. This method does NOT prompt for confirmation.
 */
export async function handleCloseTaskTab(provider: MirrorProvider, taskId?: string): Promise<void> {
	if (taskId) {
		await provider.closeTask(taskId)
	}
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

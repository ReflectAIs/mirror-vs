/**
 * messageRouter.ts — Thin delegation layer for webview messages.
 *
 * Routes each WebviewMessage type to the appropriate domain handler,
 * correctly destructuring message properties to match each handler's
 * parameter signature.  Complex inline cases that were not extracted
 * to standalone handlers remain here.
 */

import * as vscode from "vscode"

import type { WebviewMessage } from "@mirror-vs/types"

import type { MirrorProvider } from "./MirrorProvider"

// ── Task handlers ──────────────────────────────────────────────
import {
	handleWebviewDidLaunch,
	handleNewTask,
	handleRenameSession,
	handleAskResponse,
	handleTerminalOperation,
	handleKillTerminal,
	handleClearTask,
	handleDidShowAnnouncement,
	handleSelectImages,
	handleExportCurrentTask,
	handleDeleteMultipleTasksWithIds,
	handleGetTaskWithAggregatedCosts,
	handleModeSwitch,
	handleEnhancePrompt,
	handleGetSystemPrompt,
	handleCopySystemPrompt,
	handleUpdatePrompt,
	handleHasOpenedModeSelector,
	handleUpdateTodoList,
	handleFocusPanelRequest,
	handleSwitchTab,
	handleInsertTextIntoTextarea,
	handleRefreshCustomTools,
	handleOpenCustomModesSettings,
	handleOpenKeyboardShortcuts,
	handleOpenMarkdownPreview,
} from "./handlers/taskHandler"

// ── Settings handlers ──────────────────────────────────────────
import {
	handleUpdateSettings,
	handleTtsEnabled,
	handleTtsSpeed,
	handlePlayTts,
	handleUpdateVSCodeSetting,
	handleGetVSCodeSetting,
	handleAllowedCommands,
	handleDeniedCommands,
	handleDebugSetting,
} from "./handlers/settingsHandler"

// ── API Config handlers ────────────────────────────────────────
import {
	handleSaveApiConfiguration,
	handleUpsertApiConfiguration,
	handleRenameApiConfiguration,
	handleLoadApiConfiguration,
	handleLoadApiConfigurationById,
	handleDeleteApiConfiguration,
	handleGetListApiConfiguration,
	handleModelChange,
	handleLockApiConfigAcrossModes,
	handleToggleApiConfigPin,
	handleEnhancementApiConfigId,
	handleAutoApprovalEnabled,
	handleImportSettings,
	handleExportSettings,
} from "./handlers/apiConfigHandler"

// ── Model handlers ─────────────────────────────────────────────
import {
	handleFlushRouterModels,
	handleRequestRouterModels,
	handleRequestOllamaModels,
	handleRequestLmStudioModels,
	handleRequestOpenAiModels,
	handleRequestVsCodeLmModels,
} from "./handlers/modelHandler"

// ── MCP handlers ───────────────────────────────────────────────
import {
	handleOpenMcpSettings,
	handleOpenProjectMcpSettings,
	handleDeleteMcpServer,
	handleRestartMcpServer,
	handleToggleToolAlwaysAllow,
	handleToggleToolEnabledForPrompt,
	handleToggleMcpServer,
	handleRefreshAllMcpServers,
	handleUpdateMcpTimeout,
} from "./handlers/mcpHandler"

// ── Message Edit / Delete handlers ─────────────────────────────
import {
	handleDeleteOperation,
	handleDeleteMessageConfirm,
	handleEditOperation,
	handleEditMessageConfirm,
} from "./handlers/messageEditHandler"

// ── Custom Modes handlers ──────────────────────────────────────
import {
	handleUpdateCustomMode,
	handleDeleteCustomMode,
	handleExportMode,
	handleImportMode,
	handleCheckRulesDirectory,
} from "./handlers/modeHandler"

// ── Code Index handlers ────────────────────────────────────────
import {
	handleSaveCodeIndexSettingsAtomic,
	handleRequestIndexingStatus,
	handleRequestCodeIndexSecretStatus,
	handleStartIndexing,
	handleStopIndexing,
	handleToggleWorkspaceIndexing,
	handleSetAutoEnableDefault,
	handleClearIndexData,
} from "./handlers/codeIndexHandler"

// ── Command handlers ───────────────────────────────────────────
import {
	handleRequestCommands,
	handleOpenCommandFile,
	handleDeleteCommand,
	handleCreateCommand,
	handleRequestModes,
} from "./handlers/commandHandler"

// ── File handlers ──────────────────────────────────────────────
import { handleOpenFile, handleReadFileContent, handleSaveImage, handleOpenExternal } from "./handlers/fileHandler"

// ── Utilities for inline handlers ─────────────────────────────
import { openImage } from "../../integrations/misc/image-handler"
import { openMention } from "../mentions"
import { stopTts } from "../../utils/tts"
import { Mode } from "../../shared/modes"
import { getCurrentCwd } from "./handlers/_helpers"

// ── Auth handlers ──────────────────────────────────────────────
import {
	handleOpenAiCodexSignIn,
	handleOpenAiCodexSignOut,
	handleRequestOpenAiCodexRateLimits,
} from "./handlers/authHandler"

// ── Checkpoint handlers ────────────────────────────────────────
import { handleCheckpointDiff, handleCheckpointRestore } from "./handlers/checkpointHandler"

// ── Debug handlers ─────────────────────────────────────────────
import { handleOpenDebugHistory, handleDownloadErrorDiagnostics } from "./handlers/debugHandler"

// ── Queue handlers ─────────────────────────────────────────────
import { handleQueueMessage, handleRemoveQueuedMessage, handleEditQueuedMessage } from "./handlers/queueHandler"

// ── Upsell handlers ────────────────────────────────────────────
import { handleDismissUpsell, handleGetDismissedUpsells } from "./handlers/upsellHandler"

// ── Skills handlers ────────────────────────────────────────────
import {
	handleRequestSkills,
	handleCreateSkill,
	handleDeleteSkill,
	handleMoveSkill,
	handleUpdateSkillModes,
	handleOpenSkillFile,
} from "./skillsMessageHandler"

// ── Pipeline handlers ──────────────────────────────────────────
import {
	handleRequestPipelines,
	handleImportPipeline,
	handleDeletePipeline,
	handleSetDefaultPipeline,
	handleSetComfyuiDefaultPipeline,
	handleHidePipeline,
	handleUnhidePipeline,
	handleRequestHardwareProfile,
	handleSaveSecureTokens,
	handleSaveSettings,
	handleRequestAllowlists,
	handleUpdateAllowlists,
	handleScanComfyuiWorkflows,
	handleImportComfyuiWorkflows,
	handleDeleteComfyuiWorkflow,
} from "./handlers/pipelineMessageHandler"

// ── Worktree handlers ──────────────────────────────────────────
import {
	handleListWorktrees,
	handleCreateWorktree,
	handleDeleteWorktree,
	handleSwitchWorktree,
	handleGetAvailableBranches,
	handleGetWorktreeDefaults,
	handleGetWorktreeIncludeStatus,
	handleCheckBranchWorktreeInclude,
	handleCreateWorktreeInclude,
	handleCheckoutBranch,
} from "./worktree"

/**
 * Routes a webview message to the appropriate handler.
 * Small/inline operations are handled directly; complex cases
 * delegate to domain-specific handler files.
 */
export async function routeMessage(provider: MirrorProvider, message: WebviewMessage): Promise<void> {
	switch (message.type) {
		// ── App Init ────────────────────────────────────────
		case "webviewDidLaunch":
			await handleWebviewDidLaunch(provider)
			break

		// ── Tasks ───────────────────────────────────────────
		case "newTask":
			await handleNewTask(provider, message)
			break
		case "renameSession":
			await handleRenameSession(provider, message.sessionId, message.sessionName)
			break
		case "customInstructions":
			await provider.updateCustomInstructions(message.text)
			break
		case "askResponse":
			await handleAskResponse(provider, message)
			break
		case "terminalOperation":
			await handleTerminalOperation(provider, message.terminalOperation)
			break
		case "killTerminal":
			await handleKillTerminal(provider, message.terminalId, message.terminalType)
			break
		case "clearTask":
			await handleClearTask(provider)
			break
		case "didShowAnnouncement":
			await handleDidShowAnnouncement(provider)
			break
		case "selectImages":
			await handleSelectImages(provider, message.context, message.messageTs)
			break
		case "exportCurrentTask":
			await handleExportCurrentTask(provider)
			break
		case "exportTaskWithId":
			provider.exportTaskWithId(message.text!)
			break
		case "showTaskWithId":
			provider.showTaskWithId(message.text!)
			break
		case "condenseTaskContextRequest":
			provider.condenseTaskContext(message.text!)
			break
		case "deleteTaskWithId":
			provider.deleteTaskWithId(message.text!)
			break
		case "deleteMultipleTasksWithIds":
			await handleDeleteMultipleTasksWithIds(provider, message.ids)
			break
		case "getTaskWithAggregatedCosts":
			await handleGetTaskWithAggregatedCosts(provider, message.text)
			break

		// ── Mode switching ──────────────────────────────────
		case "switchMode":
		case "mode":
			await handleModeSwitch(provider, message.text as string)
			break
		case "enhancePrompt":
			await handleEnhancePrompt(provider, message.text)
			break
		case "enhanceImagePrompt":
			await handleEnhancePrompt(provider, message.text, true)
			break
		case "getSystemPrompt":
			await handleGetSystemPrompt(provider, message)
			break
		case "copySystemPrompt":
			await handleCopySystemPrompt(provider, message)
			break
		case "updatePrompt":
			await handleUpdatePrompt(provider, message.promptMode, message.customPrompt)
			break
		case "hasOpenedModeSelector":
			await handleHasOpenedModeSelector(provider, message.bool)
			break

		// ── Todo list / Focus / Tab / Textarea ──────────────
		case "updateTodoList":
			await handleUpdateTodoList(message)
			break
		case "focusPanelRequest":
			await handleFocusPanelRequest()
			break
		case "switchTab":
			await handleSwitchTab(provider, message.tab, message.values)
			break
		case "insertTextIntoTextarea":
			await handleInsertTextIntoTextarea(provider, message.text)
			break

		// ── Custom tools / modes / shortcuts ────────────────
		case "refreshCustomTools":
			await handleRefreshCustomTools(provider)
			break
		case "openCustomModesSettings":
			await handleOpenCustomModesSettings(provider)
			break
		case "openKeyboardShortcuts":
			await handleOpenKeyboardShortcuts(message.text)
			break
		case "openMarkdownPreview":
			await handleOpenMarkdownPreview(provider, message.text)
			break

		// ── Settings ────────────────────────────────────────
		case "updateSettings":
			await handleUpdateSettings(provider, message.updatedSettings ?? {})
			break
		case "ttsEnabled":
			await handleTtsEnabled(provider, message.bool)
			break
		case "ttsSpeed":
			await handleTtsSpeed(provider, message.value)
			break
		case "playTts":
			await handlePlayTts(provider, message.text)
			break
		case "stopTts":
			stopTts()
			break
		case "updateVSCodeSetting":
			await handleUpdateVSCodeSetting(message.setting, message.value)
			break
		case "getVSCodeSetting":
			await handleGetVSCodeSetting(provider, message.setting)
			break
		case "allowedCommands":
			await handleAllowedCommands(provider, message.commands)
			break
		case "deniedCommands":
			await handleDeniedCommands(provider, message.commands)
			break
		case "debugSetting":
			await handleDebugSetting(provider, message.bool)
			break

		// ── API Configuration ───────────────────────────────
		case "saveApiConfiguration":
			await handleSaveApiConfiguration(provider, message.text, message.apiConfiguration)
			break
		case "upsertApiConfiguration":
			await handleUpsertApiConfiguration(provider, message.text, message.apiConfiguration)
			break
		case "renameApiConfiguration":
			await handleRenameApiConfiguration(provider, message.values, message.apiConfiguration)
			break
		case "loadApiConfiguration":
			await handleLoadApiConfiguration(provider, message.text)
			break
		case "loadApiConfigurationById":
			await handleLoadApiConfigurationById(provider, message.text)
			break
		case "deleteApiConfiguration":
			await handleDeleteApiConfiguration(provider, message.text)
			break
		case "getListApiConfiguration":
			await handleGetListApiConfiguration(provider)
			break
		case "modelChange":
			await handleModelChange(provider, message.apiConfiguration)
			break
		case "lockApiConfigAcrossModes":
			await handleLockApiConfigAcrossModes(provider, message.bool)
			break
		case "toggleApiConfigPin":
			await handleToggleApiConfigPin(provider, message.text)
			break
		case "enhancementApiConfigId":
			await handleEnhancementApiConfigId(provider, message.text)
			break
		case "autoApprovalEnabled":
			await handleAutoApprovalEnabled(provider, message.bool)
			break
		case "importSettings":
			await handleImportSettings(provider)
			break
		case "exportSettings":
			await handleExportSettings(provider)
			break
		case "resetState":
			await provider.resetState()
			break

		// ── Models ──────────────────────────────────────────
		case "flushRouterModels":
			await handleFlushRouterModels(provider, message.text)
			break
		case "requestRouterModels":
			await handleRequestRouterModels(provider, message)
			break
		case "requestOllamaModels":
			await handleRequestOllamaModels(provider)
			break
		case "requestLmStudioModels":
			await handleRequestLmStudioModels(provider)
			break
		case "requestOpenAiModels":
			await handleRequestOpenAiModels(provider, message)
			break
		case "requestVsCodeLmModels":
			await handleRequestVsCodeLmModels(provider)
			break

		// ── MCP ─────────────────────────────────────────────
		case "openMcpSettings":
			await handleOpenMcpSettings(provider)
			break
		case "openProjectMcpSettings":
			await handleOpenProjectMcpSettings(provider)
			break
		case "deleteMcpServer":
			await handleDeleteMcpServer(provider, message.serverName, message.source)
			break
		case "restartMcpServer":
			await handleRestartMcpServer(provider, message.serverName, message.source)
			break
		case "toggleToolAlwaysAllow":
			await handleToggleToolAlwaysAllow(provider, message)
			break
		case "toggleToolEnabledForPrompt":
			await handleToggleToolEnabledForPrompt(provider, message)
			break
		case "toggleMcpServer":
			await handleToggleMcpServer(provider, message)
			break
		case "refreshAllMcpServers":
			await handleRefreshAllMcpServers(provider)
			break
		case "updateMcpTimeout":
			await handleUpdateMcpTimeout(provider, message.serverName, message.timeout, message.source)
			break

		// ── Message Edit / Delete ───────────────────────────
		case "deleteMessage": {
			if (provider.getCurrentTask() && typeof message.value === "number" && message.value) {
				await handleDeleteOperation(provider, message.value)
			}
			break
		}
		case "revertHistory": {
			const { messageTs, inclusive } = message
			if (!messageTs) {
				break
			}
			const currentMirror = provider.getCurrentTask()
			if (!currentMirror) {
				break
			}
			const { findMessageIndices } = await import("./handlers/_helpers")
			const { messageIndex } = findMessageIndices(messageTs, currentMirror)
			if (messageIndex === -1) {
				break
			}
			await provider.cancelTask()

			const sliceIndex = inclusive ? messageIndex + 1 : messageIndex
			const deletedHistory = currentMirror.mirrorMessages.slice(sliceIndex)

			// Auto-revert any checkpoints in the deleted history
			for (let i = deletedHistory.length - 1; i >= 0; i--) {
				const msg = deletedHistory[i]
				if (msg.say === "checkpoint_saved" && msg.text) {
					try {
						const { getCheckpointService } = await import("../checkpoints")
						const service = await getCheckpointService(currentMirror)
						if (service) {
							await service.restoreCheckpoint(msg.text)
							vscode.window.showInformationMessage(`Reverted changes to checkpoint: ${msg.text}`)
						}
					} catch (e) {
						console.error("Failed to auto-revert checkpoint:", e)
					}
				}
			}

			currentMirror.mirrorMessages = currentMirror.mirrorMessages.slice(0, sliceIndex)

			const { saveTaskMessages } = await import("../task-persistence")
			await saveTaskMessages({
				messages: currentMirror.mirrorMessages,
				taskId: currentMirror.taskId,
				globalStoragePath: provider.contextProxy.globalStorageUri.fsPath,
			})

			await provider.postStateToWebview()
			break
		}
		case "submitEditedMessage": {
			if (
				provider.getCurrentTask() &&
				typeof message.value === "number" &&
				message.value &&
				message.editedMessageContent
			) {
				await handleEditOperation(provider, message.value, message.editedMessageContent, message.images)
			}
			break
		}
		case "deleteMessageConfirm": {
			if (provider.getCurrentTask() && message.messageTs && typeof message.messageTs === "number") {
				await handleDeleteMessageConfirm(provider, message.messageTs, message.restoreCheckpoint)
			}
			break
		}
		case "editMessageConfirm": {
			if (
				provider.getCurrentTask() &&
				message.messageTs &&
				typeof message.messageTs === "number" &&
				message.text
			) {
				const { resolveIncomingImages } = await import("./handlers/_helpers")
				const resolved = await resolveIncomingImages(provider, { text: message.text, images: message.images })
				await handleEditMessageConfirm(
					provider,
					message.messageTs,
					resolved.text,
					message.restoreCheckpoint,
					resolved.images,
				)
			}
			break
		}

		// ── Custom Modes ────────────────────────────────────
		case "updateCustomMode":
			await handleUpdateCustomMode(provider, message)
			break
		case "deleteCustomMode":
			await handleDeleteCustomMode(provider, message)
			break
		case "exportMode":
			await handleExportMode(provider, message)
			break
		case "importMode":
			await handleImportMode(provider, message)
			break
		case "checkRulesDirectory":
			await handleCheckRulesDirectory(provider, message)
			break

		// ── Code Index ──────────────────────────────────────
		case "saveCodeIndexSettingsAtomic":
			await handleSaveCodeIndexSettingsAtomic(provider, message)
			break
		case "requestIndexingStatus":
			await handleRequestIndexingStatus(provider)
			break
		case "requestCodeIndexSecretStatus":
			await handleRequestCodeIndexSecretStatus(provider)
			break
		case "startIndexing":
			await handleStartIndexing(provider)
			break
		case "stopIndexing":
			await handleStopIndexing(provider)
			break
		case "toggleWorkspaceIndexing":
			await handleToggleWorkspaceIndexing(provider, message)
			break
		case "setAutoEnableDefault":
			await handleSetAutoEnableDefault(provider, message)
			break
		case "clearIndexData":
			await handleClearIndexData(provider)
			break

		// ── Commands & Skills ───────────────────────────────
		case "requestCommands":
			await handleRequestCommands(provider)
			break
		case "requestModes":
			await handleRequestModes(provider)
			break
		case "requestSkills":
			await handleRequestSkills(provider)
			break
		case "createSkill":
			await handleCreateSkill(provider, message)
			break
		case "deleteSkill":
			await handleDeleteSkill(provider, message)
			break
		case "moveSkill":
			await handleMoveSkill(provider, message)
			break
		case "updateSkillModes":
			await handleUpdateSkillModes(provider, message)
			break
		case "openSkillFile":
			await handleOpenSkillFile(provider, message)
			break

		// ── Pipelines ───────────────────────────────────────
		case "requestPipelines":
			await handleRequestPipelines(provider)
			break
		case "importPipeline":
			await handleImportPipeline(provider, message)
			break
		case "deletePipeline":
			await handleDeletePipeline(provider, message)
			break
		case "setDefaultPipeline":
			await handleSetDefaultPipeline(provider, message)
			break

		case "setComfyuiDefaultPipeline":
			await handleSetComfyuiDefaultPipeline(provider, message)
			break

		case "hidePipeline":
			await handleHidePipeline(provider, message)
			break
		case "unhidePipeline":
			await handleUnhidePipeline(provider, message)
			break

		case "requestHardwareProfile":
			await handleRequestHardwareProfile(provider)
			break

		case "saveSecureTokens":
			await handleSaveSecureTokens(provider, message)
			break

		case "saveSettings":
			await handleSaveSettings(provider, message)
			break

		case "requestAllowlists":
			await handleRequestAllowlists(provider)
			break

		case "updateAllowlists":
			await handleUpdateAllowlists(provider, message)
			break

		case "scanComfyuiWorkflows":
			await handleScanComfyuiWorkflows(provider)
			break

		case "importComfyuiWorkflows":
			await handleImportComfyuiWorkflows(provider, message)
			break

		case "deleteComfyuiWorkflow":
			await handleDeleteComfyuiWorkflow(provider, message)
			break

		case "openCommandFile":
			await handleOpenCommandFile(provider, message)
			break
		case "deleteCommand":
			await handleDeleteCommand(provider, message)
			break
		case "createCommand":
			await handleCreateCommand(provider, message)
			break

		// ── Files ───────────────────────────────────────────
		case "saveImage":
			await handleSaveImage(provider, message)
			break
		case "openImage":
			openImage(message.text!, { values: message.values })
			break
		case "openFile":
			await handleOpenFile(provider, message)
			break
		case "readFileContent":
			await handleReadFileContent(provider, message)
			break
		case "openExternal":
			await handleOpenExternal(provider, message)
			break
		case "openMention":
			openMention(getCurrentCwd(provider), message.text)
			break

		// ── Auth ────────────────────────────────────────────
		case "openAiCodexSignIn":
			await handleOpenAiCodexSignIn(provider)
			break
		case "openAiCodexSignOut":
			await handleOpenAiCodexSignOut(provider)
			break
		case "requestOpenAiCodexRateLimits":
			await handleRequestOpenAiCodexRateLimits(provider)
			break

		// ── Checkpoints ─────────────────────────────────────
		case "checkpointDiff":
			await handleCheckpointDiff(provider, message)
			break
		case "checkpointRestore":
			await handleCheckpointRestore(provider, message)
			break

		// ── Debug ───────────────────────────────────────────
		case "openDebugApiHistory":
		case "openDebugUiHistory":
			await handleOpenDebugHistory(provider, message)
			break
		case "downloadErrorDiagnostics":
			await handleDownloadErrorDiagnostics(provider, message)
			break

		// ── Queue ───────────────────────────────────────────
		case "queueMessage":
			await handleQueueMessage(provider, message)
			break
		case "removeQueuedMessage":
			await handleRemoveQueuedMessage(provider, message)
			break
		case "editQueuedMessage":
			await handleEditQueuedMessage(provider, message)
			break

		// ── Upsell ──────────────────────────────────────────
		case "dismissUpsell":
			await handleDismissUpsell(provider, message)
			break
		case "getDismissedUpsells":
			await handleGetDismissedUpsells(provider)
			break

		// ── Search ──────────────────────────────────────────
		case "searchFiles": {
			const { searchWorkspaceFiles } = await import("../../services/search/file-search")
			const { getCurrentCwd } = await import("./handlers/_helpers")
			const workspacePath = getCurrentCwd(provider)

			if (!workspacePath) {
				await provider.postMessageToWebview({
					type: "fileSearchResults",
					results: [],
					requestId: message.requestId,
					error: "No workspace path available",
				})
				break
			}
			try {
				const results = await searchWorkspaceFiles(message.query || "", workspacePath, 20)

				const currentTask = provider.getCurrentTask()
				let mirrorIgnoreController = currentTask?.mirrorIgnoreController
				let tempController: any

				if (!mirrorIgnoreController) {
					const { MirrorIgnoreController } = await import("../ignore/MirrorIgnoreController")
					tempController = new MirrorIgnoreController(workspacePath)
					await tempController.initialize()
					mirrorIgnoreController = tempController
				}

				try {
					const { showMirrorIgnoredFiles = false } = (await provider.getState()) ?? {}

					let filteredResults = results
					if (!showMirrorIgnoredFiles && mirrorIgnoreController) {
						const allowedPaths = mirrorIgnoreController.filterPaths(results.map((r: any) => r.path))
						filteredResults = results.filter((r: any) => allowedPaths.includes(r.path))
					}

					await provider.postMessageToWebview({
						type: "fileSearchResults",
						results: filteredResults,
						requestId: message.requestId,
					})
				} finally {
					tempController?.dispose()
				}
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error)
				await provider.postMessageToWebview({
					type: "fileSearchResults",
					results: [],
					error: errorMessage,
					requestId: message.requestId,
				})
			}
			break
		}

		// ── Simple operations (inlined) ─────────────────────
		case "cancelTask":
			await provider.cancelTask()
			break
		case "cancelAutoApproval":
			provider.getCurrentTask()?.cancelAutoApprovalTimeout()
			break
		case "acceptAllReviews":
			await vscode.commands.executeCommand("mirror-vs.acceptAllReviews")
			break

		case "searchCommits": {
			const { searchCommits } = await import("../../utils/git")
			const { getCurrentCwd } = await import("./handlers/_helpers")
			const cwd = getCurrentCwd(provider)
			const searchResults = await searchCommits(cwd, message.query ?? "")
			await provider.postMessageToWebview({
				type: "commitSearchResults",
				results: searchResults as any,
			})
			break
		}

		// ── Worktrees ────────────────────────────────────────
		case "listWorktrees": {
			try {
				const { worktrees, isGitRepo, isMultiRoot, isSubfolder, gitRootPath, error } =
					await handleListWorktrees(provider)

				await provider.postMessageToWebview({
					type: "worktreeList",
					worktrees,
					isGitRepo,
					isMultiRoot,
					isSubfolder,
					gitRootPath,
					error,
				})
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error)

				await provider.postMessageToWebview({
					type: "worktreeList",
					worktrees: [],
					isGitRepo: false,
					isMultiRoot: false,
					isSubfolder: false,
					gitRootPath: "",
					error: errorMessage,
				})
			}

			break
		}

		case "createWorktree": {
			try {
				const { success, message: text } = await handleCreateWorktree(
					provider,
					{
						path: message.worktreePath!,
						branch: message.worktreeBranch,
						baseBranch: message.worktreeBaseBranch,
						createNewBranch: message.worktreeCreateNewBranch,
					},
					(progress) => {
						provider.postMessageToWebview({
							type: "worktreeCopyProgress",
							copyProgressBytesCopied: progress.bytesCopied,
							copyProgressItemName: progress.itemName,
						})
					},
				)

				await provider.postMessageToWebview({ type: "worktreeResult", success, text })
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error)
				await provider.postMessageToWebview({ type: "worktreeResult", success: false, text: errorMessage })
			}

			break
		}

		case "deleteWorktree": {
			try {
				const { success, message: text } = await handleDeleteWorktree(
					provider,
					message.worktreePath!,
					message.worktreeForce ?? false,
				)

				await provider.postMessageToWebview({ type: "worktreeResult", success, text })
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error)
				await provider.postMessageToWebview({ type: "worktreeResult", success: false, text: errorMessage })
			}

			break
		}

		case "switchWorktree": {
			try {
				const { success, message: text } = await handleSwitchWorktree(
					provider,
					message.worktreePath!,
					message.worktreeNewWindow ?? true,
				)

				await provider.postMessageToWebview({ type: "worktreeResult", success, text })
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error)
				await provider.postMessageToWebview({ type: "worktreeResult", success: false, text: errorMessage })
			}

			break
		}

		case "getAvailableBranches": {
			try {
				const { localBranches, remoteBranches, currentBranch } = await handleGetAvailableBranches(provider)

				await provider.postMessageToWebview({
					type: "branchList",
					localBranches,
					remoteBranches,
					currentBranch,
				})
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error)

				await provider.postMessageToWebview({
					type: "branchList",
					localBranches: [],
					remoteBranches: [],
					currentBranch: "",
					error: errorMessage,
				})
			}

			break
		}

		case "getWorktreeDefaults": {
			try {
				const { suggestedBranch, suggestedPath } = await handleGetWorktreeDefaults(provider)
				await provider.postMessageToWebview({ type: "worktreeDefaults", suggestedBranch, suggestedPath })
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error)

				await provider.postMessageToWebview({
					type: "worktreeDefaults",
					suggestedBranch: "",
					suggestedPath: "",
					error: errorMessage,
				})
			}

			break
		}

		case "getWorktreeIncludeStatus": {
			try {
				const worktreeIncludeStatus = await handleGetWorktreeIncludeStatus(provider)
				await provider.postMessageToWebview({ type: "worktreeIncludeStatus", worktreeIncludeStatus })
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error)

				await provider.postMessageToWebview({
					type: "worktreeIncludeStatus",
					worktreeIncludeStatus: {
						exists: false,
						hasGitignore: false,
						gitignoreContent: undefined,
					},
					error: errorMessage,
				})
			}

			break
		}

		case "checkBranchWorktreeInclude": {
			try {
				const branch = message.worktreeBranch
				if (!branch) {
					await provider.postMessageToWebview({
						type: "branchWorktreeIncludeResult",
						hasWorktreeInclude: false,
						error: "No branch specified",
					})
					break
				}
				const hasWorktreeInclude = await handleCheckBranchWorktreeInclude(provider, branch)
				await provider.postMessageToWebview({
					type: "branchWorktreeIncludeResult",
					branch,
					hasWorktreeInclude,
				})
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error)
				await provider.postMessageToWebview({
					type: "branchWorktreeIncludeResult",
					hasWorktreeInclude: false,
					error: errorMessage,
				})
			}

			break
		}

		case "createWorktreeInclude": {
			try {
				const { success, message: text } = await handleCreateWorktreeInclude(
					provider,
					message.worktreeIncludeContent ?? "",
				)

				await provider.postMessageToWebview({ type: "worktreeResult", success, text })
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error)
				provider.log(`Error creating worktree include: ${errorMessage}`)
				await provider.postMessageToWebview({ type: "worktreeResult", success: false, text: errorMessage })
			}

			break
		}

		case "checkoutBranch": {
			try {
				const { success, message: text } = await handleCheckoutBranch(provider, message.worktreeBranch!)
				await provider.postMessageToWebview({ type: "worktreeResult", success, text })
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error)
				await provider.postMessageToWebview({ type: "worktreeResult", success: false, text: errorMessage })
			}

			break
		}

		case "browseForWorktreePath": {
			const { t } = await import("../../i18n")
			try {
				const options: vscode.OpenDialogOptions = {
					canSelectFiles: false,
					canSelectFolders: true,
					canSelectMany: false,
					openLabel: t("worktrees:selectWorktreeLocation"),
					title: t("worktrees:selectFolderForWorktree"),
					defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri
						? vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, "..")
						: undefined,
				}

				const result = await vscode.window.showOpenDialog(options)
				if (result && result[0]) {
					await provider.postMessageToWebview({
						type: "folderSelected",
						path: result[0].fsPath,
					})
				}
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error)
				provider.log(`Error opening folder picker: ${errorMessage}`)
			}
			break
		}

		// ── Image Generation Auto-Setup ─────────────────────
		case "requestImageProviderModels": {
			// Webview requests dynamic model list from a local image provider (e.g. comfyui)
			// Query the running server and return only actually-installed models.
			const providerKey = message.text as string
			console.log(`[messageRouter] requestImageProviderModels for "${providerKey}"`)
			if (providerKey) {
				try {
					const { ImageProviderRegistry } = await import("../../api/image/registry")
					const imgProvider = ImageProviderRegistry.get(providerKey)
					if (imgProvider) {
						const models = await imgProvider.listModels()
						console.log(`[messageRouter]   ${providerKey} listModels returned ${models.length} models`)
						await provider.postMessageToWebview({
							type: "imageProviderModels",
							imageProviderModels: { [providerKey]: models },
						})
					} else {
						console.log(`[messageRouter]   provider "${providerKey}" not registered`)
						await provider.postMessageToWebview({
							type: "imageProviderModels",
							imageProviderModels: { [providerKey]: [] },
						})
					}
				} catch (err: any) {
					console.log(`[messageRouter]   error: ${err.message}`)
					await provider.postMessageToWebview({
						type: "imageProviderModels",
						imageProviderModels: { [providerKey]: [] },
					})
				}
			}
			break
		}

		case "imageAutoSetup": {
			const { autoSetupComfyUI } = await import("../../services/image-runtime")

			const imageProvider = message.text as string | undefined
			if (imageProvider !== "comfyui") {
				await provider.postMessageToWebview({
					type: "imageAutoSetupResult",
					success: false,
					text: "Invalid provider. Use 'comfyui'.",
				})
				break
			}

			// Run setup without blocking other messages
			;(async () => {
				try {
					await autoSetupComfyUI((step, msg, progress) => {
						provider.postMessageToWebview({
							type: "imageAutoSetupResult",
							success: true,
							text: msg || step,
							step,
							progress,
						})
					})

					// Signal completion
					await provider.postMessageToWebview({
						type: "imageAutoSetupResult",
						success: true,
						text: "Setup complete",
						step: "complete",
						progress: 100,
					})
					// Persist auto-setup flag so it survives webview/extension restarts
					try {
						await provider.contextProxy.setValue("comfyuiAutoSetup", true)
					} catch (persistError) {
						provider.log(
							`Failed to persist auto-setup flag: ${persistError instanceof Error ? persistError.message : String(persistError)}`,
						)
					}
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error)
					provider.log(`Image auto-setup failed: ${errorMessage}`)
					await provider.postMessageToWebview({
						type: "imageAutoSetupResult",
						success: false,
						text: errorMessage,
						step: "error",
					})
				}
			})()

			break
		}

		// ── Default ─────────────────────────────────────────
		default: {
			// console.log(`Unhandled message type: ${message.type}`)
			//
			// Currently unhandled (sent from webview → extension, not handled here):
			// "currentApiConfigName" | "codebaseIndexEnabled" | "enhancedPrompt"
			// "systemPrompt" | "exportModeResult" | "importModeResult"
			// "checkRulesDirectoryResult" | "browserConnectionResult" | "vsCodeSetting"
			// "indexingStatusUpdate" | "indexCleared" | "shareTaskSuccess"
			// "playSound" | "draggedImages" | "setApiConfigPassword"
			// "setopenAiCustomModelInfo" | "imageGenerationSettings"
			// "requestWorktreePath" | "worktreePath"
			break
		}
	}
}

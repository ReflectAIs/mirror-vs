import * as vscode from "vscode"

import type { MirrorMessage } from "@mirror-vs/types"

import { saveTaskMessages } from "../../task-persistence"
import type { MirrorProvider } from "../MirrorProvider"
import { handleCheckpointRestoreOperation } from "../checkpointRestoreHandler"
import { findMessageIndices, findFirstApiIndexAtOrAfter, resolveIncomingImages } from "./_helpers"
import type { ApiMessage } from "../../task-persistence/apiMessages"
import { t } from "../../../i18n"

/**
 * Handles message deletion operations with user confirmation.
 * Checks for checkpoints before the target message and shows a confirmation dialog.
 */
export async function handleDeleteOperation(provider: MirrorProvider, messageTs: number): Promise<void> {
	const currentMirror = provider.getCurrentTask()
	let hasCheckpoint = false

	if (!currentMirror) {
		await vscode.window.showErrorMessage(t("common:errors.message.no_active_task_to_delete"))
		return
	}

	const { messageIndex } = findMessageIndices(messageTs, currentMirror)

	if (messageIndex !== -1) {
		const checkpoints = currentMirror.mirrorMessages.filter(
			(msg) => msg.say === "checkpoint_saved" && msg.ts > messageTs,
		)
		hasCheckpoint = checkpoints.length > 0
	}

	await provider.postMessageToWebview({
		type: "showDeleteMessageDialog",
		messageTs,
		hasCheckpoint,
	})
}

/**
 * Handles confirmed message deletion from webview dialog.
 * Supports checkpoint-based deletion (restore to checkpoint) and simple deletion (rewind).
 */
export async function handleDeleteMessageConfirm(
	provider: MirrorProvider,
	messageTs: number,
	restoreCheckpoint?: boolean,
): Promise<void> {
	const currentMirror = provider.getCurrentTask()
	if (!currentMirror) {
		console.error("[handleDeleteMessageConfirm] No current mirror available")
		return
	}

	const { messageIndex, apiConversationHistoryIndex } = findMessageIndices(messageTs, currentMirror)
	let apiIndexToUse = apiConversationHistoryIndex
	const tsThreshold = currentMirror.mirrorMessages[messageIndex]?.ts
	if (apiIndexToUse === -1 && typeof tsThreshold === "number") {
		apiIndexToUse = findFirstApiIndexAtOrAfter(tsThreshold, currentMirror)
	}

	if (messageIndex === -1) {
		await vscode.window.showErrorMessage(t("common:errors.message.message_not_found", { messageTs }))
		return
	}

	try {
		const targetMessage = currentMirror.mirrorMessages[messageIndex]

		if (restoreCheckpoint) {
			const checkpoints = currentMirror.mirrorMessages.filter(
				(msg) => msg.say === "checkpoint_saved" && msg.ts > messageTs,
			)

			const nextCheckpoint = checkpoints[0]

			if (nextCheckpoint && nextCheckpoint.text) {
				await handleCheckpointRestoreOperation({
					provider,
					currentMirror,
					messageTs: targetMessage.ts!,
					messageIndex,
					checkpoint: { hash: nextCheckpoint.text },
					operation: "delete",
				})
			} else {
				console.log("[handleDeleteMessageConfirm] No checkpoint found before message")
				vscode.window.showWarningMessage("No checkpoint found before this message")
			}
		} else {
			// Preserve checkpoint associations for remaining messages
			const preservedCheckpoints = new Map<number, any>()
			for (let i = 0; i < messageIndex; i++) {
				const msg = currentMirror.mirrorMessages[i]
				if (msg?.checkpoint && msg.ts) {
					preservedCheckpoints.set(msg.ts, msg.checkpoint)
				}
			}

			await currentMirror.messageManager.rewindToTimestamp(targetMessage.ts!, { includeTargetMessage: false })

			// Restore checkpoint associations for preserved messages
			for (const [ts, checkpoint] of preservedCheckpoints) {
				const msgIndex = currentMirror.mirrorMessages.findIndex((msg) => msg.ts === ts)
				if (msgIndex !== -1) {
					currentMirror.mirrorMessages[msgIndex].checkpoint = checkpoint
				}
			}

			await saveTaskMessages({
				messages: currentMirror.mirrorMessages,
				taskId: currentMirror.taskId,
				globalStoragePath: provider.contextProxy.globalStorageUri.fsPath,
			})

			await provider.postStateToWebview()
		}
	} catch (error) {
		console.error("Error in delete message:", error)
		vscode.window.showErrorMessage(
			t("common:errors.message.error_deleting_message", {
				error: error instanceof Error ? error.message : String(error),
			}),
		)
	}
}

/**
 * Handles message editing operations with user confirmation.
 * Checks for checkpoints before the target message and shows an edit confirmation dialog.
 */
export async function handleEditOperation(
	provider: MirrorProvider,
	messageTs: number,
	editedContent: string,
	images?: string[],
): Promise<void> {
	const currentMirror = provider.getCurrentTask()
	let hasCheckpoint = false
	if (currentMirror) {
		const { messageIndex } = findMessageIndices(messageTs, currentMirror)
		if (messageIndex !== -1) {
			const checkpoints = currentMirror.mirrorMessages.filter(
				(msg) => msg.say === "checkpoint_saved" && msg.ts > messageTs,
			)
			hasCheckpoint = checkpoints.length > 0
		} else {
			console.log("[webviewMessageHandler] Edit - Message not found in mirrorMessages!")
		}
	} else {
		console.log("[webviewMessageHandler] Edit - No currentMirror available!")
	}

	await provider.postMessageToWebview({
		type: "showEditMessageDialog",
		messageTs,
		text: editedContent,
		hasCheckpoint,
		images,
	})
}

/**
 * Handles confirmed message editing from webview dialog.
 * Supports checkpoint-based edit (restore to checkpoint then submit) and simple edit (rewind then submit).
 */
export async function handleEditMessageConfirm(
	provider: MirrorProvider,
	messageTs: number,
	editedContent: string,
	restoreCheckpoint?: boolean,
	images?: string[],
): Promise<void> {
	const currentMirror = provider.getCurrentTask()
	if (!currentMirror) {
		console.error("[handleEditMessageConfirm] No current mirror available")
		return
	}

	const { messageIndex, apiConversationHistoryIndex } = findMessageIndices(messageTs, currentMirror)

	if (messageIndex === -1) {
		const errorMessage = t("common:errors.message.message_not_found", { messageTs })
		console.error("[handleEditMessageConfirm]", errorMessage)
		await vscode.window.showErrorMessage(errorMessage)
		return
	}

	try {
		const targetMessage = currentMirror.mirrorMessages[messageIndex]

		if (restoreCheckpoint) {
			const checkpoints = currentMirror.mirrorMessages.filter(
				(msg) => msg.say === "checkpoint_saved" && msg.ts > messageTs,
			)

			const nextCheckpoint = checkpoints[0]

			if (nextCheckpoint && nextCheckpoint.text) {
				await handleCheckpointRestoreOperation({
					provider,
					currentMirror,
					messageTs: targetMessage.ts!,
					messageIndex,
					checkpoint: { hash: nextCheckpoint.text },
					operation: "edit",
					editData: {
						editedContent,
						images,
						apiConversationHistoryIndex,
					},
				})
				return
			} else {
				console.log("[handleEditMessageConfirm] No checkpoint found before message")
				vscode.window.showWarningMessage("No checkpoint found before this message")
			}
		}

		// For non-checkpoint edits, remove the ORIGINAL user message being edited and all subsequent messages
		let deleteFromMessageIndex = messageIndex
		let deleteFromApiIndex = apiConversationHistoryIndex

		// Find the nearest preceding user message to ensure we replace the original, not just the assistant reply
		for (let i = messageIndex; i >= 0; i--) {
			const m = currentMirror.mirrorMessages[i]
			if (m?.say === "user_feedback") {
				deleteFromMessageIndex = i
				const userTs = m.ts
				if (typeof userTs === "number") {
					const apiIdx = currentMirror.apiConversationHistory.findIndex((am: ApiMessage) => am.ts === userTs)
					if (apiIdx !== -1) {
						deleteFromApiIndex = apiIdx
					}
				}
				break
			}
		}

		// Timestamp fallback for API history when exact user message isn't present
		if (deleteFromApiIndex === -1) {
			const tsThresholdForEdit = currentMirror.mirrorMessages[deleteFromMessageIndex]?.ts
			if (typeof tsThresholdForEdit === "number") {
				deleteFromApiIndex = findFirstApiIndexAtOrAfter(tsThresholdForEdit, currentMirror)
			}
		}

		// Store checkpoints from messages that will be preserved
		const preservedCheckpoints = new Map<number, any>()
		for (let i = 0; i < deleteFromMessageIndex; i++) {
			const msg = currentMirror.mirrorMessages[i]
			if (msg?.checkpoint && msg.ts) {
				preservedCheckpoints.set(msg.ts, msg.checkpoint)
			}
		}

		// Delete the original (user) message and all subsequent messages using MessageManager
		const rewindTs = currentMirror.mirrorMessages[deleteFromMessageIndex]?.ts
		if (rewindTs) {
			await currentMirror.messageManager.rewindToTimestamp(rewindTs, { includeTargetMessage: false })
		}

		// Restore checkpoint associations for preserved messages
		for (const [ts, checkpoint] of preservedCheckpoints) {
			const msgIndex = currentMirror.mirrorMessages.findIndex((msg) => msg.ts === ts)
			if (msgIndex !== -1) {
				currentMirror.mirrorMessages[msgIndex].checkpoint = checkpoint
			}
		}

		await saveTaskMessages({
			messages: currentMirror.mirrorMessages,
			taskId: currentMirror.taskId,
			globalStoragePath: provider.contextProxy.globalStorageUri.fsPath,
		})

		await provider.postStateToWebview()

		await currentMirror.submitUserMessage(editedContent, images)
	} catch (error) {
		console.error("Error in edit message:", error)
		vscode.window.showErrorMessage(
			t("common:errors.message.error_editing_message", {
				error: error instanceof Error ? error.message : String(error),
			}),
		)
	}
}

/**
 * Handles message modification operations (delete or edit) with confirmation dialog.
 */
export async function handleMessageModificationsOperation(
	provider: MirrorProvider,
	messageTs: number,
	operation: "delete" | "edit",
	editedContent?: string,
	images?: string[],
): Promise<void> {
	if (operation === "delete") {
		await handleDeleteOperation(provider, messageTs)
	} else if (operation === "edit" && editedContent) {
		await handleEditOperation(provider, messageTs, editedContent, images)
	}
}

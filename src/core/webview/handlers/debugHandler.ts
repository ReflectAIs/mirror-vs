import * as vscode from "vscode"
import * as path from "path"
import * as os from "os"
import * as fs from "fs/promises"

import { type WebviewMessage } from "@mirror-vs/types"

import { MirrorProvider } from "../MirrorProvider"
import { fileExistsAtPath } from "../../../utils/fs"
import { generateErrorDiagnostics } from "../diagnosticsHandler"

/**
 * Handles opening debug API or UI history files for the current task.
 */
export async function handleOpenDebugHistory(provider: MirrorProvider, message: WebviewMessage): Promise<void> {
	const currentTask = provider.getCurrentTask()
	if (!currentTask) {
		vscode.window.showErrorMessage("No active task to view history for")
		return
	}

	try {
		const { getTaskDirectoryPath } = await import("../../../utils/storage")
		const globalStoragePath = provider.contextProxy.globalStorageUri.fsPath
		const taskDirPath = await getTaskDirectoryPath(globalStoragePath, currentTask.taskId)

		const fileName = message.type === "openDebugApiHistory" ? "api_conversation_history.json" : "ui_messages.json"
		const sourceFilePath = path.join(taskDirPath, fileName)

		if (!(await fileExistsAtPath(sourceFilePath))) {
			vscode.window.showErrorMessage(`File not found: ${fileName}`)
			return
		}

		const content = await fs.readFile(sourceFilePath, "utf8")
		let jsonContent: unknown

		try {
			jsonContent = JSON.parse(content)
		} catch {
			vscode.window.showErrorMessage(`Failed to parse ${fileName}`)
			return
		}

		const prettifiedContent = JSON.stringify(jsonContent, null, 2)

		const tmpDir = os.tmpdir()
		const timestamp = Date.now()
		const tempFileName = `mirror-debug-${message.type === "openDebugApiHistory" ? "api" : "ui"}-${currentTask.taskId.slice(0, 8)}-${timestamp}.json`
		const tempFilePath = path.join(tmpDir, tempFileName)

		await fs.writeFile(tempFilePath, prettifiedContent, "utf8")

		const doc = await vscode.workspace.openTextDocument(tempFilePath)
		await vscode.window.showTextDocument(doc, { preview: true })
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error)
		provider.log(`Error opening debug history: ${errorMessage}`)
		vscode.window.showErrorMessage(`Failed to open debug history: ${errorMessage}`)
	}
}

/**
 * Handles downloading error diagnostics for the current task.
 */
export async function handleDownloadErrorDiagnostics(provider: MirrorProvider, message: WebviewMessage): Promise<void> {
	const currentTask = provider.getCurrentTask()
	if (!currentTask) {
		vscode.window.showErrorMessage("No active task to generate diagnostics for")
		return
	}

	await generateErrorDiagnostics({
		taskId: currentTask.taskId,
		globalStoragePath: provider.contextProxy.globalStorageUri.fsPath,
		values: message.values,
		log: (msg) => provider.log(msg),
	})
}

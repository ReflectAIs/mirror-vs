import * as path from "path"
import * as os from "os"
import * as fs from "fs/promises"
import * as vscode from "vscode"

import { type WebviewMessage } from "@mirror-vs/types"

import { MirrorProvider } from "../MirrorProvider"
import { openFile } from "../../../integrations/misc/open-file"
import { saveImage, openImage } from "../../../integrations/misc/image-handler"
import { openMention } from "../../mentions"
import { isPathOutsideWorkspace } from "../../../utils/pathUtils"
import { resolveDefaultSaveUri, saveLastExportPath } from "../../../utils/export"
import { getCurrentCwd } from "./_helpers"

/**
 * Handles opening a file in the editor. Supports absolute and relative paths.
 */
export async function handleOpenFile(provider: MirrorProvider, message: WebviewMessage): Promise<void> {
	let filePath: string = message.text!
	if (!path.isAbsolute(filePath)) {
		filePath = path.join(getCurrentCwd(provider), filePath)
	}
	openFile(filePath, message.values as { create?: boolean; content?: string; line?: number })
}

/**
 * Handles reading file content with path traversal protection.
 */
export async function handleReadFileContent(provider: MirrorProvider, message: WebviewMessage): Promise<void> {
	const relPath = message.text || ""
	if (!relPath) {
		provider.postMessageToWebview({
			type: "fileContent",
			fileContent: { path: relPath, content: null, error: "No path provided" },
		})
		return
	}

	try {
		const cwd = getCurrentCwd(provider)
		if (!cwd) {
			provider.postMessageToWebview({
				type: "fileContent",
				fileContent: { path: relPath, content: null, error: "No workspace path available" },
			})
			return
		}

		const absPath = path.resolve(cwd, relPath)
		if (isPathOutsideWorkspace(absPath)) {
			provider.postMessageToWebview({
				type: "fileContent",
				fileContent: { path: relPath, content: null, error: "Path is outside workspace" },
			})
			return
		}

		const content = await fs.readFile(absPath, "utf-8")
		provider.postMessageToWebview({ type: "fileContent", fileContent: { path: relPath, content } })
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : String(err)
		provider.postMessageToWebview({
			type: "fileContent",
			fileContent: { path: relPath, content: null, error: errorMsg },
		})
	}
}

/**
 * Handles saving an image from a data URI.
 */
export async function handleSaveImage(provider: MirrorProvider, message: WebviewMessage): Promise<void> {
	if (!message.dataUri) {
		return
	}

	const matches = message.dataUri.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/)
	if (!matches) {
		saveImage(message.dataUri, vscode.Uri.file(""))
		return
	}

	const format = matches[1]
	const defaultFileName = `img_${Date.now()}.${format}`

	const defaultUri = await resolveDefaultSaveUri(provider.contextProxy, "lastImageSavePath", defaultFileName, {
		useWorkspace: false,
		fallbackDir: path.join(os.homedir(), "Downloads"),
	})

	const savedUri = await saveImage(message.dataUri, defaultUri)

	if (savedUri) {
		await saveLastExportPath(provider.contextProxy, "lastImageSavePath", savedUri)
	}
}

/**
 * Handles opening an image.
 */
export async function handleOpenImage(provider: MirrorProvider, message: WebviewMessage): Promise<void> {
	openImage(message.text!, { values: message.values })
}

/**
 * Handles opening a mention link.
 */
export async function handleOpenMention(provider: MirrorProvider, message: WebviewMessage): Promise<void> {
	openMention(getCurrentCwd(provider), message.text)
}

/**
 * Handles opening an external URL.
 */
export async function handleOpenExternal(provider: MirrorProvider, message: WebviewMessage): Promise<void> {
	if (message.url) {
		vscode.env.openExternal(vscode.Uri.parse(message.url))
	}
}

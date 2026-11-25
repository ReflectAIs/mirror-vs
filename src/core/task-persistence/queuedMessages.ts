import * as fs from "fs/promises"
import * as path from "path"
import type { QueuedMessage } from "@mirror-vs/types"
import { fileExistsAtPath } from "../../utils/fs"
import { safeWriteJson } from "../../utils/safeWriteJson"
import { getTaskDirectoryPath } from "../../utils/storage"

const QUEUED_MESSAGES_FILENAME = "queued_messages.json"

export async function readQueuedMessages({
	taskId,
	globalStoragePath,
}: {
	taskId: string
	globalStoragePath: string
}): Promise<QueuedMessage[]> {
	try {
		const taskDir = await getTaskDirectoryPath(globalStoragePath, taskId)
		const filePath = path.join(taskDir, QUEUED_MESSAGES_FILENAME)
		if (!(await fileExistsAtPath(filePath))) {
			return []
		}
		const parsed = JSON.parse(await fs.readFile(filePath, "utf8"))
		return Array.isArray(parsed) ? parsed : []
	} catch {
		return []
	}
}

export async function saveQueuedMessages({
	messages,
	taskId,
	globalStoragePath,
}: {
	messages: QueuedMessage[]
	taskId: string
	globalStoragePath: string
}): Promise<void> {
	const taskDir = await getTaskDirectoryPath(globalStoragePath, taskId)
	const filePath = path.join(taskDir, QUEUED_MESSAGES_FILENAME)
	await safeWriteJson(filePath, messages)
}

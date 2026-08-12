import { safeWriteJson } from "../../utils/safeWriteJson"
import * as path from "path"
import * as fs from "fs/promises"

import type { FileEditRecord } from "@mirror-vs/types"

import { fileExistsAtPath } from "../../utils/fs"

import { GlobalFileNames } from "../../shared/globalFileNames"
import { getTaskDirectoryPath } from "../../utils/storage"

export type ReadTaskFileEditsOptions = {
	taskId: string
	globalStoragePath: string
}

export async function readTaskFileEdits({
	taskId,
	globalStoragePath,
}: ReadTaskFileEditsOptions): Promise<FileEditRecord[]> {
	const taskDir = await getTaskDirectoryPath(globalStoragePath, taskId)
	const filePath = path.join(taskDir, GlobalFileNames.fileEdits)
	const fileExists = await fileExistsAtPath(filePath)

	if (fileExists) {
		try {
			const parsedData = JSON.parse(await fs.readFile(filePath, "utf8"))
			if (!Array.isArray(parsedData)) {
				console.warn(
					`[readTaskFileEdits] Parsed data is not an array (got ${typeof parsedData}), returning empty. TaskId: ${taskId}`,
				)
				return []
			}
			return parsedData as FileEditRecord[]
		} catch (error) {
			console.warn(
				`[readTaskFileEdits] Failed to parse ${filePath} for task ${taskId}, returning empty: ${error instanceof Error ? error.message : String(error)}`,
			)
			return []
		}
	}

	return []
}

export type SaveTaskFileEditsOptions = {
	fileEdits: FileEditRecord[]
	taskId: string
	globalStoragePath: string
}

export async function saveTaskFileEdits({ fileEdits, taskId, globalStoragePath }: SaveTaskFileEditsOptions) {
	const taskDir = await getTaskDirectoryPath(globalStoragePath, taskId)
	const filePath = path.join(taskDir, GlobalFileNames.fileEdits)
	await safeWriteJson(filePath, fileEdits)
}

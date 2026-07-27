import { Task } from "../task/Task"
import type { ToolUse } from "../../shared/tools"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import { listFiles } from "../../services/glob/list-files"
import { formatResponse } from "../prompts/responses"
import { arePathsEqual } from "../../utils/path"
import os from "os"
import path from "path"

interface GetWorkspaceFileTreeParams {
	// No parameters needed — uses the current workspace directory
}

export class GetWorkspaceFileTreeTool extends BaseTool<"get_workspace_file_tree"> {
	readonly name = "get_workspace_file_tree" as const

	async execute(params: GetWorkspaceFileTreeParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { pushToolResult } = callbacks

		try {
			const provider = task.providerRef.deref()
			const state = provider ? await provider.getState() : undefined
			const maxWorkspaceFiles = state?.maxWorkspaceFiles ?? 200
			const showMirrorIgnoredFiles = state?.showMirrorIgnoredFiles ?? false

			const isDesktop = arePathsEqual(task.cwd, path.join(os.homedir(), "Desktop"))

			if (isDesktop) {
				pushToolResult("(Desktop files not shown automatically. Use list_files to explore if needed.)")
				return
			}

			const [files, didHitLimit] = await listFiles(task.cwd, true, maxWorkspaceFiles)

			const result = formatResponse.formatFilesList(
				task.cwd,
				files,
				didHitLimit,
				task.mirrorIgnoreController,
				showMirrorIgnoredFiles,
			)

			pushToolResult(result)
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e)
			pushToolResult(`Failed to retrieve workspace file tree: ${message}`)
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"get_workspace_file_tree">): Promise<void> {
		// No partial handling needed — just let it stream in
	}
}

export const getWorkspaceFileTreeTool = new GetWorkspaceFileTreeTool()

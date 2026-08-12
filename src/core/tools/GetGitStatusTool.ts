import { Task } from "../task/Task"
import type { ToolUse } from "../../shared/tools"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import { getGitStatus } from "../../utils/git"

interface GetGitStatusParams {
	maxFiles?: number
}

export class GetGitStatusTool extends BaseTool<"get_git_status"> {
	readonly name = "get_git_status" as const

	async execute(params: GetGitStatusParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { pushToolResult } = callbacks

		try {
			const maxFiles = params.maxFiles ?? 50
			const gitStatus = await getGitStatus(task.cwd, Math.min(maxFiles, 200))

			if (!gitStatus) {
				pushToolResult("No git status available (not a git repository or no changes detected).")
				return
			}

			pushToolResult(gitStatus)
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e)
			pushToolResult(`Failed to retrieve git status: ${message}`)
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"get_git_status">): Promise<void> {
		// No partial handling needed — just let it stream in
	}
}

export const getGitStatusTool = new GetGitStatusTool()

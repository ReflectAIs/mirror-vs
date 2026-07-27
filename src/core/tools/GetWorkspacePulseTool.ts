import { Task } from "../task/Task"
import type { ToolUse } from "../../shared/tools"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import { buildWorkspacePulse } from "../environment/workspacePulse"

interface GetWorkspacePulseParams {
	// No parameters needed — uses the current task's workspace and mode
}

export class GetWorkspacePulseTool extends BaseTool<"get_workspace_pulse"> {
	readonly name = "get_workspace_pulse" as const

	async execute(params: GetWorkspacePulseParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { pushToolResult } = callbacks

		try {
			const provider = task.providerRef.deref()
			const state = provider ? await provider.getState() : undefined
			const currentMode = state?.mode ?? "code"

			const pulse = await buildWorkspacePulse(task, currentMode)
			pushToolResult(pulse || "No workspace pulse data available.")
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e)
			pushToolResult(`Failed to retrieve workspace pulse: ${message}`)
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"get_workspace_pulse">): Promise<void> {
		// No partial handling needed — just let it stream in
	}
}

export const getWorkspacePulseTool = new GetWorkspacePulseTool()

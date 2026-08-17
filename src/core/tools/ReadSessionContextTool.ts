import { Task } from "../task/Task"
import type { ToolUse } from "../../shared/tools"
import { BaseTool, ToolCallbacks } from "./BaseTool"

interface ReadSessionContextParams {
	scope?: "siblings" | "knowledge" | "notes" | "all"
}

export class ReadSessionContextTool extends BaseTool<"read_session_context"> {
	readonly name = "read_session_context" as const

	async execute(params: ReadSessionContextParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { pushToolResult } = callbacks

		try {
			const provider = task.providerRef.deref()
			if (!provider) {
				pushToolResult("Failed to read session context: provider not available.")
				return
			}

			const context = await provider
				.getSessionContextManager()
				.getFullContext(task.sessionId ?? "", params.scope ?? "all")
			pushToolResult(context)
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e)
			pushToolResult(`Failed to read session context: ${message}`)
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"read_session_context">): Promise<void> {
		// No partial handling needed — just let it stream in
	}
}

export const readSessionContextTool = new ReadSessionContextTool()

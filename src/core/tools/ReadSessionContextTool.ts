import { Task } from "../task/Task"
import type { ToolUse } from "../../shared/tools"
import { BaseTool, ToolCallbacks } from "./BaseTool"

interface ReadSessionContextParams {
	scope?: "siblings" | "knowledge" | "notes" | "all" | "tab_detail"
	target_task_id?: string
	share_note?: string
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

			const manager = provider.getSessionContextManager()
			const sessionId = task.sessionId ?? ""

			// Handle explicit knowledge sharing/broadcasting
			if (params.share_note && params.share_note.trim()) {
				if (!sessionId) {
					pushToolResult("Cannot share session context: task is not associated with an active session.")
					return
				}
				const note = await manager.addKnowledgeNote(sessionId, params.share_note, task.taskId)
				pushToolResult(
					`✓ Shared note broadcasted to session:\n"${note.text}"\n\nAll sibling tabs can now access this note via read_session_context.`,
				)
				return
			}

			// Read context (full, scoped, or specific tab detail)
			const context = params.target_task_id
				? await manager.getFullContext(sessionId, params.scope ?? "all", params.target_task_id)
				: await manager.getFullContext(sessionId, params.scope ?? "all")
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

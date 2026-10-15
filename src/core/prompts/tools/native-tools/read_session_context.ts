import type OpenAI from "openai"

const READ_SESSION_CONTEXT_DESCRIPTION = `Request to read or share selective context across tabs in your current session:

1. **Sibling tabs** — roster of other open tabs in the session (task IDs, titles, summaries).
2. **Tab details** — deep inspection of a specific sibling tab (goal, plan, files modified, latest progress/findings) using \`target_task_id\`.
3. **Shared knowledge notes** — distilled facts/decisions extracted from tabs or explicitly broadcasted.
4. **Share note** — broadcast a critical finding/decision to all sibling tabs immediately using \`share_note\`.
5. **User notes** — curated session notes shared across all tabs.

Use this tool to collaborate across tabs without token bloat:
- To inspect all siblings & knowledge: {"scope": "all"}
- To inspect what another tab did: {"target_task_id": "<taskId>"}
- To broadcast a discovery to other tabs: {"share_note": "Found that API endpoint requires header X-Custom: true"}`

export default {
	type: "function",
	function: {
		name: "read_session_context",
		description: READ_SESSION_CONTEXT_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				scope: {
					type: "string",
					enum: ["siblings", "knowledge", "notes", "all", "tab_detail"],
					description: "Which layer(s) of shared session context to read. Defaults to 'all'.",
				},
				target_task_id: {
					type: "string",
					description:
						"ID of a specific sibling tab to inspect its detailed progress, plan, and modified files.",
				},
				share_note: {
					type: "string",
					description: "A note or finding to broadcast immediately to all sibling tabs in the session.",
				},
			},
			required: [],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool

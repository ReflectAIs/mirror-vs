import type OpenAI from "openai"

const READ_SESSION_CONTEXT_DESCRIPTION = `Request to read the shared selective context for your current session. A session groups multiple tabs (independent tasks) under one sessionId, and this tool lets you pull the context shared between them on demand:

1. **Sibling tabs** — roster of other open tabs in the session (status, title, one-liner summary).
2. **Shared knowledge notes** — distilled facts/decisions extracted from sibling tabs when they completed or condensed their context.
3. **User-curated notes** — optional markdown the user wrote to share across all tabs in the session.

Use this tool when the compact "Session Shared Context" section in your system prompt indicates sibling tabs, shared knowledge, or user notes exist and you need the full details before acting. This replaces guessing about what other tabs are doing.

Parameters:
- scope (optional): which layer(s) to read — "siblings", "knowledge", "notes", or "all" (default: "all").

Example call:
{"scope": "all"}`

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
					enum: ["siblings", "knowledge", "notes", "all"],
					description: "Which layer(s) of shared session context to read. Defaults to 'all'.",
				},
			},
			required: [],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool

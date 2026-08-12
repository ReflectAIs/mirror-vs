import type OpenAI from "openai"

const GET_WORKSPACE_PULSE_DESCRIPTION = `Request to retrieve the current "Workspace Pulse" — a compact, proactive context bundle about the project's live state. This includes:

1. **Diagnostics Summary** — Total errors and warnings across all files, with file names for the top error files.
2. **Git Branch** — Current git branch and count of uncommitted changes.
3. **Active Terminals** — Currently running terminal commands (if any).
4. **Diagnostics Detail** (code/debug modes only) — Full diagnostic error/warning messages (up to 30).
5. **Recent Changes** (code/debug modes only) — Git diffs for recently modified files (up to 5 files).
6. **Full Git Status** (architect mode only) — Detailed git status output.

Use this tool when you need to understand the current state of the project — what's broken, what's running, what branch you're on, or what files have been recently modified. This replaces the need to call multiple individual tools to gather project health context.

Parameters:
- none (no parameters required — uses the current task's workspace and mode)

Example call (no parameters needed):
{}`

export default {
	type: "function",
	function: {
		name: "get_workspace_pulse",
		description: GET_WORKSPACE_PULSE_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {},
			required: [],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool

import type OpenAI from "openai"

const SLEEP_DESCRIPTION = `Pause execution for a specified duration in seconds.
Use this tool when you have initiated a background terminal command, dev server, build, or long-running process and need to wait for progress or completion, instead of running wasteful shell commands like 'sleep 5' or 'echo waiting' via execute_command.

Parameters:
- seconds: (optional) Number of seconds to pause (between 1 and 300). Defaults to 5.
- reason: (optional) Explanation of what background process or event you are waiting for.

Example:
{ "seconds": 10, "reason": "Waiting for frontend dev server to compile bundle" }`

export default {
	type: "function",
	function: {
		name: "sleep",
		description: SLEEP_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				seconds: {
					type: ["number", "null"],
					description: "The number of seconds to pause (1-300). Defaults to 5.",
				},
				reason: {
					type: ["string", "null"],
					description: "Optional description of what you are waiting for.",
				},
			},
			required: ["seconds", "reason"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool

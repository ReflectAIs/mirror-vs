import type OpenAI from "openai"

const EXECUTE_COMMAND_DESCRIPTION = `Execute a CLI command. Tailor commands to the user's system and explain what each does. Use shell chaining syntax; prefer complex CLI commands over scripts. Use relative paths. Always use non-interactive flags (e.g. -y, --no-input, and '--non-interactive' for Firebase CLI commands such as 'firebase deploy --non-interactive') and pass '--progress=plain' with 'docker compose' commands to prevent interactive prompts or TTY progress spinners from hanging. When executing long-running commands, dev servers, or builds, provide a timeout parameter (in seconds) to transition them to background execution. Once a command transitions to the background, END YOUR TURN IMMEDIATELY if you have no independent tasks. Do NOT poll with sleep, echo, or read_command_output; the terminal callback will automatically wake you up with a notification when the background command finishes with its exit code and output. If a command fails due to missing authentication or interactive credentials, do not repeatedly retry it—diagnose or inform the user.

Params: command (required), cwd (optional), timeout (optional, in seconds — for long-running processes like dev servers or builds).

Example: { "command": "npm run dev", "cwd": null, "timeout": 5 }`

const COMMAND_PARAMETER_DESCRIPTION = `Shell command to execute`

const CWD_PARAMETER_DESCRIPTION = `Optional working directory, relative or absolute`

const TIMEOUT_PARAMETER_DESCRIPTION = `Timeout in seconds. The command moves to background after timeout and will automatically notify and wake you up upon completion. End your turn immediately and wait for the callback rather than polling.`

export default {
	type: "function",
	function: {
		name: "execute_command",
		description: EXECUTE_COMMAND_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				command: {
					type: "string",
					description: COMMAND_PARAMETER_DESCRIPTION,
				},
				cwd: {
					type: ["string", "null"],
					description: CWD_PARAMETER_DESCRIPTION,
				},
				timeout: {
					type: ["number", "null"],
					description: TIMEOUT_PARAMETER_DESCRIPTION,
				},
			},
			required: ["command", "cwd", "timeout"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool

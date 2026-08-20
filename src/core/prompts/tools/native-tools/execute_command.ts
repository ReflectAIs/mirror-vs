import type OpenAI from "openai"

const EXECUTE_COMMAND_DESCRIPTION = `Execute a CLI command. Tailor commands to the user's system and explain what each does. Use shell chaining syntax; prefer complex CLI commands over scripts. Use relative paths. Always use non-interactive flags (e.g. -y, --no-input, and '--non-interactive' for Firebase CLI commands such as 'firebase deploy --non-interactive') and pass '--progress=plain' with 'docker compose' commands to prevent interactive prompts or TTY progress spinners from hanging. When waiting for asynchronous/background process completion, use the timeout parameter or reasonable sleep intervals rather than spamming rapid polling loops. If a command fails due to missing authentication or interactive credentials, do not repeatedly retry it—diagnose or inform the user.

Params: command (required), cwd (optional), timeout (optional, in seconds — for long-running processes like dev servers).

Example: { "command": "npm run dev", "cwd": null, "timeout": null }`

const COMMAND_PARAMETER_DESCRIPTION = `Shell command to execute`

const CWD_PARAMETER_DESCRIPTION = `Optional working directory, relative or absolute`

const TIMEOUT_PARAMETER_DESCRIPTION = `Timeout in seconds. The command runs in background after timeout; use for dev servers, watchers, etc.`

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

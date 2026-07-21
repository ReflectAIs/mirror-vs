import type OpenAI from "openai"

const SSH_SESSION_DESCRIPTION = `Establish or interact with a persistent SSH session. This is designed for server access and remote operations, allowing multiple commands to be executed over a single connection. By keeping the connection alive, it prevents SSH rate-limiting or firewall blocking that typically occurs when connecting repeatedly.

Operational Guidelines & Stuck Situations:
1. **Interactive Prompts**: Commands run non-interactively with stdin redirected to /dev/null. Any command prompting for input (e.g. passwords, confirmations [y/n], or git credentials) will fail or exit immediately. Always pass automated flags (like -y, --no-input, etc.) where possible.
2. **Timeouts**: If a command is expected to take a long time (like 'docker compose build' or 'docker compose down'), you must supply a custom, high 'timeout' value in milliseconds (e.g., 300000 for 5 minutes).
3. **Handling Timeout Responses**: If you receive a response containing '[Command execution timed out after X ms]', the connection is NOT lost, but the command was running too slow. You should:
   - Check the state of the system using status commands (like 'docker ps' or logs) with a normal timeout.
   - Re-run the command with a significantly larger 'timeout' parameter if needed.

Parameters:
- action: (required) The operation to perform: 'connect' (starts the session), 'execute' (runs a command on the active session), or 'disconnect' (closes the session).
- host: (required) Remote host target (e.g. root@152.228.227.51).
- port: (optional) SSH port number, defaults to 22.
- password: (optional) Password for SSH authentication. Leave empty if using local SSH keys or agent auth.
- command: (optional) The command to run on the server. Required when action is 'execute'.
- timeout: (optional) Command execution timeout in milliseconds. Defaults to 180000 (3 minutes).

Example: Connecting to a server
{ "action": "connect", "host": "root@152.228.227.51", "port": 20043, "password": "pass" }

Example: Running a long-running command with custom timeout
{ "action": "execute", "host": "root@152.228.227.51", "port": 20043, "command": "docker compose build", "timeout": 300000 }

Example: Disconnecting
{ "action": "disconnect", "host": "root@152.228.227.51", "port": 20043 }`

export default {
	type: "function",
	function: {
		name: "ssh_session",
		description: SSH_SESSION_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				action: {
					type: "string",
					enum: ["connect", "execute", "disconnect"],
					description: "The action to take in the SSH session: connect, execute, or disconnect",
				},
				host: {
					type: "string",
					description: "The remote host to connect to (e.g., user@hostname)",
				},
				port: {
					type: ["number", "null"],
					description: "The SSH port to connect to. Defaults to 22.",
				},
				password: {
					type: ["string", "null"],
					description: "Optional password for SSH authentication. Leave empty if using SSH keys.",
				},
				command: {
					type: ["string", "null"],
					description: "The command to execute in the remote shell. Required for execute action.",
				},
				timeout: {
					type: ["number", "null"],
					description: "Optional command execution timeout in milliseconds. Defaults to 180000 (3 minutes).",
				},
			},
			required: ["action", "host", "port", "password", "command"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool

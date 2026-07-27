import type OpenAI from "openai"

const GET_WORKSPACE_FILE_TREE_DESCRIPTION = `Request to retrieve the full workspace file tree. Use this tool when you need to understand the project's file structure, discover available source files, or locate specific files or directories in the project. The file tree is built using ripgrep and respects .gitignore rules.

This tool is especially useful for:
- Understanding project organization and structure
- Finding where specific files or modules live
- Discovering test files, configuration files, or source directories
- Getting initial context when starting a new task

On first task start, the file tree is automatically included in environment_details. Call this tool on subsequent turns when you need to re-explore the project structure.

Parameters:
- none (no parameters required — uses the current workspace directory)

Example call (no parameters needed):
{}`

export default {
	type: "function",
	function: {
		name: "get_workspace_file_tree",
		description: GET_WORKSPACE_FILE_TREE_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {},
			required: [],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool

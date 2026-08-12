import type OpenAI from "openai"

const GET_GIT_STATUS_DESCRIPTION = `Request to retrieve the full git status of the current workspace, including staged, unstaged, and untracked files. This provides a detailed view of all changes in the working tree.

Use this tool when you need to:
- See exactly which files have been modified, added, or deleted
- Review staged changes before committing
- Understand the full scope of uncommitted work
- Get detailed git status beyond the brief summary in the Workspace Pulse

Parameters:
- maxFiles: (optional) Maximum number of files to include in the status output (default: 50, max: 200).

Example: Get full git status
{ "maxFiles": 50 }

Example: Limit to just the most important changes
{ "maxFiles": 10 }`

const MAX_FILES_PARAMETER_DESCRIPTION = `Maximum number of files to include in the git status output (default: 50, max: 200).`

export default {
	type: "function",
	function: {
		name: "get_git_status",
		description: GET_GIT_STATUS_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				maxFiles: {
					type: "number",
					description: MAX_FILES_PARAMETER_DESCRIPTION,
				},
			},
			required: [],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool

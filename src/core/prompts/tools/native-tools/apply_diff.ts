import type OpenAI from "openai"

const APPLY_DIFF_DESCRIPTION = `Apply precise modifications to an existing file using search/replace blocks. The 'SEARCH' content must match exactly (including whitespace). Use multiple blocks in a single 'diff' for multi-location edits.`

const DIFF_PARAMETER_DESCRIPTION = `One or more search/replace blocks. Each uses ':start_line:' to indicate the original starting line. Format:
<<<<<<< SEARCH
:start_line:[line_number]
-------
[exact content to find]
=======
[new content]
>>>>>>> REPLACE`

export const apply_diff = {
	type: "function",
	function: {
		name: "apply_diff",
		description: APPLY_DIFF_DESCRIPTION,
		parameters: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description: "The path of the file to modify, relative to the current workspace directory.",
				},
				diff: {
					type: "string",
					description: DIFF_PARAMETER_DESCRIPTION,
				},
			},
			required: ["path", "diff"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool

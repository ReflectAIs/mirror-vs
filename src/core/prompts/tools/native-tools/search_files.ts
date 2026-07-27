import type OpenAI from "openai"

const SEARCH_FILES_DESCRIPTION = `Perform regex search across files in a directory. Results include surrounding context. Carefully balance regex specificity and flexibility.

Params: path (required, relative to workspace), regex (required, Rust syntax), file_pattern (optional glob, e.g. *.ts).

Example: { "path": ".", "regex": ".*", "file_pattern": "*.ts" }`

const PATH_PARAMETER_DESCRIPTION = `Directory to search recursively, relative to the workspace`

const REGEX_PARAMETER_DESCRIPTION = `Rust-compatible regular expression pattern`

const FILE_PATTERN_PARAMETER_DESCRIPTION = `Optional glob to filter files (e.g., *.ts)`

export default {
	type: "function",
	function: {
		name: "search_files",
		description: SEARCH_FILES_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description: PATH_PARAMETER_DESCRIPTION,
				},
				regex: {
					type: "string",
					description: REGEX_PARAMETER_DESCRIPTION,
				},
				file_pattern: {
					type: ["string", "null"],
					description: FILE_PATTERN_PARAMETER_DESCRIPTION,
				},
			},
			required: ["path", "regex", "file_pattern"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool

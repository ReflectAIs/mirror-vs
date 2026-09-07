import type OpenAI from "openai"

const CODE_GRAPH_DESCRIPTION = `Explore symbols, jump to definitions, and find references across the entire workspace using Language Server Protocol (LSP).

Actions:
1. "workspace_symbols": Fast, global search for classes, methods, functions, interfaces, or variables matching a query (e.g. query: "TaskApiRequest").
2. "find_definitions": Jump directly to the exact definition of a symbol at a specific file path and line number (or by symbol name).
3. "find_references": Locate all call sites and usages of a symbol across the entire project.

Use this tool whenever you need deterministic symbol navigation, to find where a function or class is defined, or to locate all places where a method or type is used without doing imprecise grep text searches.`

export default {
	type: "function",
	function: {
		name: "code_graph",
		description: CODE_GRAPH_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				action: {
					type: "string",
					enum: ["workspace_symbols", "find_definitions", "find_references"],
					description:
						"The LSP navigation action to perform: 'workspace_symbols', 'find_definitions', or 'find_references'.",
				},
				query: {
					type: ["string", "null"],
					description: "Symbol query string for workspace_symbols (e.g. 'TaskApiRequest').",
				},
				path: {
					type: ["string", "null"],
					description:
						"File path containing the symbol (relative to workspace), required for find_definitions and find_references.",
				},
				line: {
					type: ["number", "null"],
					description:
						"1-based line number of the symbol in the file (for find_definitions or find_references).",
				},
				character: {
					type: ["number", "null"],
					description: "Optional 0-based character column offset of the symbol on the line.",
				},
				symbol: {
					type: ["string", "null"],
					description:
						"Optional symbol name (e.g. 'TaskApiRequest') to help pinpoint character column or fall back to symbol lookup.",
				},
			},
			required: ["action", "query", "path", "line", "character", "symbol"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool

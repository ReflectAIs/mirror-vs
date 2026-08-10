import type OpenAI from "openai"

export default {
	type: "function",
	function: {
		name: "search_mcp_tools",
		description:
			"Search all available MCP tools (including parked/disabled tools). Only needed if total MCP tools exceed your active threshold limit.",
		strict: true,
		parameters: {
			type: "object",
			properties: {
				query: {
					type: "string",
					description: "Search query keyword matching tool name or description",
				},
			},
			required: [],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool

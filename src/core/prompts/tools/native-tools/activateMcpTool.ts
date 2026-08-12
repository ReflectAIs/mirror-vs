import type OpenAI from "openai"

export default {
	type: "function",
	function: {
		name: "activate_mcp_tool",
		description:
			"Activate/install a parked MCP tool, adding it to your active tools and swapping out the least used one.",
		strict: true,
		parameters: {
			type: "object",
			properties: {
				server_name: {
					type: "string",
					description: "The name of the MCP server",
				},
				tool_name: {
					type: "string",
					description: "The name of the tool to activate",
				},
			},
			required: ["server_name", "tool_name"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool

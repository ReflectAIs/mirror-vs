import type OpenAI from "openai"
import { McpHub } from "../../../../services/mcp/McpHub"
import { buildMcpToolName } from "../../../../utils/mcp-name"
import { normalizeToolSchema, type JsonSchema } from "../../../../utils/json-schema"

const searchMcpToolsDefinition: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "search_mcp_tools",
		description:
			"Search all available MCP tools (including parked/disabled tools). Only needed if total MCP tools exceed your active threshold limit.",
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
}

const activateMcpToolDefinition: OpenAI.Chat.ChatCompletionTool = {
	type: "function",
	function: {
		name: "activate_mcp_tool",
		description:
			"Activate/install a parked MCP tool, adding it to your active tools and swapping out the least used one.",
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
}

/**
 * Dynamically generates native tool definitions for all enabled tools across connected MCP servers.
 * If the total number of tools exceeds the configured threshold, the least recently/frequently
 * used tools are parked, and search_mcp_tools / activate_mcp_tool are appended instead.
 *
 * @param mcpHub The McpHub instance containing connected servers.
 * @returns An array of OpenAI.Chat.ChatCompletionTool definitions.
 */
export function getMcpServerTools(mcpHub?: McpHub): OpenAI.Chat.ChatCompletionTool[] {
	if (!mcpHub) {
		return []
	}

	const servers = mcpHub.getServers()
	const threshold = mcpHub.getProviderThreshold()

	// Gather all candidate tools
	interface CandidateTool {
		serverName: string
		tool: any
		lastUsed: number
		useCount: number
		displayName: string
	}

	const candidates: CandidateTool[] = []

	for (const server of servers) {
		if (!server.tools) {
			continue
		}
		for (const tool of server.tools) {
			// Filter tools where tool.enabledForPrompt is not explicitly false
			if (tool.enabledForPrompt === false) {
				continue
			}

			// Build sanitized tool name for API compliance
			const toolName = buildMcpToolName(server.name, tool.name)
			const usage = mcpHub.getToolUsage(server.name, tool.name)

			candidates.push({
				serverName: server.name,
				tool,
				lastUsed: usage?.lastUsed || 0,
				useCount: usage?.useCount || 0,
				displayName: toolName,
			})
		}
	}

	const isAboveThreshold = candidates.length > threshold

	// If total tools exceed threshold, sort by usage and slice
	const selectedTools = [...candidates]
	if (isAboveThreshold) {
		selectedTools.sort((a, b) => {
			if (b.lastUsed !== a.lastUsed) {
				return b.lastUsed - a.lastUsed
			}
			if (b.useCount !== a.useCount) {
				return b.useCount - a.useCount
			}
			return a.displayName.localeCompare(b.displayName)
		})
		// Keep the top "threshold" tools
		selectedTools.splice(threshold)
	}

	const seenToolNames = new Set<string>()
	const tools: OpenAI.Chat.ChatCompletionTool[] = []

	for (const candidate of selectedTools) {
		const { serverName, tool, displayName: toolName } = candidate
		if (seenToolNames.has(toolName)) {
			continue
		}
		seenToolNames.add(toolName)

		const originalSchema = tool.inputSchema as Record<string, unknown> | undefined

		// Normalize schema for JSON Schema 2020-12 compliance
		let parameters: JsonSchema
		if (originalSchema) {
			parameters = normalizeToolSchema(originalSchema) as JsonSchema
		} else {
			parameters = { type: "object", additionalProperties: false } as JsonSchema
		}

		const toolDefinition: OpenAI.Chat.ChatCompletionTool = {
			type: "function",
			function: {
				name: toolName,
				description: tool.description,
				parameters: parameters as OpenAI.FunctionParameters,
			},
		}

		tools.push(toolDefinition)
	}

	return tools
}

import { BaseTool, ToolCallbacks } from "./BaseTool"
import { Task } from "../task/Task"
import { buildMcpToolName } from "../../utils/mcp-name"

interface SearchMcpToolsParams {
	query?: string
}

export class SearchMcpToolsTool extends BaseTool<"search_mcp_tools"> {
	readonly name = "search_mcp_tools" as const

	async execute(params: SearchMcpToolsParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { pushToolResult, handleError } = callbacks
		const query = (params.query || "").toLowerCase().trim()

		try {
			const mcpHub = task.providerRef.deref()?.getMcpHub()
			if (!mcpHub) {
				pushToolResult("MCP Hub is not available.")
				return
			}

			const servers = mcpHub.getServers()
			const threshold = mcpHub.getProviderThreshold()

			// Get usage stats to sort active status
			const allTools: Array<{
				serverName: string
				name: string
				description: string
				lastUsed: number
				useCount: number
				displayName: string
			}> = []

			for (const server of servers) {
				if (!server.tools) {
					continue
				}
				for (const tool of server.tools) {
					if (tool.enabledForPrompt === false) {
						continue // skip disabled by user
					}
					const toolName = buildMcpToolName(server.name, tool.name)
					const usage = mcpHub.getToolUsage(server.name, tool.name)
					allTools.push({
						serverName: server.name,
						name: tool.name,
						description: tool.description || "",
						lastUsed: usage?.lastUsed || 0,
						useCount: usage?.useCount || 0,
						displayName: toolName,
					})
				}
			}

			// Sort to determine active vs parked
			allTools.sort((a, b) => {
				if (b.lastUsed !== a.lastUsed) {
					return b.lastUsed - a.lastUsed
				}
				if (b.useCount !== a.useCount) {
					return b.useCount - a.useCount
				}
				return a.displayName.localeCompare(b.displayName)
			})

			// Filter based on query
			const matches = allTools.filter((t) => {
				if (!query) {
					return true
				}
				return (
					t.name.toLowerCase().includes(query) ||
					t.serverName.toLowerCase().includes(query) ||
					t.description.toLowerCase().includes(query)
				)
			})

			if (matches.length === 0) {
				pushToolResult(`No MCP tools found matching query "${query}".`)
				return
			}

			const activeCount = Math.min(allTools.length, threshold)

			const lines = matches.map((t, idx) => {
				// Find overall index to determine if parked
				const overallIdx = allTools.findIndex(
					(item) => item.serverName === t.serverName && item.name === t.name,
				)
				const status = overallIdx < threshold ? "Active" : "Parked"
				return `- **Server:** \`${t.serverName}\`\n  **Tool Name:** \`${t.name}\`\n  **Import Name:** \`${t.displayName}\`\n  **Status:** **${status}**\n  **Description:** ${t.description || "*No description*"}`
			})

			const result = `Found ${matches.length} tools:\n\n${lines.join("\n\n")}\n\n*To use a Parked tool, run \`activate_mcp_tool(server_name, tool_name)\` first.*`
			pushToolResult(result)
		} catch (error) {
			await handleError("searching MCP tools", error as Error)
		}
	}
}

export const searchMcpToolsTool = new SearchMcpToolsTool()

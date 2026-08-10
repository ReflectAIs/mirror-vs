import { BaseTool, ToolCallbacks } from "./BaseTool"
import { Task } from "../task/Task"
import { buildMcpToolName } from "../../utils/mcp-name"

interface ActivateMcpToolParams {
	server_name: string
	tool_name: string
}

export class ActivateMcpToolTool extends BaseTool<"activate_mcp_tool"> {
	readonly name = "activate_mcp_tool" as const

	async execute(params: ActivateMcpToolParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { pushToolResult, handleError } = callbacks
		const serverName = (params.server_name || "").trim()
		const toolName = (params.tool_name || "").trim()

		if (!serverName || !toolName) {
			pushToolResult("Both server_name and tool_name parameters are required.")
			return
		}

		try {
			const provider = task.providerRef.deref()
			const mcpHub = provider?.getMcpHub()
			if (!mcpHub) {
				pushToolResult("MCP Hub is not available.")
				return
			}

			// Verify that the server exists
			const servers = mcpHub.getServers()
			const server = servers.find((s) => s.name === serverName)
			if (!server) {
				pushToolResult(`MCP server "${serverName}" is not active or connected.`)
				return
			}

			// Verify that the tool exists
			const tool = server.tools?.find((t) => t.name === toolName)
			if (!tool) {
				pushToolResult(`MCP tool "${toolName}" was not found on server "${serverName}".`)
				return
			}

			// Activate explicitly in the hub
			await mcpHub.activateToolExplicitly(serverName, toolName)

			// Notify user/log
			await task.say(
				"progress",
				`Activated MCP tool \`${toolName}\` from server \`${serverName}\`. Swapping it into active prompt tools.`,
			)

			// Trigger a state push to the webview
			if (provider) {
				await provider.postStateToWebview()
			}

			pushToolResult(
				`MCP tool "${toolName}" from server "${serverName}" has been successfully activated. It is now registered as an active tool. You can call it now as \`${buildMcpToolName(serverName, toolName)}\`.`,
			)
		} catch (error) {
			await handleError("activating MCP tool", error as Error)
		}
	}
}

export const activateMcpToolTool = new ActivateMcpToolTool()

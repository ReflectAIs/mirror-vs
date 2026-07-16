import { Task } from "../task/Task"
import type { ToolUse } from "../../shared/tools"
import { SearchProviderRouter } from "../../api/search/router"

import { BaseTool, ToolCallbacks } from "./BaseTool"

interface WebSearchParams {
	query: string
}

export class WebSearchTool extends BaseTool<"web_search"> {
	readonly name = "web_search" as const

	async execute(params: WebSearchParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { askApproval, handleError, pushToolResult } = callbacks

		console.log("[WebSearchTool] execute called with params:", JSON.stringify(params))

		if (!params.query) {
			console.warn("[WebSearchTool] Missing query parameter")
			pushToolResult("Missing required parameter 'query' for web_search.")
			return
		}

		try {
			console.log("[WebSearchTool] Calling SearchProviderRouter.search for query:", params.query)
			const results = await SearchProviderRouter.search(params.query)
			console.log("[WebSearchTool] Search returned", results.length, "results")

			const output =
				results
					.map((r) => {
						let entry = ""
						if (r.title) entry += `Title: ${r.title}\n`
						entry += `URL: ${r.url}\nSnippet: ${r.snippet}\n`
						return entry
					})
					.join("---\n") || "No web search results found."

			console.log("[WebSearchTool] Formatted output length:", output.length)
			pushToolResult(output)
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e)
			console.error("[WebSearchTool] Search failed:", message)
			await handleError("web_search", new Error(message))
			pushToolResult(`Web search failed: ${message}`)
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"web_search">): Promise<void> {
		// No partial handling needed for web search — just let it stream in
	}
}

export const webSearchTool = new WebSearchTool()

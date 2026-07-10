import { Task } from "../task/Task"
import type { ToolUse } from "../../shared/tools"

import { BaseTool, ToolCallbacks } from "./BaseTool"

interface WebSearchParams {
	query: string
}

export class WebSearchTool extends BaseTool<"web_search"> {
	readonly name = "web_search" as const

	async execute(params: WebSearchParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { askApproval, handleError, pushToolResult } = callbacks

		if (!params.query) {
			pushToolResult("Missing required parameter 'query' for web_search.")
			return
		}

		const query = encodeURIComponent(params.query)

		try {
			const res = await fetch(`https://html.duckduckgo.com/html/?q=${query}`, {
				headers: {
					"User-Agent":
						"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
				},
			})

			if (!res.ok) {
				pushToolResult(`Web search failed: HTTP ${res.status} ${res.statusText}`)
				return
			}

			const text = await res.text()

			const results: Array<{ url: string; snippet: string }> = []
			const regex = /<a class="result__snippet[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gs
			let match: RegExpExecArray | null

			while ((match = regex.exec(text)) !== null) {
				let url = match[1]
				if (url.startsWith("//duckduckgo.com/l/?uddg=")) {
					url = decodeURIComponent(url.split("uddg=")[1].split("&")[0])
				}
				const snippet = match[2].replace(/<b>/g, "").replace(/<\/b>/g, "").trim()
				results.push({ url, snippet })
			}

			const output =
				results
					.slice(0, 5)
					.map((r) => `URL: ${r.url}\nSnippet: ${r.snippet}\n`)
					.join("---\n") || "No web search results found."

			pushToolResult(output)
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e)
			await handleError("web_search", new Error(message))
			pushToolResult(`Web search failed: ${message}`)
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"web_search">): Promise<void> {
		// No partial handling needed for web search — just let it stream in
	}
}

export const webSearchTool = new WebSearchTool()

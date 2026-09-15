import { Task } from "../task/Task"
import type { ToolUse } from "../../shared/tools"
import { SearchProviderRouter } from "../../api/search/router"
import { UrlFetcher } from "../../services/research/fetcher"
import { PageParser } from "../../services/research/parser"
import type { SearchResult } from "../../api/search/types"

import { BaseTool, ToolCallbacks } from "./BaseTool"

interface WebSearchParams {
	query: string
}

/** Keywords that signal the user wants deeper technical content */
const ENRICH_KEYWORDS = [
	"how to",
	"example",
	"tutorial",
	"docs",
	"documentation",
	"api",
	"error",
	"fix",
	"issue",
	"configure",
	"setup",
	"install",
	"guide",
	"reference",
	"usage",
]

/** Max chars from a page to include as a content preview */
const PREVIEW_MAX_CHARS = 3_000

/** Timeout for fetching each individual page when enriching */
const ENRICH_TIMEOUT_MS = 8_000

/** Total time budget for enrichment across all pages (ms) */
const ENRICH_TOTAL_TIMEOUT_MS = 15_000

export class WebSearchTool extends BaseTool<"web_search"> {
	readonly name = "web_search" as const

	async execute(params: WebSearchParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { handleError, pushToolResult } = callbacks

		if (!params.query) {
			pushToolResult("Missing required parameter 'query' for web_search.")
			return
		}

		try {
			const results = await SearchProviderRouter.search(params.query, { maxResults: 8 })

			if (!results || results.length === 0) {
				pushToolResult(`No web search results found for: "${params.query}"`)
				return
			}

			// Determine if we should enrich results with page content
			const shouldEnrich = this.shouldEnrichResults(params.query, results)

			let enrichedResults = results
			if (shouldEnrich) {
				enrichedResults = await this.enrichTopResults(results)
			}

			const output = this.formatResults(params.query, enrichedResults)
			pushToolResult(output)
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e)
			console.error("[WebSearchTool] Search failed:", message)
			await handleError("web_search", new Error(message))
			pushToolResult(`Web search failed: ${message}`)
		}
	}

	/**
	 * Decide whether to enrich results with page content.
	 * Enrich when: query has research intent keywords OR snippets are very short.
	 */
	private shouldEnrichResults(query: string, results: SearchResult[]): boolean {
		const lowerQuery = query.toLowerCase()
		const hasResearchIntent = ENRICH_KEYWORDS.some((kw) => lowerQuery.includes(kw))

		const avgSnippetLen =
			results.slice(0, 3).reduce((sum, r) => sum + (r.snippet?.length ?? 0), 0) / Math.min(results.length, 3)

		const snippetsAreThin = avgSnippetLen < 150

		return hasResearchIntent || snippetsAreThin
	}

	/**
	 * Fetch and extract content from the top results concurrently.
	 * Respects a total time budget and per-page timeout.
	 * Returns results with an added `preview` field (injected into metadata).
	 */
	private async enrichTopResults(results: SearchResult[], maxToEnrich = 2): Promise<SearchResult[]> {
		const toEnrich = results.slice(0, maxToEnrich)
		const rest = results.slice(maxToEnrich)

		const totalDeadline = Date.now() + ENRICH_TOTAL_TIMEOUT_MS

		const enriched = await Promise.all(
			toEnrich.map(async (result): Promise<SearchResult> => {
				const remaining = totalDeadline - Date.now()
				if (remaining <= 0) return result

				try {
					const controller = new AbortController()
					const timeoutId = setTimeout(() => controller.abort(), Math.min(ENRICH_TIMEOUT_MS, remaining))

					const fetcher = new UrlFetcher({
						timeoutMs: Math.min(ENRICH_TIMEOUT_MS, remaining),
						signal: controller.signal,
					})

					const fetchResult = await fetcher.fetch(result.url)
					clearTimeout(timeoutId)

					if (!fetchResult.content) return result

					const parser = new PageParser({ maxLength: PREVIEW_MAX_CHARS * 2, keepLinks: false })
					const parsed = parser.parse(fetchResult.content, result.url)

					const preview = parsed.markdown.slice(0, PREVIEW_MAX_CHARS)
					const title = parsed.title || result.title

					return {
						...result,
						title,
						metadata: {
							...result.metadata,
							preview,
							publishDate: parsed.publishDate,
						},
					}
				} catch {
					// Enrichment failure is non-fatal — return original result
					return result
				}
			}),
		)

		return [...enriched, ...rest]
	}

	/**
	 * Format search results into structured markdown for the model.
	 */
	private formatResults(query: string, results: SearchResult[]): string {
		const lines: string[] = [`Web search results for: "${query}"`, `Found ${results.length} results.`, ""]

		results.forEach((r, i) => {
			lines.push(`## Result ${i + 1}`)
			lines.push(`**Title:** ${r.title || "(no title)"}`)
			lines.push(`**URL:** ${r.url}`)
			if (r.snippet) {
				lines.push(`**Snippet:** ${r.snippet}`)
			}

			const preview = r.metadata?.preview as string | undefined
			if (preview && preview.trim()) {
				lines.push(`**Content Preview:**`)
				lines.push("```")
				lines.push(preview.trim())
				lines.push("```")
			}

			lines.push("---")
		})

		return lines.join("\n")
	}

	override async handlePartial(task: Task, block: ToolUse<"web_search">): Promise<void> {
		// No partial handling needed for web search — just let it stream in
	}
}

export const webSearchTool = new WebSearchTool()

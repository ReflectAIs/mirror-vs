/**
 * D-4: URL Reader Tool
 *
 * Reads a URL and returns its cleaned content.
 * Combines the URL Fetcher (C-1) + Page Parser (C-2) pipeline into a single tool.
 *
 * This gives the LLM the ability to fetch and read any web page directly.
 */

import { Task } from "../task/Task"
import type { ToolUse } from "../../shared/tools"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import { UrlFetcher } from "../../services/research/fetcher"
import { PageParser } from "../../services/research/parser"

// ─── Types ───────────────────────────────────────────────────────────────────

interface ReadUrlParams {
	/** The URL to read */
	url: string
	/** Max characters to return (default: 10_000) */
	maxLength?: number
	/** Whether to extract just the text (skip markdown conversion) */
	plainTextOnly?: boolean
}

// ─── Tool ────────────────────────────────────────────────────────────────────

export class ReadUrlTool extends BaseTool<"read_url"> {
	readonly name = "read_url" as const

	async execute(params: ReadUrlParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { askApproval, handleError, pushToolResult } = callbacks

		if (!params.url) {
			pushToolResult("Missing required parameter 'url' for read_url.")
			return
		}

		// Basic URL validation
		try {
			new URL(params.url)
		} catch {
			pushToolResult(
				`Invalid URL: ${params.url}. Please provide a valid URL including protocol (e.g., https://example.com).`,
			)
			return
		}

		const maxLength = Math.min(params.maxLength ?? 10_000, 50_000)

		try {
			const fetcher = new UrlFetcher({ timeoutMs: 15_000 })
			const fetchResult = await fetcher.fetch(params.url)

			if (!fetchResult.content) {
				pushToolResult(`Failed to fetch content from ${params.url}: ${fetchResult.error ?? "Empty response"}`)
				return
			}

			if (params.plainTextOnly) {
				// Return raw text content
				const text = fetchResult.content.slice(0, maxLength)
				const header = `Title: ${fetchResult.title}\nURL: ${fetchResult.finalUrl}\nType: ${fetchResult.contentType}\n\n`
				pushToolResult(header + text)
				return
			}

			// Parse HTML to clean markdown
			const parser = new PageParser({ maxLength, keepLinks: true })
			const parsed = parser.parse(fetchResult.content, fetchResult.finalUrl)

			const output = [
				`Title: ${parsed.title}`,
				`URL: ${fetchResult.finalUrl}`,
				`Fetched via: ${fetchResult.usedBrowser ? "Browser (Puppeteer)" : "HTTP"}`,
				`Reading time: ~${Math.ceil(parsed.readingTimeSec / 60)} min`,
				``,
				parsed.markdown,
			].join("\n")

			pushToolResult(output)
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e)
			await handleError("read_url", new Error(message))
			pushToolResult(`Failed to read URL: ${message}`)
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"read_url">): Promise<void> {
		// No partial handling needed
	}
}

export const readUrlTool = new ReadUrlTool()

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { webSearchTool } from "../WebSearchTool"
import { Task } from "../../task/Task"
import type { ToolUse } from "../../../shared/tools"
import { SearchProviderRegistry } from "../../../api/search/registry"
import { DuckDuckGoProvider } from "../../../api/search/providers/duckduckgo"

// Prevent enrichment side-effects in unit tests — UrlFetcher always rejects
vi.mock("../../../services/research/fetcher", () => ({
	UrlFetcher: vi.fn().mockImplementation(() => ({
		fetch: vi.fn().mockRejectedValue(new Error("mocked fetch — enrichment disabled in tests")),
	})),
}))

describe("webSearchTool", () => {
	let mockTask: any
	let mockCallbacks: any

	/**
	 * Mock HTML using the block-based structure our new DuckDuckGo parser expects.
	 * Each result block starts with <div class="result results_links ..."> and contains:
	 *   - <a class="result__a" href="URL"> for the title + URL
	 *   - <a class="result__snippet" href="..."> for the snippet
	 */
	const mockHtmlResults = `<!DOCTYPE html>
<html>
<body>
<div class="results">
<div class="result results_links results_links_deep web-result">
  <h2 class="result__title">
    <a class="result__a" href="https://example.com/result1">Example Result 1</a>
  </h2>
  <a class="result__snippet" href="https://example.com/result1">This is a snippet for the first example result used in testing.</a>
</div>
<div class="result results_links results_links_deep web-result">
  <h2 class="result__title">
    <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fgithub.com%2Ftest&rut=abc">GitHub Test Result</a>
  </h2>
  <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fgithub.com%2Ftest&rut=abc">GitHub snippet text here for testing purposes.</a>
</div>
<div class="result results_links results_links_deep web-result">
  <h2 class="result__title">
    <a class="result__a" href="https://example.com/result3">Example Result 3</a>
  </h2>
  <a class="result__snippet" href="https://example.com/result3">Third result snippet text here.</a>
</div>
</div>
</body>
</html>`

	beforeEach(() => {
		vi.clearAllMocks()

		// Register the DuckDuckGo provider so SearchProviderRouter can find it
		if (!SearchProviderRegistry.isRegistered("duckduckgo")) {
			SearchProviderRegistry.register("duckduckgo", new DuckDuckGoProvider())
		}

		mockTask = {
			consecutiveMistakeCount: 0,
			recordToolError: vi.fn(),
			didToolFailInCurrentTurn: false,
		}

		mockCallbacks = {
			askApproval: vi.fn().mockResolvedValue(true),
			handleError: vi.fn(),
			pushToolResult: vi.fn(),
		}

		// Mock global fetch
		global.fetch = vi.fn()
	})

	afterAll(() => {
		SearchProviderRegistry.unregister("duckduckgo")
	})

	it("should handle missing query parameter", async () => {
		const block: ToolUse<"web_search"> = {
			type: "tool_use" as const,
			name: "web_search" as const,
			params: {},
			partial: false,
			nativeArgs: {
				query: "",
			},
		}

		await webSearchTool.handle(mockTask as Task, block, mockCallbacks)

		expect(mockCallbacks.pushToolResult).toHaveBeenCalledWith("Missing required parameter 'query' for web_search.")
		expect(global.fetch).not.toHaveBeenCalled()
	})

	it("should perform a successful web search", async () => {
		;(global.fetch as any).mockResolvedValue({
			ok: true,
			status: 200,
			text: vi.fn().mockResolvedValue(mockHtmlResults),
		})

		const block: ToolUse<"web_search"> = {
			type: "tool_use" as const,
			name: "web_search" as const,
			params: { query: "test search" },
			partial: false,
			nativeArgs: {
				query: "test search",
			},
		}

		await webSearchTool.handle(mockTask as Task, block, mockCallbacks)

		expect(global.fetch).toHaveBeenCalledWith(
			"https://html.duckduckgo.com/html/",
			expect.objectContaining({
				method: "POST",
				headers: expect.objectContaining({
					"User-Agent": expect.stringContaining("Mozilla"),
					"Content-Type": "application/x-www-form-urlencoded",
				}),
				body: "q=test+search",
			}),
		)

		expect(mockCallbacks.pushToolResult).toHaveBeenCalled()
		const result = mockCallbacks.pushToolResult.mock.calls[0][0] as string
		// New format uses markdown bold headings
		expect(result).toContain("**URL:** https://example.com/result1")
		expect(result).toContain("**Snippet:** This is a snippet for the first example result used in testing.")
		expect(result).toContain("---")
	})

	it("should decode DuckDuckGo redirect URLs", async () => {
		;(global.fetch as any).mockResolvedValue({
			ok: true,
			status: 200,
			text: vi.fn().mockResolvedValue(mockHtmlResults),
		})

		const block: ToolUse<"web_search"> = {
			type: "tool_use" as const,
			name: "web_search" as const,
			params: { query: "test" },
			partial: false,
			nativeArgs: {
				query: "test",
			},
		}

		await webSearchTool.handle(mockTask as Task, block, mockCallbacks)

		const result = mockCallbacks.pushToolResult.mock.calls[0][0] as string
		expect(result).toContain("**URL:** https://github.com/test")
		expect(result).toContain("**Snippet:** GitHub snippet text here for testing purposes.")
	})

	it("should handle no results found", async () => {
		;(global.fetch as any).mockResolvedValue({
			ok: true,
			status: 200,
			text: vi.fn().mockResolvedValue("<html><body>No results</body></html>"),
		})

		const block: ToolUse<"web_search"> = {
			type: "tool_use" as const,
			name: "web_search" as const,
			params: { query: "xyznonexistent123" },
			partial: false,
			nativeArgs: {
				query: "xyznonexistent123",
			},
		}

		await webSearchTool.handle(mockTask as Task, block, mockCallbacks)

		expect(mockCallbacks.pushToolResult).toHaveBeenCalledWith(
			`No web search results found for: "xyznonexistent123"`,
		)
	})

	it("should handle HTTP errors", async () => {
		;(global.fetch as any).mockResolvedValue({
			ok: false,
			status: 503,
			statusText: "Service Unavailable",
		})

		const block: ToolUse<"web_search"> = {
			type: "tool_use" as const,
			name: "web_search" as const,
			params: { query: "test" },
			partial: false,
			nativeArgs: {
				query: "test",
			},
		}

		await webSearchTool.handle(mockTask as Task, block, mockCallbacks)

		expect(mockCallbacks.pushToolResult).toHaveBeenCalledWith(
			expect.stringContaining("HTTP 503 Service Unavailable"),
		)
	})

	it("should handle fetch exceptions", async () => {
		;(global.fetch as any).mockRejectedValue(new Error("Network error"))

		const block: ToolUse<"web_search"> = {
			type: "tool_use" as const,
			name: "web_search" as const,
			params: { query: "test" },
			partial: false,
			nativeArgs: {
				query: "test",
			},
		}

		await webSearchTool.handle(mockTask as Task, block, mockCallbacks)

		expect(mockCallbacks.handleError).toHaveBeenCalledWith(
			"web_search",
			expect.objectContaining({
				message: expect.stringContaining("Network error"),
			}),
		)
		expect(mockCallbacks.pushToolResult).toHaveBeenCalledWith(expect.stringContaining("Network error"))
	})

	it("should return up to 8 results", async () => {
		// Generate 10 result blocks in the new block-based format
		const manyResultsHtml = `<html><body>${Array.from(
			{ length: 10 },
			(_, i) => `
<div class="result results_links results_links_deep web-result">
  <h2><a class="result__a" href="https://example.com/${i}">Result ${i} Title</a></h2>
  <a class="result__snippet" href="https://example.com/${i}">Snippet for result ${i} with enough text here.</a>
</div>`,
		).join("\n")}</body></html>`

		;(global.fetch as any).mockResolvedValue({
			ok: true,
			status: 200,
			text: vi.fn().mockResolvedValue(manyResultsHtml),
		})

		const block: ToolUse<"web_search"> = {
			type: "tool_use" as const,
			name: "web_search" as const,
			params: { query: "test" },
			partial: false,
			nativeArgs: {
				query: "test",
			},
		}

		await webSearchTool.handle(mockTask as Task, block, mockCallbacks)

		const result = mockCallbacks.pushToolResult.mock.calls[0][0] as string
		const urlMatches = result.match(/\*\*URL:\*\*/g)
		// We request maxResults: 8, so at most 8 URLs should be returned
		expect(urlMatches).not.toBeNull()
		expect(urlMatches!.length).toBeLessThanOrEqual(8)
		expect(urlMatches!.length).toBeGreaterThan(0)
	})

	it("should include result header and count in output", async () => {
		;(global.fetch as any).mockResolvedValue({
			ok: true,
			status: 200,
			text: vi.fn().mockResolvedValue(mockHtmlResults),
		})

		const block: ToolUse<"web_search"> = {
			type: "tool_use" as const,
			name: "web_search" as const,
			params: { query: "my query" },
			partial: false,
			nativeArgs: { query: "my query" },
		}

		await webSearchTool.handle(mockTask as Task, block, mockCallbacks)

		const result = mockCallbacks.pushToolResult.mock.calls[0][0] as string
		expect(result).toContain('Web search results for: "my query"')
		expect(result).toContain("Found 3 results.")
		expect(result).toContain("## Result 1")
	})

	it("handlePartial should be a no-op", async () => {
		// handlePartial should not throw and should not call pushToolResult
		const block: ToolUse<"web_search"> = {
			type: "tool_use" as const,
			name: "web_search" as const,
			params: { query: "test" },
			partial: true,
			nativeArgs: {
				query: "test",
			},
		}

		await webSearchTool.handlePartial(mockTask as Task, block)

		expect(mockCallbacks.pushToolResult).not.toHaveBeenCalled()
	})
})

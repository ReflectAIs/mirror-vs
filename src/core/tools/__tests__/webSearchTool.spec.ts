import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { webSearchTool } from "../WebSearchTool"
import { Task } from "../../task/Task"
import type { ToolUse } from "../../../shared/tools"
import { SearchProviderRegistry } from "../../../api/search/registry"
import { DuckDuckGoProvider } from "../../../api/search/providers/duckduckgo"

describe("webSearchTool", () => {
	let mockTask: any
	let mockCallbacks: any

	const mockHtmlResults = `<!DOCTYPE html>
<html>
<body>
<div class="results">
<a class="result__snippet" href="https://example.com/result1">Example <b>Result</b> 1</a>
<a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fgithub.com%2Ftest&rut=abc">GitHub <b>Test</b> Result</a>
<a class="result__snippet" href="https://example.com/result3">Example Result 3</a>
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
		expect(result).toContain("URL: https://example.com/result1")
		expect(result).toContain("Snippet: Example Result 1")
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
		expect(result).toContain("URL: https://github.com/test")
		expect(result).toContain("Snippet: GitHub Test Result")
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

		expect(mockCallbacks.pushToolResult).toHaveBeenCalledWith("No web search results found.")
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
				message: "Network error",
			}),
		)
		expect(mockCallbacks.pushToolResult).toHaveBeenCalledWith(
			expect.stringContaining("Web search failed: Network error"),
		)
	})

	it("should limit results to 5", async () => {
		const manyResultsHtml = Array.from(
			{ length: 10 },
			(_, i) => `<a class="result__snippet" href="https://example.com/${i}">Result ${i}</a>`,
		).join("\n")

		;(global.fetch as any).mockResolvedValue({
			ok: true,
			status: 200,
			text: vi.fn().mockResolvedValue(`<html><body>${manyResultsHtml}</body></html>`),
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
		const urlMatches = result.match(/URL:/g)
		expect(urlMatches).toHaveLength(5)
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

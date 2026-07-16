import { describe, it, expect, vi, beforeEach } from "vitest"
import { readUrlTool } from "../ReadUrlTool"
import { Task } from "../../task/Task"
import type { ToolUse } from "../../../shared/tools"

// Mock the UrlFetcher and PageParser
vi.mock("../../../services/research/fetcher", () => ({
	UrlFetcher: vi.fn().mockImplementation(() => ({
		fetch: vi.fn(),
	})),
}))

vi.mock("../../../services/research/parser", () => ({
	PageParser: vi.fn().mockImplementation(() => ({
		parse: vi.fn(),
	})),
}))

// Need to import the mocked modules
import { UrlFetcher } from "../../../services/research/fetcher"
import { PageParser } from "../../../services/research/parser"

describe("readUrlTool", () => {
	let mockTask: any
	let mockCallbacks: any
	let mockFetchResult: any
	let mockParseResult: any

	beforeEach(() => {
		vi.clearAllMocks()

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

		mockFetchResult = {
			content: "<html><body><h1>Test Page</h1><p>Hello World</p></body></html>",
			title: "Test Page",
			finalUrl: "https://example.com/test",
			contentType: "text/html",
			usedBrowser: false,
			error: null,
		}

		mockParseResult = {
			title: "Test Page",
			markdown: "# Test Page\n\nHello World",
			readingTimeSec: 30,
		}

		// Configure mock implementations
		const mockFetcherInstance = (UrlFetcher as any).mock.results[0]?.value
		if (mockFetcherInstance) {
			mockFetcherInstance.fetch.mockResolvedValue(mockFetchResult)
		}
	})

	it("should handle missing url parameter", async () => {
		const block: ToolUse<"read_url"> = {
			type: "tool_use" as const,
			name: "read_url" as const,
			params: {} as any,
			partial: false,
			nativeArgs: {
				url: "",
			},
		}

		await readUrlTool.handle(mockTask as Task, block, mockCallbacks)

		expect(mockCallbacks.pushToolResult).toHaveBeenCalledWith("Missing required parameter 'url' for read_url.")
	})

	it("should validate URL format", async () => {
		const block: ToolUse<"read_url"> = {
			type: "tool_use" as const,
			name: "read_url" as const,
			params: {} as any,
			partial: false,
			nativeArgs: {
				url: "not-a-valid-url",
			},
		}

		await readUrlTool.handle(mockTask as Task, block, mockCallbacks)

		expect(mockCallbacks.pushToolResult).toHaveBeenCalledWith(expect.stringContaining("Invalid URL"))
	})

	it("should fetch and parse a URL successfully", async () => {
		// Set up the mock fetcher for this test
		const UrlFetcherMock = UrlFetcher as any
		// We need to reset the mock to get a fresh instance
		UrlFetcherMock.mockClear()
		PageParser as any

		const mockFetch = vi.fn().mockResolvedValue(mockFetchResult)
		const mockParse = vi.fn().mockReturnValue(mockParseResult)

		UrlFetcherMock.mockImplementation(() => ({
			fetch: mockFetch,
		}))
		;(PageParser as any).mockImplementation(() => ({
			parse: mockParse,
		}))

		// Re-import to get fresh instances
		const { readUrlTool: freshTool } = await import("../ReadUrlTool")

		const block: ToolUse<"read_url"> = {
			type: "tool_use" as const,
			name: "read_url" as const,
			params: {} as any,
			partial: false,
			nativeArgs: {
				url: "https://example.com/test",
			},
		}

		await freshTool.handle(mockTask as Task, block, mockCallbacks)

		expect(mockFetch).toHaveBeenCalledWith("https://example.com/test")
		expect(mockParse).toHaveBeenCalledWith(mockFetchResult.content, mockFetchResult.finalUrl)

		const result = mockCallbacks.pushToolResult.mock.calls[0][0] as string
		expect(result).toContain("Title: Test Page")
		expect(result).toContain("URL: https://example.com/test")
		expect(result).toContain("Fetched via: HTTP")
		expect(result).toContain("Reading time: ~1 min")
		expect(result).toContain("# Test Page")
	})

	it("should return plain text when plainTextOnly is true", async () => {
		const mockFetch = vi.fn().mockResolvedValue(mockFetchResult)
		;(UrlFetcher as any).mockImplementation(() => ({
			fetch: mockFetch,
		}))

		// Re-import to get fresh instances
		const { readUrlTool: freshTool } = await import("../ReadUrlTool")

		const block: ToolUse<"read_url"> = {
			type: "tool_use" as const,
			name: "read_url" as const,
			params: {} as any,
			partial: false,
			nativeArgs: {
				url: "https://example.com/test",
				plainTextOnly: true,
			},
		}

		await freshTool.handle(mockTask as Task, block, mockCallbacks)

		const result = mockCallbacks.pushToolResult.mock.calls[0][0] as string
		expect(result).toContain("Title: Test Page")
		expect(result).toContain("URL: https://example.com/test")
		expect(result).toContain("Type: text/html")
		expect(result).toContain(mockFetchResult.content)
	})

	it("should handle empty fetch content", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			content: null,
			title: null,
			finalUrl: "https://example.com/empty",
			contentType: "text/html",
			usedBrowser: false,
			error: "Empty response",
		})
		;(UrlFetcher as any).mockImplementation(() => ({
			fetch: mockFetch,
		}))

		const { readUrlTool: freshTool } = await import("../ReadUrlTool")

		const block: ToolUse<"read_url"> = {
			type: "tool_use" as const,
			name: "read_url" as const,
			params: {} as any,
			partial: false,
			nativeArgs: {
				url: "https://example.com/empty",
			},
		}

		await freshTool.handle(mockTask as Task, block, mockCallbacks)

		expect(mockCallbacks.pushToolResult).toHaveBeenCalledWith(expect.stringContaining("Failed to fetch content"))
	})

	it("should handle fetch exceptions", async () => {
		const mockFetch = vi.fn().mockRejectedValue(new Error("Connection timeout"))
		;(UrlFetcher as any).mockImplementation(() => ({
			fetch: mockFetch,
		}))

		const { readUrlTool: freshTool } = await import("../ReadUrlTool")

		const block: ToolUse<"read_url"> = {
			type: "tool_use" as const,
			name: "read_url" as const,
			params: {} as any,
			partial: false,
			nativeArgs: {
				url: "https://example.com/slow",
			},
		}

		await freshTool.handle(mockTask as Task, block, mockCallbacks)

		expect(mockCallbacks.handleError).toHaveBeenCalledWith(
			"read_url",
			expect.objectContaining({
				message: "Connection timeout",
			}),
		)
		expect(mockCallbacks.pushToolResult).toHaveBeenCalledWith(
			expect.stringContaining("Failed to read URL: Connection timeout"),
		)
	})

	it("handlePartial should be a no-op", async () => {
		const block: ToolUse<"read_url"> = {
			type: "tool_use" as const,
			name: "read_url" as const,
			params: {} as any,
			partial: true,
			nativeArgs: {
				url: "https://example.com/test",
			},
		}

		await readUrlTool.handlePartial(mockTask as Task, block)

		expect(mockCallbacks.pushToolResult).not.toHaveBeenCalled()
	})
})

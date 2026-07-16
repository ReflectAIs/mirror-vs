import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { docsSearchTool } from "../DocsSearchTool"
import { Task } from "../../task/Task"
import type { ToolUse } from "../../../shared/tools"
import { SearchProviderRouter } from "../../../api/search/router"
import { SearchProviderRegistry } from "../../../api/search/registry"
import { DuckDuckGoProvider } from "../../../api/search/providers/duckduckgo"

describe("docsSearchTool", () => {
	let mockTask: any
	let mockCallbacks: any
	let searchSpy: any

	const mockResults = [
		{
			title: "React Hooks Documentation",
			url: "https://react.dev/hooks",
			snippet: "Hooks let you use state and other React features without writing a class.",
		},
		{
			title: "React useState",
			url: "https://react.dev/reference/useState",
			snippet: "useState is a Hook that lets you add state to functional components.",
		},
	]

	beforeEach(() => {
		vi.clearAllMocks()

		// Register the DuckDuckGo provider so SearchProviderRouter can find it
		if (!SearchProviderRegistry.isRegistered("duckduckgo")) {
			SearchProviderRegistry.register("duckduckgo", new DuckDuckGoProvider())
		}

		// Spy on SearchProviderRouter.search to return controlled results
		searchSpy = vi.spyOn(SearchProviderRouter, "search").mockResolvedValue(mockResults)

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
	})

	afterAll(() => {
		SearchProviderRegistry.unregister("duckduckgo")
	})

	it("should handle missing query parameter", async () => {
		const block: ToolUse<"docs_search"> = {
			type: "tool_use" as const,
			name: "docs_search" as const,
			params: {} as any,
			partial: false,
			nativeArgs: {
				query: "",
			},
		}

		await docsSearchTool.handle(mockTask as Task, block, mockCallbacks)

		expect(mockCallbacks.pushToolResult).toHaveBeenCalledWith("Missing required parameter 'query' for docs_search.")
		expect(searchSpy).not.toHaveBeenCalled()
	})

	it("should perform a successful docs search with a docKey", async () => {
		const block: ToolUse<"docs_search"> = {
			type: "tool_use" as const,
			name: "docs_search" as const,
			params: {} as any,
			partial: false,
			nativeArgs: {
				query: "hooks",
				docKey: "react",
			},
		}

		await docsSearchTool.handle(mockTask as Task, block, mockCallbacks)

		// Should append site:react.dev to the query
		expect(searchSpy).toHaveBeenCalledWith("hooks site:react.dev", { maxResults: 5 })

		expect(mockCallbacks.pushToolResult).toHaveBeenCalled()
		const result = mockCallbacks.pushToolResult.mock.calls[0][0] as string
		expect(result).toContain("## React Documentation Results")
		expect(result).toContain("URL: https://react.dev/hooks")
		expect(result).toContain("---")
	})

	it("should perform a successful docs search without a docKey", async () => {
		const block: ToolUse<"docs_search"> = {
			type: "tool_use" as const,
			name: "docs_search" as const,
			params: {} as any,
			partial: false,
			nativeArgs: {
				query: "typescript generics",
			},
		}

		await docsSearchTool.handle(mockTask as Task, block, mockCallbacks)

		// Without docKey, query is passed as-is (no site filter)
		expect(searchSpy).toHaveBeenCalledWith("typescript generics", { maxResults: 5 })

		const result = mockCallbacks.pushToolResult.mock.calls[0][0] as string
		expect(result).toContain("URL: https://react.dev/hooks")
		// No site-specific header when no docKey
		expect(result).not.toContain("## React Documentation Results")
	})

	it("should handle no results found", async () => {
		searchSpy.mockResolvedValue([])

		const block: ToolUse<"docs_search"> = {
			type: "tool_use" as const,
			name: "docs_search" as const,
			params: {} as any,
			partial: false,
			nativeArgs: {
				query: "xyznonexistent",
				docKey: "react",
			},
		}

		await docsSearchTool.handle(mockTask as Task, block, mockCallbacks)

		expect(mockCallbacks.pushToolResult).toHaveBeenCalledWith("No documentation results found on React.")
	})

	it("should handle no results without docKey", async () => {
		searchSpy.mockResolvedValue([])

		const block: ToolUse<"docs_search"> = {
			type: "tool_use" as const,
			name: "docs_search" as const,
			params: {} as any,
			partial: false,
			nativeArgs: {
				query: "xyznonexistent",
			},
		}

		await docsSearchTool.handle(mockTask as Task, block, mockCallbacks)

		expect(mockCallbacks.pushToolResult).toHaveBeenCalledWith("No documentation results found.")
	})

	it("should handle errors from search provider", async () => {
		searchSpy.mockRejectedValue(new Error("Provider unavailable"))

		const block: ToolUse<"docs_search"> = {
			type: "tool_use" as const,
			name: "docs_search" as const,
			params: {} as any,
			partial: false,
			nativeArgs: {
				query: "hooks",
				docKey: "react",
			},
		}

		await docsSearchTool.handle(mockTask as Task, block, mockCallbacks)

		expect(mockCallbacks.handleError).toHaveBeenCalledWith(
			"docs_search",
			expect.objectContaining({
				message: "Provider unavailable",
			}),
		)
		expect(mockCallbacks.pushToolResult).toHaveBeenCalledWith(
			expect.stringContaining("Documentation search failed: Provider unavailable"),
		)
	})

	it("should respect maxResults parameter capped at 10", async () => {
		const block: ToolUse<"docs_search"> = {
			type: "tool_use" as const,
			name: "docs_search" as const,
			params: {} as any,
			partial: false,
			nativeArgs: {
				query: "hooks",
				docKey: "react",
				maxResults: 20,
			},
		}

		await docsSearchTool.handle(mockTask as Task, block, mockCallbacks)

		// maxResults should be capped at 10
		expect(searchSpy).toHaveBeenCalledWith("hooks site:react.dev", { maxResults: 10 })
	})

	it("should resolve docKey by alias", async () => {
		const block: ToolUse<"docs_search"> = {
			type: "tool_use" as const,
			name: "docs_search" as const,
			params: {} as any,
			partial: false,
			nativeArgs: {
				query: "hooks",
				docKey: "nextjs",
			},
		}

		await docsSearchTool.handle(mockTask as Task, block, mockCallbacks)

		// nextjs resolves to nextjs.org
		expect(searchSpy).toHaveBeenCalledWith("hooks site:nextjs.org", { maxResults: 5 })
	})

	it("should resolve docKey by domain", async () => {
		const block: ToolUse<"docs_search"> = {
			type: "tool_use" as const,
			name: "docs_search" as const,
			params: {} as any,
			partial: false,
			nativeArgs: {
				query: "docker compose",
				docKey: "docs.docker.com",
			},
		}

		await docsSearchTool.handle(mockTask as Task, block, mockCallbacks)

		expect(searchSpy).toHaveBeenCalledWith("docker compose site:docs.docker.com", { maxResults: 5 })
	})

	it("handlePartial should be a no-op", async () => {
		const block: ToolUse<"docs_search"> = {
			type: "tool_use" as const,
			name: "docs_search" as const,
			params: {} as any,
			partial: true,
			nativeArgs: {
				query: "test",
			},
		}

		await docsSearchTool.handlePartial(mockTask as Task, block)

		expect(mockCallbacks.pushToolResult).not.toHaveBeenCalled()
	})
})

import { describe, it, expect, vi, beforeEach } from "vitest"
import { gitHubSearchTool, setGitHubDefaultApiKey } from "../GitHubSearchTool"
import { Task } from "../../task/Task"
import type { ToolUse } from "../../../shared/tools"

describe("gitHubSearchTool", () => {
	let mockTask: any
	let mockCallbacks: any

	const mockRepoResults = {
		items: [
			{
				full_name: "facebook/react",
				description: "A declarative, efficient, and flexible JavaScript library for building user interfaces.",
				html_url: "https://github.com/facebook/react",
				stars: 220000,
				language: "JavaScript",
				topics: ["react", "ui", "frontend"],
				updated_at: "2024-01-15T10:00:00Z",
			},
			{
				full_name: "vercel/next.js",
				description: "The React Framework for Production",
				html_url: "https://github.com/vercel/next.js",
				stars: 120000,
				language: "TypeScript",
				topics: ["react", "nextjs", "ssr"],
				updated_at: "2024-01-14T08:00:00Z",
			},
		],
	}

	const mockCodeResults = {
		items: [
			{
				name: "index.ts",
				path: "src/index.ts",
				repository: "facebook/react",
				html_url: "https://github.com/facebook/react/blob/main/src/index.ts",
			},
		],
	}

	const mockIssueResults = {
		items: [
			{
				title: "Fix: Memory leak in useEffect cleanup",
				number: 12345,
				state: "open",
				html_url: "https://github.com/facebook/react/issues/12345",
				labels: ["bug", "good first issue"],
				updated_at: "2024-01-10T12:00:00Z",
			},
		],
	}

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

		// Mock global fetch
		global.fetch = vi.fn()
	})

	it("should handle missing query parameter", async () => {
		const block: ToolUse<"github_search"> = {
			type: "tool_use" as const,
			name: "github_search" as const,
			params: {} as any,
			partial: false,
			nativeArgs: {
				query: "",
			},
		}

		await gitHubSearchTool.handle(mockTask as Task, block, mockCallbacks)

		expect(mockCallbacks.pushToolResult).toHaveBeenCalledWith(
			"Missing required parameter 'query' for github_search.",
		)
		expect(global.fetch).not.toHaveBeenCalled()
	})

	it("should search repositories by default", async () => {
		;(global.fetch as any).mockResolvedValue({
			ok: true,
			status: 200,
			json: vi.fn().mockResolvedValue(mockRepoResults),
		})

		const block: ToolUse<"github_search"> = {
			type: "tool_use" as const,
			name: "github_search" as const,
			params: {} as any,
			partial: false,
			nativeArgs: {
				query: "react",
			},
		}

		await gitHubSearchTool.handle(mockTask as Task, block, mockCallbacks)

		expect(global.fetch).toHaveBeenCalledWith(
			expect.stringContaining("api.github.com/search/repositories"),
			expect.objectContaining({
				headers: expect.objectContaining({
					Accept: "application/vnd.github.v3+json",
					"User-Agent": "mirror-vs",
				}),
			}),
		)

		expect(mockCallbacks.pushToolResult).toHaveBeenCalled()
		const result = mockCallbacks.pushToolResult.mock.calls[0][0] as string
		expect(result).toContain("Repository: facebook/react")
		expect(result).toContain("Stars: 220000")
		expect(result).toContain("Language: JavaScript")
		expect(result).toContain("Topics: react, ui, frontend")
	})

	it("should search code", async () => {
		;(global.fetch as any).mockResolvedValue({
			ok: true,
			status: 200,
			json: vi.fn().mockResolvedValue(mockCodeResults),
		})

		const block: ToolUse<"github_search"> = {
			type: "tool_use" as const,
			name: "github_search" as const,
			params: {} as any,
			partial: false,
			nativeArgs: {
				query: "useEffect",
				type: "code",
			},
		}

		await gitHubSearchTool.handle(mockTask as Task, block, mockCallbacks)

		expect(global.fetch).toHaveBeenCalledWith(
			expect.stringContaining("api.github.com/search/code"),
			expect.anything(),
		)

		const result = mockCallbacks.pushToolResult.mock.calls[0][0] as string
		expect(result).toContain("File: src/index.ts")
		expect(result).toContain("Repository: facebook/react")
	})

	it("should search issues", async () => {
		;(global.fetch as any).mockResolvedValue({
			ok: true,
			status: 200,
			json: vi.fn().mockResolvedValue(mockIssueResults),
		})

		const block: ToolUse<"github_search"> = {
			type: "tool_use" as const,
			name: "github_search" as const,
			params: {} as any,
			partial: false,
			nativeArgs: {
				query: "memory leak",
				type: "issues",
			},
		}

		await gitHubSearchTool.handle(mockTask as Task, block, mockCallbacks)

		expect(global.fetch).toHaveBeenCalledWith(
			expect.stringContaining("api.github.com/search/issues"),
			expect.anything(),
		)

		const result = mockCallbacks.pushToolResult.mock.calls[0][0] as string
		expect(result).toContain("#12345: Fix: Memory leak in useEffect cleanup")
		expect(result).toContain("State: open")
		expect(result).toContain("Labels: bug, good first issue")
	})

	it("should search pull requests with type:pr filter", async () => {
		;(global.fetch as any).mockResolvedValue({
			ok: true,
			status: 200,
			json: vi.fn().mockResolvedValue({
				items: [
					{
						title: "feat: add new hook",
						number: 678,
						state: "open",
						html_url: "https://github.com/facebook/react/pull/678",
						labels: ["enhancement"],
						updated_at: "2024-01-12T09:00:00Z",
					},
				],
			}),
		})

		const block: ToolUse<"github_search"> = {
			type: "tool_use" as const,
			name: "github_search" as const,
			params: {} as any,
			partial: false,
			nativeArgs: {
				query: "new hook",
				type: "pullrequests",
			},
		}

		await gitHubSearchTool.handle(mockTask as Task, block, mockCallbacks)

		// Should include type:pr in the query (URL-encoded by encodeURIComponent)
		const fetchCall = (global.fetch as any).mock.calls[0][0] as string
		expect(fetchCall).toContain("q=")
		// The query should contain the original query with +type:pr appended
		expect(decodeURIComponent(fetchCall)).toContain("new hook+type:pr")
	})

	it("should search discussions with type:discussions filter", async () => {
		;(global.fetch as any).mockResolvedValue({
			ok: true,
			status: 200,
			json: vi.fn().mockResolvedValue({ items: [] }),
		})

		const block: ToolUse<"github_search"> = {
			type: "tool_use" as const,
			name: "github_search" as const,
			params: {} as any,
			partial: false,
			nativeArgs: {
				query: "best practices",
				type: "discussions",
			},
		}

		await gitHubSearchTool.handle(mockTask as Task, block, mockCallbacks)

		const fetchCall = (global.fetch as any).mock.calls[0][0] as string
		// The query should contain the original query with +type:discussions appended
		expect(decodeURIComponent(fetchCall)).toContain("best practices+type:discussions")
	})

	it("should include auth token when set", async () => {
		setGitHubDefaultApiKey("test-token-123")
		;(global.fetch as any).mockResolvedValue({
			ok: true,
			status: 200,
			json: vi.fn().mockResolvedValue(mockRepoResults),
		})

		const block: ToolUse<"github_search"> = {
			type: "tool_use" as const,
			name: "github_search" as const,
			params: {} as any,
			partial: false,
			nativeArgs: {
				query: "react",
			},
		}

		await gitHubSearchTool.handle(mockTask as Task, block, mockCallbacks)

		expect(global.fetch).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				headers: expect.objectContaining({
					Authorization: "Bearer test-token-123",
				}),
			}),
		)

		// Clean up
		setGitHubDefaultApiKey(undefined as any)
	})

	it("should handle HTTP errors", async () => {
		;(global.fetch as any).mockResolvedValue({
			ok: false,
			status: 403,
			statusText: "Forbidden",
		})

		const block: ToolUse<"github_search"> = {
			type: "tool_use" as const,
			name: "github_search" as const,
			params: {} as any,
			partial: false,
			nativeArgs: {
				query: "react",
			},
		}

		await gitHubSearchTool.handle(mockTask as Task, block, mockCallbacks)

		expect(mockCallbacks.handleError).toHaveBeenCalledWith(
			"github_search",
			expect.objectContaining({
				message: expect.stringContaining("GitHub API returned 403"),
			}),
		)
		expect(mockCallbacks.pushToolResult).toHaveBeenCalledWith(expect.stringContaining("GitHub search failed"))
	})

	it("should handle fetch exceptions", async () => {
		;(global.fetch as any).mockRejectedValue(new Error("Network error"))

		const block: ToolUse<"github_search"> = {
			type: "tool_use" as const,
			name: "github_search" as const,
			params: {} as any,
			partial: false,
			nativeArgs: {
				query: "react",
			},
		}

		await gitHubSearchTool.handle(mockTask as Task, block, mockCallbacks)

		expect(mockCallbacks.handleError).toHaveBeenCalledWith(
			"github_search",
			expect.objectContaining({
				message: "Network error",
			}),
		)
		expect(mockCallbacks.pushToolResult).toHaveBeenCalledWith(
			expect.stringContaining("GitHub search failed: Network error"),
		)
	})

	it("should handle no results found", async () => {
		;(global.fetch as any).mockResolvedValue({
			ok: true,
			status: 200,
			json: vi.fn().mockResolvedValue({ items: [] }),
		})

		const block: ToolUse<"github_search"> = {
			type: "tool_use" as const,
			name: "github_search" as const,
			params: {} as any,
			partial: false,
			nativeArgs: {
				query: "xyznonexistent123456",
			},
		}

		await gitHubSearchTool.handle(mockTask as Task, block, mockCallbacks)

		expect(mockCallbacks.pushToolResult).toHaveBeenCalledWith("No GitHub search results found.")
	})

	it("should respect maxResults parameter capped at 20", async () => {
		;(global.fetch as any).mockResolvedValue({
			ok: true,
			status: 200,
			json: vi.fn().mockResolvedValue(mockRepoResults),
		})

		const block: ToolUse<"github_search"> = {
			type: "tool_use" as const,
			name: "github_search" as const,
			params: {} as any,
			partial: false,
			nativeArgs: {
				query: "react",
				maxResults: 50,
			},
		}

		await gitHubSearchTool.handle(mockTask as Task, block, mockCallbacks)

		// maxResults should be capped at 20
		expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("per_page=20"), expect.anything())
	})

	it("handlePartial should be a no-op", async () => {
		const block: ToolUse<"github_search"> = {
			type: "tool_use" as const,
			name: "github_search" as const,
			params: {} as any,
			partial: true,
			nativeArgs: {
				query: "test",
			},
		}

		await gitHubSearchTool.handlePartial(mockTask as Task, block)

		expect(mockCallbacks.pushToolResult).not.toHaveBeenCalled()
	})
})

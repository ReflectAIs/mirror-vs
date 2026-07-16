import { describe, it, expect, vi, beforeEach } from "vitest"
import { packageSearchTool } from "../PackageSearchTool"
import { Task } from "../../task/Task"
import type { ToolUse } from "../../../shared/tools"

describe("packageSearchTool", () => {
	let mockTask: any
	let mockCallbacks: any

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
		const block: ToolUse<"package_search"> = {
			type: "tool_use" as const,
			name: "package_search" as const,
			params: {} as any,
			partial: false,
			nativeArgs: {
				query: "",
			},
		}

		await packageSearchTool.handle(mockTask as Task, block, mockCallbacks)

		expect(mockCallbacks.pushToolResult).toHaveBeenCalledWith(
			"Missing required parameter 'query' for package_search.",
		)
		expect(global.fetch).not.toHaveBeenCalled()
	})

	it("should search npm by default", async () => {
		;(global.fetch as any).mockResolvedValue({
			ok: true,
			status: 200,
			json: vi.fn().mockResolvedValue({
				objects: [
					{
						package: {
							name: "lodash",
							version: "4.17.21",
							description: "A modern JavaScript utility library",
							links: {
								npm: "https://www.npmjs.com/package/lodash",
								homepage: "https://lodash.com",
								repository: "https://github.com/lodash/lodash",
							},
							license: "MIT",
							date: "2024-01-01T00:00:00Z",
						},
					},
				],
			}),
		})

		const block: ToolUse<"package_search"> = {
			type: "tool_use" as const,
			name: "package_search" as const,
			params: {} as any,
			partial: false,
			nativeArgs: {
				query: "lodash",
			},
		}

		await packageSearchTool.handle(mockTask as Task, block, mockCallbacks)

		expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("registry.npmjs.org/-/v1/search"))

		const result = mockCallbacks.pushToolResult.mock.calls[0][0] as string
		expect(result).toContain("Package: lodash v4.17.21")
		expect(result).toContain("Registry: npm")
		expect(result).toContain("Install: `npm install lodash`")
		expect(result).toContain("License: MIT")
	})

	it("should search PyPI", async () => {
		// First call = simple index, second call = package detail
		;(global.fetch as any)
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: vi.fn().mockResolvedValue({
					projects: [{ name: "requests" }, { name: "requests-oauthlib" }],
				}),
			})
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: vi.fn().mockResolvedValue({
					info: {
						name: "requests",
						version: "2.31.0",
						summary: "Python HTTP for Humans.",
						home_page: "https://requests.readthedocs.io",
						project_urls: {
							Source: "https://github.com/psf/requests",
						},
						license: "Apache-2.0",
						author_email: "me@example.com",
					},
				}),
			})

		const block: ToolUse<"package_search"> = {
			type: "tool_use" as const,
			name: "package_search" as const,
			params: {} as any,
			partial: false,
			nativeArgs: {
				query: "requests",
				registry: "pypi",
			},
		}

		await packageSearchTool.handle(mockTask as Task, block, mockCallbacks)

		expect(global.fetch).toHaveBeenCalledWith(
			"https://pypi.org/simple/",
			expect.objectContaining({
				headers: { Accept: "application/vnd.pypi.simple.v1+json" },
			}),
		)

		const result = mockCallbacks.pushToolResult.mock.calls[0][0] as string
		expect(result).toContain("Package: requests v2.31.0")
		expect(result).toContain("Registry: pypi")
		expect(result).toContain("Install: `pip install requests`")
	})

	it("should search Cargo (crates.io)", async () => {
		;(global.fetch as any).mockResolvedValue({
			ok: true,
			status: 200,
			json: vi.fn().mockResolvedValue({
				crates: [
					{
						name: "serde",
						max_version: "1.0.196",
						description: "A generic serialization/deserialization framework",
						homepage: "https://serde.rs",
						repository: "https://github.com/serde-rs/serde",
						license: "MIT/Apache-2.0",
						updated_at: "2024-01-10T12:00:00Z",
					},
				],
			}),
		})

		const block: ToolUse<"package_search"> = {
			type: "tool_use" as const,
			name: "package_search" as const,
			params: {} as any,
			partial: false,
			nativeArgs: {
				query: "serde",
				registry: "cargo",
			},
		}

		await packageSearchTool.handle(mockTask as Task, block, mockCallbacks)

		expect(global.fetch).toHaveBeenCalledWith(
			expect.stringContaining("crates.io/api/v1/crates"),
			expect.objectContaining({
				headers: { "User-Agent": "mirror-vs" },
			}),
		)

		const result = mockCallbacks.pushToolResult.mock.calls[0][0] as string
		expect(result).toContain("Package: serde v1.0.196")
		expect(result).toContain("Registry: cargo")
		expect(result).toContain("Install: `cargo add serde`")
	})

	it("should search Go proxy", async () => {
		;(global.fetch as any).mockResolvedValue({
			ok: true,
			status: 200,
			json: vi.fn().mockResolvedValue({
				Version: "v1.62.0",
				Time: "2024-01-05T10:00:00Z",
			}),
		})

		const block: ToolUse<"package_search"> = {
			type: "tool_use" as const,
			name: "package_search" as const,
			params: {} as any,
			partial: false,
			nativeArgs: {
				query: "github.com/gin-gonic/gin",
				registry: "go",
			},
		}

		await packageSearchTool.handle(mockTask as Task, block, mockCallbacks)

		expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("proxy.golang.org/"))

		const result = mockCallbacks.pushToolResult.mock.calls[0][0] as string
		expect(result).toContain("Package: github.com/gin-gonic/gin")
		expect(result).toContain("Registry: go")
		expect(result).toContain("Install: `go get github.com/gin-gonic/gin`")
	})

	it("should search RubyGems", async () => {
		;(global.fetch as any).mockResolvedValue({
			ok: true,
			status: 200,
			json: vi.fn().mockResolvedValue([
				{
					name: "rails",
					version: "7.1.2",
					info: "Ruby on Rails is a full-stack web framework",
					homepage_uri: "https://rubyonrails.org",
					source_code_uri: "https://github.com/rails/rails",
					licenses: ["MIT"],
					updated_at: "2024-01-10T12:00:00Z",
				},
			]),
		})

		const block: ToolUse<"package_search"> = {
			type: "tool_use" as const,
			name: "package_search" as const,
			params: {} as any,
			partial: false,
			nativeArgs: {
				query: "rails",
				registry: "rubygems",
			},
		}

		await packageSearchTool.handle(mockTask as Task, block, mockCallbacks)

		expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("rubygems.org/api/v1/search.json"))

		const result = mockCallbacks.pushToolResult.mock.calls[0][0] as string
		expect(result).toContain("Package: rails v7.1.2")
		expect(result).toContain("Registry: rubygems")
		expect(result).toContain("Install: `gem install rails`")
	})

	it("should handle unsupported registry", async () => {
		const block: ToolUse<"package_search"> = {
			type: "tool_use" as const,
			name: "package_search" as const,
			params: {} as any,
			partial: false,
			nativeArgs: {
				query: "test",
				registry: "maven" as any,
			},
		}

		await packageSearchTool.handle(mockTask as Task, block, mockCallbacks)

		expect(mockCallbacks.handleError).toHaveBeenCalled()
		expect(mockCallbacks.pushToolResult).toHaveBeenCalledWith(
			expect.stringContaining("Package search failed: Unsupported registry: maven"),
		)
	})

	it("should handle HTTP errors from registry", async () => {
		;(global.fetch as any).mockResolvedValue({
			ok: false,
			status: 503,
			statusText: "Service Unavailable",
		})

		const block: ToolUse<"package_search"> = {
			type: "tool_use" as const,
			name: "package_search" as const,
			params: {} as any,
			partial: false,
			nativeArgs: {
				query: "lodash",
				registry: "npm",
			},
		}

		await packageSearchTool.handle(mockTask as Task, block, mockCallbacks)

		expect(mockCallbacks.handleError).toHaveBeenCalledWith(
			"package_search",
			expect.objectContaining({
				message: expect.stringContaining("npm registry returned 503"),
			}),
		)
	})

	it("should handle fetch exceptions", async () => {
		;(global.fetch as any).mockRejectedValue(new Error("Network error"))

		const block: ToolUse<"package_search"> = {
			type: "tool_use" as const,
			name: "package_search" as const,
			params: {} as any,
			partial: false,
			nativeArgs: {
				query: "lodash",
			},
		}

		await packageSearchTool.handle(mockTask as Task, block, mockCallbacks)

		expect(mockCallbacks.handleError).toHaveBeenCalledWith(
			"package_search",
			expect.objectContaining({
				message: "Network error",
			}),
		)
		expect(mockCallbacks.pushToolResult).toHaveBeenCalledWith(
			expect.stringContaining("Package search failed: Network error"),
		)
	})

	it("should handle no results found", async () => {
		;(global.fetch as any).mockResolvedValue({
			ok: true,
			status: 200,
			json: vi.fn().mockResolvedValue({ objects: [] }),
		})

		const block: ToolUse<"package_search"> = {
			type: "tool_use" as const,
			name: "package_search" as const,
			params: {} as any,
			partial: false,
			nativeArgs: {
				query: "xyznonexistent123456",
			},
		}

		await packageSearchTool.handle(mockTask as Task, block, mockCallbacks)

		expect(mockCallbacks.pushToolResult).toHaveBeenCalledWith("No packages found on npm.")
	})

	it("should respect maxResults parameter capped at 10", async () => {
		;(global.fetch as any).mockResolvedValue({
			ok: true,
			status: 200,
			json: vi.fn().mockResolvedValue({ objects: [] }),
		})

		const block: ToolUse<"package_search"> = {
			type: "tool_use" as const,
			name: "package_search" as const,
			params: {} as any,
			partial: false,
			nativeArgs: {
				query: "lodash",
				maxResults: 20,
			},
		}

		await packageSearchTool.handle(mockTask as Task, block, mockCallbacks)

		// maxResults should be capped at 10
		expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("size=10"))
	})

	it("handlePartial should be a no-op", async () => {
		const block: ToolUse<"package_search"> = {
			type: "tool_use" as const,
			name: "package_search" as const,
			params: {} as any,
			partial: true,
			nativeArgs: {
				query: "test",
			},
		}

		await packageSearchTool.handlePartial(mockTask as Task, block)

		expect(mockCallbacks.pushToolResult).not.toHaveBeenCalled()
	})
})

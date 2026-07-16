// npx vitest run src/services/generation-runtime/__tests__/ComfyCloudRuntime.spec.ts

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { ComfyCloudRuntime } from "../ComfyCloudRuntime"

const MOCK_API_KEY = "cc-test-key-12345"
const MOCK_BASE_URL = "https://cloud.comfy.org"
const SECRET_KEY = "mirror_comfy_cloud_api_token"

/**
 * Helper: create a minimal vscode.ExtensionContext mock with SecretStorage.
 */
function mockContext(apiKey?: string): any {
	return {
		secrets: {
			get: vi.fn().mockImplementation((key: string) => {
				if (key === SECRET_KEY) return Promise.resolve(apiKey)
				return Promise.resolve(undefined)
			}),
			store: vi.fn(),
			delete: vi.fn(),
		},
		subscriptions: [],
		extensionUri: { fsPath: "/mock" },
		globalState: { get: vi.fn(), update: vi.fn() },
		workspaceState: { get: vi.fn(), update: vi.fn() },
	}
}

/**
 * Helper that stubs `global.fetch` and returns the runtime class.
 */
async function getRuntime() {
	vi.resetModules()
	const fetchMock = vi.fn<typeof fetch>()
	vi.stubGlobal("fetch", fetchMock)
	const { ComfyCloudRuntime } = await import("../ComfyCloudRuntime")
	return { ComfyCloudRuntime, fetchMock }
}

describe("ComfyCloudRuntime", () => {
	beforeEach(() => {
		vi.restoreAllMocks()
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	// -----------------------------------------------------------------------
	// validateConfiguration
	// -----------------------------------------------------------------------

	describe("validateConfiguration", () => {
		it("should return valid=true when API key exists and /api/history responds 200", async () => {
			const { ComfyCloudRuntime, fetchMock } = await getRuntime()
			const context = mockContext(MOCK_API_KEY)

			fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))

			const result = await ComfyCloudRuntime.validateConfiguration(context)

			expect(result).toEqual({ valid: true })
			expect(fetchMock).toHaveBeenCalledWith(`${MOCK_BASE_URL}/api/history`, {
				headers: { Authorization: `Bearer ${MOCK_API_KEY}` },
			})
		})

		it("should return valid=false when no API key is configured", async () => {
			const { ComfyCloudRuntime } = await getRuntime()
			const context = mockContext(undefined)

			const result = await ComfyCloudRuntime.validateConfiguration(context)

			expect(result).toEqual({ valid: false, message: "Comfy Cloud API key is not configured." })
		})

		it("should return valid=false when /api/history returns non-200", async () => {
			const { ComfyCloudRuntime, fetchMock } = await getRuntime()
			const context = mockContext(MOCK_API_KEY)

			fetchMock.mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }))

			const result = await ComfyCloudRuntime.validateConfiguration(context)

			expect(result).toEqual({ valid: false, message: "Comfy Cloud API returned HTTP 401" })
		})

		it("should return valid=false when fetch throws", async () => {
			const { ComfyCloudRuntime, fetchMock } = await getRuntime()
			const context = mockContext(MOCK_API_KEY)

			fetchMock.mockRejectedValueOnce(new Error("Network error"))

			const result = await ComfyCloudRuntime.validateConfiguration(context)

			expect(result).toEqual({ valid: false, message: "Network error" })
		})
	})

	// -----------------------------------------------------------------------
	// executeGeneration - prompt submission failures
	// -----------------------------------------------------------------------

	describe("executeGeneration - prompt submission", () => {
		it("should return error when no API key is configured", async () => {
			const { ComfyCloudRuntime } = await getRuntime()
			const context = mockContext(undefined)

			const result = await ComfyCloudRuntime.executeGeneration(context, { workflow: { foo: "bar" } })

			expect(result.success).toBe(false)
			expect(result.error).toContain("API key is not configured")
		})

		it("should return error when prompt submission returns non-200", async () => {
			const { ComfyCloudRuntime, fetchMock } = await getRuntime()
			const context = mockContext(MOCK_API_KEY)

			fetchMock.mockResolvedValueOnce(new Response("Rate limited", { status: 429 }))

			const result = await ComfyCloudRuntime.executeGeneration(context, { workflow: { test: true } })

			expect(result.success).toBe(false)
			expect(result.error).toContain("Comfy Cloud prompt submission failed: 429")
		})

		it("should return error when prompt_id is missing from response", async () => {
			const { ComfyCloudRuntime, fetchMock } = await getRuntime()
			const context = mockContext(MOCK_API_KEY)

			fetchMock.mockResolvedValueOnce(
				new Response(JSON.stringify({ status: "queued" }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			)

			const result = await ComfyCloudRuntime.executeGeneration(context, { workflow: {} })

			expect(result.success).toBe(false)
			expect(result.error).toContain("did not return a prompt_id")
		})
	})

	// -----------------------------------------------------------------------
	// executeGeneration - polling loop
	// -----------------------------------------------------------------------

	describe("executeGeneration - polling", () => {
		it("should poll and return success when workflow completes", async () => {
			const { ComfyCloudRuntime, fetchMock } = await getRuntime()
			const context = mockContext(MOCK_API_KEY)

			// First call: prompt submission
			fetchMock.mockResolvedValueOnce(
				new Response(JSON.stringify({ prompt_id: "prompt-123" }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			)
			// Second call: history polling — not yet complete (404)
			fetchMock.mockResolvedValueOnce(new Response("Not Found", { status: 404 }))
			// Third call: history polling — complete with outputs
			fetchMock.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						"prompt-123": {
							status: { completed: true },
							outputs: {
								"9": {
									images: [{ filename: "output.png", type: "output", subfolder: "" }],
								},
							},
						},
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				),
			)

			const result = await ComfyCloudRuntime.executeGeneration(context, { workflow: { test: true }, timeout: 10 })

			expect(result.success).toBe(true)
			expect(result.outputs).toHaveLength(1)
			expect(result.outputs![0]).toContain("output.png")
			expect(fetchMock).toHaveBeenCalledTimes(3)
		})

		it("should return error when workflow execution fails", async () => {
			const { ComfyCloudRuntime, fetchMock } = await getRuntime()
			const context = mockContext(MOCK_API_KEY)

			// Prompt submission
			fetchMock.mockResolvedValueOnce(
				new Response(JSON.stringify({ prompt_id: "prompt-fail" }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			)
			// History polling — completed but failed
			fetchMock.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						"prompt-fail": {
							status: { completed: false, failed: true, error_message: "Out of memory" },
							outputs: {},
						},
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				),
			)

			const result = await ComfyCloudRuntime.executeGeneration(context, { workflow: {}, timeout: 5 })

			expect(result.success).toBe(false)
			expect(result.error).toContain("Out of memory")
		})

		it("should return error when history fetch returns non-404 error", async () => {
			const { ComfyCloudRuntime, fetchMock } = await getRuntime()
			const context = mockContext(MOCK_API_KEY)

			// Prompt submission
			fetchMock.mockResolvedValueOnce(
				new Response(JSON.stringify({ prompt_id: "prompt-err" }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			)
			// History polling — server error
			fetchMock.mockResolvedValueOnce(new Response("Server Error", { status: 500 }))

			const result = await ComfyCloudRuntime.executeGeneration(context, { workflow: {}, timeout: 5 })

			expect(result.success).toBe(false)
			expect(result.error).toContain("Comfy Cloud history fetch failed (500)")
		})

		it("should timeout after specified timeout seconds", async () => {
			const { ComfyCloudRuntime, fetchMock } = await getRuntime()
			const context = mockContext(MOCK_API_KEY)

			// Prompt submission succeeds
			fetchMock.mockResolvedValueOnce(
				new Response(JSON.stringify({ prompt_id: "prompt-slow" }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			)

			// All subsequent polls return 404 (not yet complete) — but we only need a few
			// to exceed the 1-second timeout with the 2s polling interval + 1s real time
			for (let i = 0; i < 3; i++) {
				fetchMock.mockResolvedValueOnce(new Response("Not Found", { status: 404 }))
			}

			const result = await ComfyCloudRuntime.executeGeneration(context, { workflow: {}, timeout: 1 })

			expect(result.success).toBe(false)
			expect(result.error).toContain("timed out")
		})

		it("should return error when no outputs returned", async () => {
			const { ComfyCloudRuntime, fetchMock } = await getRuntime()
			const context = mockContext(MOCK_API_KEY)

			// Prompt submission
			fetchMock.mockResolvedValueOnce(
				new Response(JSON.stringify({ prompt_id: "prompt-empty" }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			)
			// History polling — completed but no outputs
			fetchMock.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						"prompt-empty": {
							status: { completed: true },
							outputs: {},
						},
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				),
			)

			const result = await ComfyCloudRuntime.executeGeneration(context, { workflow: {}, timeout: 5 })

			expect(result.success).toBe(false)
			expect(result.error).toContain("no output files")
		})
	})

	describe("error handling", () => {
		it("should catch and return synchronous errors gracefully", async () => {
			const { ComfyCloudRuntime } = await getRuntime()
			const context = mockContext(MOCK_API_KEY)

			// Force context.secrets.get to throw
			context.secrets.get.mockRejectedValueOnce(new Error("SecretStorage unavailable"))

			const result = await ComfyCloudRuntime.executeGeneration(context, { workflow: {} })

			expect(result.success).toBe(false)
			expect(result.error).toContain("SecretStorage unavailable")
		})
	})
})

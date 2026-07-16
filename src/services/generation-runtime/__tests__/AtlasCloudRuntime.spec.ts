// npx vitest run src/services/generation-runtime/__tests__/AtlasCloudRuntime.spec.ts

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { AtlasCloudRuntime } from "../AtlasCloudRuntime"

const MOCK_API_KEY = "ac-test-key-67890"
const MOCK_BASE_URL = "https://api.atlas.cloud/v1"
const SECRET_KEY = "mirror_atlas_cloud_api_token"

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
	const { AtlasCloudRuntime } = await import("../AtlasCloudRuntime")
	return { AtlasCloudRuntime, fetchMock }
}

describe("AtlasCloudRuntime", () => {
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
		it("should return valid=true when API key exists and /models responds 200", async () => {
			const { AtlasCloudRuntime, fetchMock } = await getRuntime()
			const context = mockContext(MOCK_API_KEY)

			fetchMock.mockResolvedValueOnce(
				new Response(JSON.stringify({ data: [{ id: "wan-2.7" }] }), { status: 200 }),
			)

			const result = await AtlasCloudRuntime.validateConfiguration(context)

			expect(result).toEqual({ valid: true })
			expect(fetchMock).toHaveBeenCalledWith(`${MOCK_BASE_URL}/models`, {
				headers: { Authorization: `Bearer ${MOCK_API_KEY}` },
			})
		})

		it("should return valid=false when no API key is configured", async () => {
			const { AtlasCloudRuntime } = await getRuntime()
			const context = mockContext(undefined)

			const result = await AtlasCloudRuntime.validateConfiguration(context)

			expect(result).toEqual({ valid: false, message: "Atlas Cloud API key is not configured." })
		})

		it("should return valid=false when /models returns non-200", async () => {
			const { AtlasCloudRuntime, fetchMock } = await getRuntime()
			const context = mockContext(MOCK_API_KEY)

			fetchMock.mockResolvedValueOnce(new Response("Forbidden", { status: 403 }))

			const result = await AtlasCloudRuntime.validateConfiguration(context)

			expect(result).toEqual({ valid: false, message: "Atlas Cloud API returned HTTP 403" })
		})

		it("should return valid=false when fetch throws", async () => {
			const { AtlasCloudRuntime, fetchMock } = await getRuntime()
			const context = mockContext(MOCK_API_KEY)

			fetchMock.mockRejectedValueOnce(new Error("DNS resolution failed"))

			const result = await AtlasCloudRuntime.validateConfiguration(context)

			expect(result).toEqual({ valid: false, message: "DNS resolution failed" })
		})
	})

	// -----------------------------------------------------------------------
	// executeGeneration
	// -----------------------------------------------------------------------

	describe("executeGeneration", () => {
		const defaultRequest = {
			type: "image" as const,
			prompt: "a cat on a mat",
		}

		it("should return error when no API key is configured", async () => {
			const { AtlasCloudRuntime } = await getRuntime()
			const context = mockContext(undefined)

			const result = await AtlasCloudRuntime.executeGeneration(context, "wan-2.7", defaultRequest)

			expect(result.success).toBe(false)
			expect(result.error).toContain("API key is not configured")
		})

		it("should return success with url when API responds with valid content", async () => {
			const { AtlasCloudRuntime, fetchMock } = await getRuntime()
			const context = mockContext(MOCK_API_KEY)

			const mockResponse = {
				choices: [
					{ message: { content: JSON.stringify({ output_url: "https://cdn.atlas.cloud/output.png" }) } },
				],
			}
			fetchMock.mockResolvedValueOnce(
				new Response(JSON.stringify(mockResponse), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			)

			const result = await AtlasCloudRuntime.executeGeneration(context, "wan-2.7", defaultRequest)

			expect(result.success).toBe(true)
			expect(result.url).toBe("https://cdn.atlas.cloud/output.png")

			// Verify request shape
			const callUrl = fetchMock.mock.calls[0][0]
			const callBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
			expect(callUrl).toBe(`${MOCK_BASE_URL}/chat/completions`)
			expect(callBody.model).toBe("wan-2.7")
			expect(callBody.messages[0].content).toContain("a cat on a mat")
		})

		it("should fallback through url fields when output_url is absent", async () => {
			const { AtlasCloudRuntime, fetchMock } = await getRuntime()
			const context = mockContext(MOCK_API_KEY)

			const mockResponse = {
				choices: [{ message: { content: JSON.stringify({ url: "https://cdn.atlas.cloud/fallback.png" }) } }],
			}
			fetchMock.mockResolvedValueOnce(
				new Response(JSON.stringify(mockResponse), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			)

			const result = await AtlasCloudRuntime.executeGeneration(context, "seedance-2.0", defaultRequest)

			expect(result.success).toBe(true)
			expect(result.url).toBe("https://cdn.atlas.cloud/fallback.png")
		})

		it("should return error when API returns non-200", async () => {
			const { AtlasCloudRuntime, fetchMock } = await getRuntime()
			const context = mockContext(MOCK_API_KEY)

			fetchMock.mockResolvedValueOnce(new Response("Payment Required", { status: 402 }))

			const result = await AtlasCloudRuntime.executeGeneration(context, "wan-2.7", defaultRequest)

			expect(result.success).toBe(false)
			expect(result.error).toContain("Atlas Cloud execution failed: 402")
		})

		it("should return error when response content is empty", async () => {
			const { AtlasCloudRuntime, fetchMock } = await getRuntime()
			const context = mockContext(MOCK_API_KEY)

			const mockResponse = { choices: [{ message: { content: null } }] }
			fetchMock.mockResolvedValueOnce(
				new Response(JSON.stringify(mockResponse), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			)

			const result = await AtlasCloudRuntime.executeGeneration(context, "wan-2.7", defaultRequest)

			expect(result.success).toBe(false)
			expect(result.error).toContain("empty response")
		})

		it("should include optional parameters when provided", async () => {
			const { AtlasCloudRuntime, fetchMock } = await getRuntime()
			const context = mockContext(MOCK_API_KEY)

			const mockResponse = {
				choices: [{ message: { content: JSON.stringify({ output_url: "https://cdn.atlas.cloud/test.png" }) } }],
			}
			fetchMock.mockResolvedValueOnce(
				new Response(JSON.stringify(mockResponse), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			)

			const result = await AtlasCloudRuntime.executeGeneration(context, "wan-2.7", {
				type: "image",
				prompt: "test",
				negativePrompt: "blurry",
				aspectRatio: "16:9",
			})

			expect(result.success).toBe(true)
			const callBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
			const payload = JSON.parse(callBody.messages[0].content)
			expect(payload.negative_prompt).toBe("blurry")
			expect(payload.parameters.aspect_ratio).toBe("16:9")
		})

		it("should catch network errors gracefully", async () => {
			const { AtlasCloudRuntime, fetchMock } = await getRuntime()
			const context = mockContext(MOCK_API_KEY)

			fetchMock.mockRejectedValueOnce(new Error("connect ECONNREFUSED"))

			const result = await AtlasCloudRuntime.executeGeneration(context, "wan-2.7", defaultRequest)

			expect(result.success).toBe(false)
			expect(result.error).toContain("connect ECONNREFUSED")
		})
	})
})

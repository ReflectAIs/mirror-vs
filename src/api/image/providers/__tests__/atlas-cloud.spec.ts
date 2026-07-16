// npx vitest run src/api/image/providers/__tests__/atlas-cloud.spec.ts

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { ImageProviderRegistry } from "../../registry"

const MOCK_API_KEY = "ac-test-key-67890"
const SECRET_KEY = "mirror_atlas_cloud_api_token"

function mockContext(): any {
	return {
		secrets: {
			get: vi.fn().mockImplementation((key: string) => {
				if (key === SECRET_KEY) return Promise.resolve(MOCK_API_KEY)
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

describe("AtlasCloudProvider", () => {
	beforeEach(() => {
		vi.restoreAllMocks()
		for (const key of ImageProviderRegistry.getAvailable()) {
			ImageProviderRegistry.unregister(key)
		}
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	// -----------------------------------------------------------------------
	// metadata
	// -----------------------------------------------------------------------

	describe("metadata", () => {
		it("should have correct provider name", async () => {
			vi.resetModules()
			const fetchMock = vi.fn<typeof fetch>()
			vi.stubGlobal("fetch", fetchMock)
			const { AtlasCloudProvider } = await import("../atlas-cloud")

			const provider = new AtlasCloudProvider(mockContext())
			expect(provider.name).toBe("Atlas Cloud")
		})

		it("should return a placeholder model in listModels", async () => {
			vi.resetModules()
			const fetchMock = vi.fn<typeof fetch>()
			vi.stubGlobal("fetch", fetchMock)
			const { AtlasCloudProvider } = await import("../atlas-cloud")

			const provider = new AtlasCloudProvider(mockContext())
			const models = await provider.listModels()

			expect(models).toHaveLength(1)
			expect(models[0].id).toBe("atlas-cloud/default")
			expect(models[0].provider).toBe("atlas_cloud")
		})
	})

	// -----------------------------------------------------------------------
	// capabilities
	// -----------------------------------------------------------------------

	describe("capabilities", () => {
		it("should report correct capabilities (no outpainting/upscaling/background removal)", async () => {
			vi.resetModules()
			const fetchMock = vi.fn<typeof fetch>()
			vi.stubGlobal("fetch", fetchMock)
			const { AtlasCloudProvider } = await import("../atlas-cloud")

			const provider = new AtlasCloudProvider(mockContext())
			const caps = provider.getCapabilities()

			expect(caps.canGenerate).toBe(true)
			expect(caps.canEdit).toBe(true)
			expect(caps.canInpaint).toBe(true)
			expect(caps.canOutpaint).toBe(false)
			expect(caps.canUpscale).toBe(false)
			expect(caps.canRemoveBackground).toBe(false)
			expect(caps.supportsControlNet).toBe(false)
		})
	})

	// -----------------------------------------------------------------------
	// health
	// -----------------------------------------------------------------------

	describe("health", () => {
		it("should return alive:true when runtime validates successfully", async () => {
			vi.resetModules()
			const fetchMock = vi.fn<typeof fetch>()
			vi.stubGlobal("fetch", fetchMock)
			const { AtlasCloudProvider } = await import("../atlas-cloud")

			fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }))

			const provider = new AtlasCloudProvider(mockContext())
			const result = await provider.health()

			expect(result.alive).toBe(true)
		})

		it("should return alive:false when runtime validation fails", async () => {
			vi.resetModules()
			const fetchMock = vi.fn<typeof fetch>()
			vi.stubGlobal("fetch", fetchMock)
			const { AtlasCloudProvider } = await import("../atlas-cloud")

			fetchMock.mockResolvedValueOnce(new Response("Forbidden", { status: 403 }))

			const provider = new AtlasCloudProvider(mockContext())
			const result = await provider.health()

			expect(result.alive).toBe(false)
		})
	})

	// -----------------------------------------------------------------------
	// generate
	// -----------------------------------------------------------------------

	describe("generate", () => {
		it("should return success with imageData from runtime", async () => {
			vi.resetModules()
			const fetchMock = vi.fn<typeof fetch>()
			vi.stubGlobal("fetch", fetchMock)
			const { AtlasCloudProvider } = await import("../atlas-cloud")

			const mockResponse = {
				choices: [{ message: { content: JSON.stringify({ output_url: "https://cdn.atlas.cloud/out.png" }) } }],
			}
			fetchMock.mockResolvedValueOnce(
				new Response(JSON.stringify(mockResponse), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			)

			const provider = new AtlasCloudProvider(mockContext())
			const result = await provider.generate("a dog", { model: "wan-2.7" })

			expect(result.success).toBe(true)
			expect(result.imageData).toBe("https://cdn.atlas.cloud/out.png")
		})

		it("should return error when runtime fails", async () => {
			vi.resetModules()
			const fetchMock = vi.fn<typeof fetch>()
			vi.stubGlobal("fetch", fetchMock)
			const { AtlasCloudProvider } = await import("../atlas-cloud")

			fetchMock.mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }))

			const provider = new AtlasCloudProvider(mockContext())
			const result = await provider.generate("test", { model: "wan-2.7" })

			expect(result.success).toBe(false)
			expect(result.error).toBeTruthy()
		})
	})

	// -----------------------------------------------------------------------
	// edit / inpaint
	// -----------------------------------------------------------------------

	describe("edit and inpaint", () => {
		it("should delegate edit to runtime and return imageData", async () => {
			vi.resetModules()
			const fetchMock = vi.fn<typeof fetch>()
			vi.stubGlobal("fetch", fetchMock)
			const { AtlasCloudProvider } = await import("../atlas-cloud")

			const mockResponse = {
				choices: [{ message: { content: JSON.stringify({ url: "https://cdn.atlas.cloud/edited.png" }) } }],
			}
			fetchMock.mockResolvedValueOnce(
				new Response(JSON.stringify(mockResponse), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			)

			const provider = new AtlasCloudProvider(mockContext())
			const result = await provider.edit("make it blue", "base64image==", { model: "wan-2.7" })

			expect(result.success).toBe(true)
			expect(result.imageData).toBe("https://cdn.atlas.cloud/edited.png")
		})

		it("should delegate inpaint to runtime", async () => {
			vi.resetModules()
			const fetchMock = vi.fn<typeof fetch>()
			vi.stubGlobal("fetch", fetchMock)
			const { AtlasCloudProvider } = await import("../atlas-cloud")

			const mockResponse = {
				choices: [
					{ message: { content: JSON.stringify({ output_url: "https://cdn.atlas.cloud/inpaint.png" }) } },
				],
			}
			fetchMock.mockResolvedValueOnce(
				new Response(JSON.stringify(mockResponse), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			)

			const provider = new AtlasCloudProvider(mockContext())
			const result = await provider.inpaint("fill it", "mask==", { model: "wan-2.7", maskImage: "mask==" })

			expect(result.success).toBe(true)
			expect(result.imageData).toBe("https://cdn.atlas.cloud/inpaint.png")
		})
	})

	// -----------------------------------------------------------------------
	// unsupported operations
	// -----------------------------------------------------------------------

	describe("unsupported operations", () => {
		it("should return error for outpaint", async () => {
			vi.resetModules()
			const fetchMock = vi.fn<typeof fetch>()
			vi.stubGlobal("fetch", fetchMock)
			const { AtlasCloudProvider } = await import("../atlas-cloud")

			const provider = new AtlasCloudProvider(mockContext())
			const result = await provider.outpaint("test", "img")

			expect(result.success).toBe(false)
			expect(result.error).toContain("not supported")
		})

		it("should return error for upscale", async () => {
			vi.resetModules()
			const fetchMock = vi.fn<typeof fetch>()
			vi.stubGlobal("fetch", fetchMock)
			const { AtlasCloudProvider } = await import("../atlas-cloud")

			const provider = new AtlasCloudProvider(mockContext())
			const result = await provider.upscale("img")

			expect(result.success).toBe(false)
			expect(result.error).toContain("not supported")
		})

		it("should return error for removeBackground", async () => {
			vi.resetModules()
			const fetchMock = vi.fn<typeof fetch>()
			vi.stubGlobal("fetch", fetchMock)
			const { AtlasCloudProvider } = await import("../atlas-cloud")

			const provider = new AtlasCloudProvider(mockContext())
			const result = await provider.removeBackground("img")

			expect(result.success).toBe(false)
			expect(result.error).toContain("not supported")
		})
	})

	// -----------------------------------------------------------------------
	// interrupt and getProgress
	// -----------------------------------------------------------------------

	describe("lifecycle", () => {
		it("interrupt should not throw", async () => {
			vi.resetModules()
			const fetchMock = vi.fn<typeof fetch>()
			vi.stubGlobal("fetch", fetchMock)
			const { AtlasCloudProvider } = await import("../atlas-cloud")

			const provider = new AtlasCloudProvider(mockContext())
			await expect(provider.interrupt()).resolves.toBeUndefined()
		})

		it("getProgress should return idle state", async () => {
			vi.resetModules()
			const fetchMock = vi.fn<typeof fetch>()
			vi.stubGlobal("fetch", fetchMock)
			const { AtlasCloudProvider } = await import("../atlas-cloud")

			const provider = new AtlasCloudProvider(mockContext())
			const progress = await provider.getProgress()

			expect(progress.state).toBe("idle")
			expect(progress.progress).toBe(0)
		})
	})
})

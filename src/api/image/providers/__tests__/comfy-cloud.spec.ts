// npx vitest run src/api/image/providers/__tests__/comfy-cloud.spec.ts

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { ImageProviderRegistry } from "../../registry"

const MOCK_API_KEY = "cc-test-key-12345"
const SECRET_KEY = "mirror_comfy_cloud_api_token"

// Mock PipelineRegistry: ComfyCloudProvider.resolveWorkflow() calls
// PipelineRegistry.isInitialized(), autoSelect(), and resolve().
vi.mock("../../pipeline-registry", () => {
	const mockWorkflow = { "3": { class_type: "KSampler", inputs: { seed: 42, steps: 20 } } }
	const mockDef = { slug: "txt2img", workflow: JSON.parse(JSON.stringify(mockWorkflow)) }
	return {
		PipelineRegistry: {
			isInitialized: vi.fn(() => true),
			initialize: vi.fn(),
			autoSelect: vi.fn(() => mockDef),
			resolve: vi.fn(() => mockDef),
			reset: vi.fn(),
		},
	}
})

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

describe("ComfyCloudProvider", () => {
	beforeEach(() => {
		vi.restoreAllMocks()
		// Clear registry between tests
		for (const key of ImageProviderRegistry.getAvailable()) {
			ImageProviderRegistry.unregister(key)
		}
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	// -----------------------------------------------------------------------
	// name and listModels
	// -----------------------------------------------------------------------

	describe("metadata", () => {
		it("should have correct provider name", async () => {
			vi.resetModules()
			const fetchMock = vi.fn<typeof fetch>()
			vi.stubGlobal("fetch", fetchMock)
			const { ComfyCloudProvider } = await import("../comfy-cloud")

			const provider = new ComfyCloudProvider(mockContext())
			expect(provider.name).toBe("Comfy Cloud")
		})

		it("should return a placeholder model in listModels", async () => {
			vi.resetModules()
			const fetchMock = vi.fn<typeof fetch>()
			vi.stubGlobal("fetch", fetchMock)
			const { ComfyCloudProvider } = await import("../comfy-cloud")

			const provider = new ComfyCloudProvider(mockContext())
			const models = await provider.listModels()

			expect(models).toHaveLength(1)
			expect(models[0].id).toBe("comfy-cloud/default")
			expect(models[0].provider).toBe("comfy_cloud")
		})
	})

	// -----------------------------------------------------------------------
	// capabilities
	// -----------------------------------------------------------------------

	describe("capabilities", () => {
		it("should report all capabilities correctly", async () => {
			vi.resetModules()
			const fetchMock = vi.fn<typeof fetch>()
			vi.stubGlobal("fetch", fetchMock)
			const { ComfyCloudProvider } = await import("../comfy-cloud")

			const provider = new ComfyCloudProvider(mockContext())
			const caps = provider.getCapabilities()

			expect(caps.canGenerate).toBe(true)
			expect(caps.canEdit).toBe(true)
			expect(caps.canInpaint).toBe(true)
			expect(caps.canOutpaint).toBe(true)
			expect(caps.canUpscale).toBe(true)
			expect(caps.canRemoveBackground).toBe(true)
			expect(caps.supportsVideo).toBe(true)
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
			const { ComfyCloudProvider } = await import("../comfy-cloud")

			fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))

			const provider = new ComfyCloudProvider(mockContext())
			const result = await provider.health()

			expect(result.alive).toBe(true)
		})

		it("should return alive:false when runtime validation fails", async () => {
			vi.resetModules()
			const fetchMock = vi.fn<typeof fetch>()
			vi.stubGlobal("fetch", fetchMock)
			const { ComfyCloudProvider } = await import("../comfy-cloud")

			fetchMock.mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }))

			const provider = new ComfyCloudProvider(mockContext())
			const result = await provider.health()

			expect(result.alive).toBe(false)
		})
	})

	// -----------------------------------------------------------------------
	// generate (integration with ComfyCloudRuntime)
	// -----------------------------------------------------------------------

	describe("generate", () => {
		it("should return success when workflow executes successfully", async () => {
			vi.resetModules()
			const fetchMock = vi.fn<typeof fetch>()
			vi.stubGlobal("fetch", fetchMock)
			const { ComfyCloudProvider } = await import("../comfy-cloud")

			// Mock PipelineRegistry initialisation check (it returns false, so no init call)
			// We need to mock the workflow resolution path

			// First call: /api/prompt (submission)
			fetchMock.mockResolvedValueOnce(
				new Response(JSON.stringify({ prompt_id: "test-prompt" }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			)
			// Second call: /api/history/{id} (polling)
			fetchMock.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						"test-prompt": {
							status: { completed: true },
							outputs: { "9": { images: [{ filename: "result.png", type: "output", subfolder: "" }] } },
						},
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				),
			)

			const provider = new ComfyCloudProvider(mockContext())
			const result = await provider.generate("a cute cat", { model: "sd_xl_turbo", seed: 42 })

			expect(result.success).toBe(true)
			expect(result.imageData).toContain("result.png")
		})

		it("should return error when execution fails", async () => {
			vi.resetModules()
			const fetchMock = vi.fn<typeof fetch>()
			vi.stubGlobal("fetch", fetchMock)
			const { ComfyCloudProvider } = await import("../comfy-cloud")

			fetchMock.mockResolvedValueOnce(new Response("Bad Request", { status: 400 }))

			const provider = new ComfyCloudProvider(mockContext())
			const result = await provider.generate("test", { model: "sd_xl_turbo" })

			expect(result.success).toBe(false)
			expect(result.error).toBeTruthy()
		})
	})
})

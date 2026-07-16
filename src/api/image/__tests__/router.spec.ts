// npx vitest run src/api/image/__tests__/router.spec.ts

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { ImageProviderRegistry } from "../registry"
import type { ImageProvider } from "../provider"
import type { GenOptions, ImageResult } from "../types"

// ---------------------------------------------------------------------------
// Stub provider for testing
// ---------------------------------------------------------------------------
class StubProvider implements ImageProvider {
	readonly name: string
	constructor(name: string) {
		this.name = name
	}
	async health() {
		return { alive: true }
	}
	async listModels() {
		return []
	}
	async generate(_prompt: string, _options: GenOptions): Promise<ImageResult> {
		return { success: true, imageData: `${this.name}-generate` }
	}
	async edit(_prompt: string, _inputImage: string, _options?: GenOptions): Promise<ImageResult> {
		return { success: true, imageData: `${this.name}-edit` }
	}
	async inpaint(
		_prompt: string,
		_maskImage: string,
		_options?: GenOptions & { maskImage?: string },
	): Promise<ImageResult> {
		return { success: true, imageData: `${this.name}-inpaint` }
	}
	async outpaint(_prompt: string, _inputImage: string, _options?: GenOptions): Promise<ImageResult> {
		return { success: true, imageData: `${this.name}-outpaint` }
	}
	async upscale(_image: string): Promise<ImageResult> {
		return { success: true, imageData: `${this.name}-upscale` }
	}
	async removeBackground(_image: string): Promise<ImageResult> {
		return { success: true, imageData: `${this.name}-remove-bg` }
	}
	async interrupt() {}
	async getProgress() {
		return { state: "idle" as const, progress: 0 }
	}
	getCapabilities() {
		return {
			canGenerate: true,
			canEdit: true,
			canInpaint: true,
			canOutpaint: true,
			canUpscale: true,
			canRemoveBackground: true,
			supportsControlNet: false,
			supportsIPAdapter: false,
			supportsLoRA: false,
			supportsVideo: false,
		}
	}
}

describe("ImageProviderRouter (per-type resolution)", () => {
	beforeEach(() => {
		vi.restoreAllMocks()
		ImageProviderRegistry.clear()
		// Register stub providers
		ImageProviderRegistry.register("comfyui", new StubProvider("ComfyUI"))
		ImageProviderRegistry.register("openrouter", new StubProvider("OpenRouter"))
		ImageProviderRegistry.register("comfy_cloud", new StubProvider("ComfyCloud"))
		ImageProviderRegistry.register("atlas_cloud", new StubProvider("AtlasCloud"))
	})

	afterEach(() => {
		ImageProviderRegistry.clear()
	})

	// -------------------------------------------------------------------
	// Default selector (no per-type override)
	// -------------------------------------------------------------------

	describe("with default selector (no per-type)", () => {
		it("should resolve openrouter when selector returns 'openrouter'", async () => {
			const { ImageProviderRouter, setActiveProviderSelector } = await import("../router")
			setActiveProviderSelector(() => "openrouter")

			const provider = ImageProviderRouter.getActiveProvider()
			expect(provider?.name).toBe("OpenRouter")
		})

		it("should resolve comfy_cloud when selector returns 'comfy_cloud'", async () => {
			const { ImageProviderRouter, setActiveProviderSelector } = await import("../router")
			setActiveProviderSelector(() => "comfy_cloud")

			const provider = ImageProviderRouter.getActiveProvider()
			expect(provider?.name).toBe("ComfyCloud")
		})

		it("should resolve atlas_cloud when selector returns 'atlas_cloud'", async () => {
			const { ImageProviderRouter, setActiveProviderSelector } = await import("../router")
			setActiveProviderSelector(() => "atlas_cloud")

			const provider = ImageProviderRouter.getActiveProvider()
			expect(provider?.name).toBe("AtlasCloud")
		})

		it("should return undefined when selector returns an unregistered key", async () => {
			const { ImageProviderRouter, setActiveProviderSelector } = await import("../router")
			setActiveProviderSelector(() => "nonexistent")

			const provider = ImageProviderRouter.getActiveProvider()
			expect(provider).toBeUndefined()
		})

		it("should return undefined when selector returns undefined", async () => {
			const { ImageProviderRouter, setActiveProviderSelector } = await import("../router")
			setActiveProviderSelector(() => undefined)

			const provider = ImageProviderRouter.getActiveProvider()
			expect(provider).toBeUndefined()
		})
	})

	// -------------------------------------------------------------------
	// Per-type resolution (the core feature for comfy-cloud / atlas-cloud)
	// -------------------------------------------------------------------

	describe("per-type resolution", () => {
		it("should use per-type provider when pipelineType matches generationProviders", async () => {
			const { ImageProviderRouter, setActiveProviderSelector } = await import("../router")

			// Simulate connectProviderSelectorToSettings behavior:
			// per-type lookup first, then fallback
			const generationProviders: Record<string, string> = {
				txt2img: "comfy_cloud",
				img2img: "atlas_cloud",
				inpaint: "comfyui",
			}
			setActiveProviderSelector((pipelineType?: string) => {
				if (pipelineType && generationProviders[pipelineType]) {
					return generationProviders[pipelineType]
				}
				return "openrouter"
			})

			// Specific lookups
			const txt2imgProvider = ImageProviderRouter.getActiveProvider("txt2img")
			expect(txt2imgProvider?.name).toBe("ComfyCloud")

			const img2imgProvider = ImageProviderRouter.getActiveProvider("img2img")
			expect(img2imgProvider?.name).toBe("AtlasCloud")

			const inpaintProvider = ImageProviderRouter.getActiveProvider("inpaint")
			expect(inpaintProvider?.name).toBe("ComfyUI")
		})

		it("should fallback to global provider when pipelineType has no override", async () => {
			const { ImageProviderRouter, setActiveProviderSelector } = await import("../router")

			const generationProviders: Record<string, string> = {
				txt2img: "comfy_cloud",
			}
			setActiveProviderSelector((pipelineType?: string) => {
				if (pipelineType && generationProviders[pipelineType]) {
					return generationProviders[pipelineType]
				}
				return "openrouter"
			})

			// outpainting has no override → fallback to global (openrouter)
			const outpaintProvider = ImageProviderRouter.getActiveProvider("outpaint")
			expect(outpaintProvider?.name).toBe("OpenRouter")
		})

		it("should fallback to global when pipelineType is undefined", async () => {
			const { ImageProviderRouter, setActiveProviderSelector } = await import("../router")

			setActiveProviderSelector((pipelineType?: string) => {
				if (pipelineType && pipelineType === "txt2img") return "comfy_cloud"
				return "atlas_cloud"
			})

			const provider = ImageProviderRouter.getActiveProvider()
			expect(provider?.name).toBe("AtlasCloud")
		})

		it("should resolve correctly for each pipeline operation type", async () => {
			const { ImageProviderRouter, setActiveProviderSelector } = await import("../router")

			setActiveProviderSelector((pipelineType?: string) => {
				const map: Record<string, string> = {
					txt2img: "comfy_cloud",
					img2img: "atlas_cloud",
					inpaint: "comfyui",
					outpaint: "openrouter",
					upscale: "comfy_cloud",
					"remove-bg": "atlas_cloud",
				}
				return pipelineType ? (map[pipelineType] ?? "openrouter") : "openrouter"
			})

			expect(ImageProviderRouter.getActiveProvider("txt2img")?.name).toBe("ComfyCloud")
			expect(ImageProviderRouter.getActiveProvider("img2img")?.name).toBe("AtlasCloud")
			expect(ImageProviderRouter.getActiveProvider("inpaint")?.name).toBe("ComfyUI")
			expect(ImageProviderRouter.getActiveProvider("outpaint")?.name).toBe("OpenRouter")
			expect(ImageProviderRouter.getActiveProvider("upscale")?.name).toBe("ComfyCloud")
			expect(ImageProviderRouter.getActiveProvider("remove-bg")?.name).toBe("AtlasCloud")
		})
	})

	// -------------------------------------------------------------------
	// Operation delegation through the router
	// -------------------------------------------------------------------

	describe("operation delegation", () => {
		it("generate should delegate to txt2img provider", async () => {
			const { ImageProviderRouter, setActiveProviderSelector } = await import("../router")
			setActiveProviderSelector((pipelineType?: string) => {
				if (pipelineType === "txt2img") return "comfy_cloud"
				return "openrouter"
			})

			const result = await ImageProviderRouter.generate("test", { model: "test" })
			expect(result.imageData).toBe("ComfyCloud-generate")
		})

		it("edit should delegate to img2img provider", async () => {
			const { ImageProviderRouter, setActiveProviderSelector } = await import("../router")
			setActiveProviderSelector((pipelineType?: string) => {
				if (pipelineType === "img2img") return "atlas_cloud"
				return "openrouter"
			})

			const result = await ImageProviderRouter.edit("test", "img")
			expect(result.imageData).toBe("AtlasCloud-edit")
		})

		it("inpaint should delegate to inpaint provider", async () => {
			const { ImageProviderRouter, setActiveProviderSelector } = await import("../router")
			setActiveProviderSelector((pipelineType?: string) => {
				if (pipelineType === "inpaint") return "comfyui"
				return "openrouter"
			})

			const result = await ImageProviderRouter.inpaint("test", "mask")
			expect(result.imageData).toBe("ComfyUI-inpaint")
		})

		it("should return error when no provider is registered for the resolved type", async () => {
			const { ImageProviderRouter, setActiveProviderSelector } = await import("../router")
			// Clear registry so nothing is available
			ImageProviderRegistry.clear()
			setActiveProviderSelector(() => "comfyui")

			const result = await ImageProviderRouter.generate("test", { model: "test" })
			expect(result.success).toBe(false)
			expect(result.error).toContain("No image generation provider")
		})
	})
})

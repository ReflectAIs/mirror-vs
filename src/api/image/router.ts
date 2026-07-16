/**
 * ImageProviderRouter — the single entry-point for image generation.
 *
 * The router:
 *  1. Resolves the active provider from the current extension settings
 *  2. Delegates the call to `provider.generate()`
 *  3. Handles approval, error wrapping and result-formatting
 *
 * Tools and other callers never import provider implementations directly.
 *
 * ## Per-Type Resolution
 *
 * The router supports optional per-pipeline-type provider resolution.
 * If a `pipelineType` (e.g. "txt2img", "img2img") is passed, the selector
 * first checks `generationProviders[pipelineType]` for a type-specific
 * provider, falling back to the global `imageGenerationProvider` setting.
 */
import type { ImageProvider } from "./provider"
import { ImageProviderRegistry } from "./registry"
import type { GenOptions, ImageResult } from "./types"

/**
 * Provider selector function.
 *
 * When `pipelineType` is provided, the selector should attempt a
 * per-type lookup first, then fall back to the global provider setting.
 */
export type ProviderSelector = (pipelineType?: string) => string | undefined

/**
 * Default selector: reads the provider name from global state.
 * Override for testing or alternative resolution strategies.
 */
let activeProviderSelector: ProviderSelector = () => "openrouter"

export function setActiveProviderSelector(selector: ProviderSelector): void {
	activeProviderSelector = selector
}

export class ImageProviderRouter {
	/**
	 * Resolve the active provider, optionally scoped to a pipeline type.
	 *
	 * @param pipelineType - Optional pipeline type key (e.g. "txt2img", "img2img")
	 *                       used for per-type provider resolution.
	 */
	static getActiveProvider(pipelineType?: string): ImageProvider | undefined {
		const key = activeProviderSelector(pipelineType)
		console.log(`[ImageProviderRouter] getActiveProvider(pipelineType="${pipelineType}") -> key="${key}"`)
		if (!key) {
			console.log(`[ImageProviderRouter]   selector returned nothing — no active provider`)
			return undefined
		}
		const provider = ImageProviderRegistry.get(key)
		console.log(`[ImageProviderRouter]   registry.get("${key}") -> ${provider?.name ?? "undefined"}`)
		if (!provider) {
			console.log(
				`[ImageProviderRouter]   provider "${key}" is NOT registered. Available: ${JSON.stringify(ImageProviderRegistry.getAvailable())}`,
			)
		}
		return provider
	}

	/**
	 * Generate an image using the active provider (txt2img).
	 */
	static async generate(prompt: string, options: GenOptions): Promise<ImageResult> {
		const provider = ImageProviderRouter.getActiveProvider("txt2img")
		if (!provider) {
			return {
				success: false,
				error: "No image generation provider is configured or available.",
			}
		}
		return provider.generate(prompt, options)
	}

	/**
	 * Edit an image using the active provider (img2img).
	 */
	static async edit(prompt: string, inputImage: string, options?: GenOptions): Promise<ImageResult> {
		const provider = ImageProviderRouter.getActiveProvider("img2img")
		if (!provider) {
			return { success: false, error: "No image generation provider is configured or available." }
		}
		return provider.edit(prompt, inputImage, options)
	}

	/**
	 * Inpaint using the active provider.
	 */
	static async inpaint(
		prompt: string,
		maskImage: string,
		options?: GenOptions & { maskImage?: string },
	): Promise<ImageResult> {
		const provider = ImageProviderRouter.getActiveProvider("inpaint")
		if (!provider) {
			return { success: false, error: "No image generation provider is configured or available." }
		}
		return provider.inpaint(prompt, maskImage, options as any)
	}

	/**
	 * Outpaint using the active provider.
	 */
	static async outpaint(prompt: string, inputImage: string, options?: GenOptions): Promise<ImageResult> {
		const provider = ImageProviderRouter.getActiveProvider("outpaint")
		if (!provider) {
			return { success: false, error: "No image generation provider is configured or available." }
		}
		return provider.outpaint(prompt, inputImage, options)
	}

	/**
	 * Upscale an image using the active provider.
	 */
	static async upscale(image: string): Promise<ImageResult> {
		const provider = ImageProviderRouter.getActiveProvider("upscale")
		if (!provider) {
			return { success: false, error: "No image generation provider is configured or available." }
		}
		return provider.upscale(image)
	}

	/**
	 * Remove background using the active provider.
	 */
	static async removeBackground(image: string): Promise<ImageResult> {
		const provider = ImageProviderRouter.getActiveProvider("remove-bg")
		if (!provider) {
			return { success: false, error: "No image generation provider is configured or available." }
		}
		return provider.removeBackground(image)
	}
}

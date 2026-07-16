/**
 * OpenRouter image provider — wraps the existing `generateImage` flow
 * into the standard `ImageProvider` interface.
 */
import type { ImageProvider } from "../provider"
import type {
	HealthStatus,
	ModelInfo,
	GenOptions,
	EditOptions,
	InpaintOptions,
	OutpaintOptions,
	UpscaleOptions,
	ImageResult,
	ProgressInfo,
	ProviderCapabilities,
} from "../types"
import { generateImageWithProvider } from "../../providers/utils/image-generation"

export class OpenRouterImageProvider implements ImageProvider {
	readonly name = "OpenRouter"

	private apiKey: string
	private baseURL: string

	constructor(apiKey: string, baseURL?: string) {
		this.apiKey = apiKey
		this.baseURL = baseURL || "https://openrouter.ai/api/v1"
	}

	async health(): Promise<HealthStatus> {
		try {
			const res = await fetch(`${this.baseURL}/v1/models`, {
				headers: { Authorization: `Bearer ${this.apiKey}` },
			})
			return { alive: res.ok, message: res.ok ? "OK" : `HTTP ${res.status}` }
		} catch (err: any) {
			return { alive: false, message: err.message }
		}
	}

	async listModels(): Promise<ModelInfo[]> {
		// We return a fixed set — OpenRouter exposes many models but
		// we only advertise those we know support image output.
		return [
			{ id: "google/gemini-2.5-flash-image", name: "Gemini 2.5 Flash Image", provider: "openrouter" },
			{ id: "google/gemini-3-pro-image-preview", name: "Gemini 3 Pro Image Preview", provider: "openrouter" },
			{ id: "openai/gpt-5-image", name: "GPT-5 Image", provider: "openrouter" },
			{ id: "openai/gpt-5-image-mini", name: "GPT-5 Image Mini", provider: "openrouter" },
			{ id: "black-forest-labs/flux.2-flex", name: "Black Forest Labs FLUX.2 Flex", provider: "openrouter" },
			{ id: "black-forest-labs/flux.2-pro", name: "Black Forest Labs FLUX.2 Pro", provider: "openrouter" },
		]
	}

	async generate(prompt: string, options: GenOptions): Promise<ImageResult> {
		return generateImageWithProvider({
			baseURL: this.baseURL,
			authToken: this.apiKey,
			model: options.model,
			prompt,
		})
	}

	async edit(prompt: string, inputImage: string, options?: EditOptions): Promise<ImageResult> {
		return generateImageWithProvider({
			baseURL: this.baseURL,
			authToken: this.apiKey,
			model: options?.model || "google/gemini-2.5-flash-image",
			prompt,
			inputImage,
		})
	}

	async inpaint(prompt: string, maskImage: string, options?: InpaintOptions): Promise<ImageResult> {
		// OpenRouter doesn't have a dedicated inpaint API; fall back to edit with mask
		return generateImageWithProvider({
			baseURL: this.baseURL,
			authToken: this.apiKey,
			model: options?.model || "google/gemini-2.5-flash-image",
			prompt,
			inputImage: maskImage,
		})
	}

	async outpaint(_prompt: string, _inputImage: string, _options?: OutpaintOptions): Promise<ImageResult> {
		return { success: false, error: "Outpainting is not supported by OpenRouter." }
	}

	async upscale(_image: string, _options?: UpscaleOptions): Promise<ImageResult> {
		return { success: false, error: "Upscaling is not supported by OpenRouter." }
	}

	async removeBackground(_image: string): Promise<ImageResult> {
		return { success: false, error: "Background removal is not supported by OpenRouter." }
	}

	async interrupt(): Promise<void> {
		// OpenRouter API calls are short-lived; no cancel endpoint used.
	}

	async getProgress(): Promise<ProgressInfo> {
		return { state: "idle", progress: 0 }
	}

	getCapabilities(): ProviderCapabilities {
		return {
			canGenerate: true,
			canEdit: true,
			canInpaint: false,
			canOutpaint: false,
			canUpscale: false,
			canRemoveBackground: false,
			supportsControlNet: false,
			supportsIPAdapter: false,
			supportsLoRA: false,
			supportsVideo: false,
		}
	}
}

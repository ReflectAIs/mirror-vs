/**
 * Image generation model constants
 */

/**
 * API method used for image generation
 */
export type ImageGenerationApiMethod = "chat_completions" | "images_api" | "local_api"

export interface ImageGenerationModel {
	value: string
	label: string
	provider: ImageGenerationProvider
	apiMethod?: ImageGenerationApiMethod
}

export const IMAGE_GENERATION_MODELS: ImageGenerationModel[] = [
	// OpenRouter models
	{ value: "google/gemini-2.5-flash-image", label: "Gemini 2.5 Flash Image", provider: "openrouter" },
	{ value: "google/gemini-3-pro-image-preview", label: "Gemini 3 Pro Image Preview", provider: "openrouter" },
	{ value: "openai/gpt-5-image", label: "GPT-5 Image", provider: "openrouter" },
	{ value: "openai/gpt-5-image-mini", label: "GPT-5 Image Mini", provider: "openrouter" },
	{ value: "black-forest-labs/flux.2-flex", label: "Black Forest Labs FLUX.2 Flex", provider: "openrouter" },
	{ value: "black-forest-labs/flux.2-pro", label: "Black Forest Labs FLUX.2 Pro", provider: "openrouter" },

	// ComfyUI models (checkpoint names used in workflow nodes)
	{ value: "sd_xl_turbo", label: "SDXL Turbo", provider: "comfyui", apiMethod: "local_api" },
	{ value: "sd_xl_base_1.0", label: "SDXL Base 1.0", provider: "comfyui", apiMethod: "local_api" },

	// Comfy Cloud models
	{
		value: "comfy-cloud/default",
		label: "Comfy Cloud (managed runtime)",
		provider: "comfy_cloud",
		apiMethod: "local_api",
	},

	// Atlas Cloud models
	{
		value: "atlas-cloud/default",
		label: "Atlas Cloud (aggregator)",
		provider: "atlas_cloud",
		apiMethod: "chat_completions",
	},
]

/**
 * Get array of model values only (for backend validation)
 */
export const IMAGE_GENERATION_MODEL_IDS = IMAGE_GENERATION_MODELS.map((m) => m.value)

/**
 * Image generation provider type — extended to support local providers
 */
export type ImageGenerationProvider = "openrouter" | "comfyui" | "comfy_cloud" | "atlas_cloud"

/**
 * Get the image generation provider with backwards compatibility
 * - If provider is explicitly set, use it
 * - If a model is already configured (existing users), default to "openrouter"
 * - Otherwise default to "openrouter" (new users)
 */
export function getImageGenerationProvider(
	explicitProvider: ImageGenerationProvider | undefined,
	_hasExistingModel: boolean,
): ImageGenerationProvider {
	return explicitProvider !== undefined ? explicitProvider : "openrouter"
}

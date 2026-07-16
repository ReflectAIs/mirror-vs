/**
 * Abstract interface that every image generation provider must implement.
 *
 * Providers are interchangeable — the router (or a tool) delegates to whichever
 * provider is active, without importing provider-specific code.
 */
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
} from "./types"

export interface ImageProvider {
	/** Human-readable provider name (e.g. "ComfyUI", "OpenRouter") */
	readonly name: string

	// ------------------------------------------------------------------ Lifecycle

	/** Quick connectivity / readiness check */
	health(): Promise<HealthStatus>

	/** List models this provider can use right now */
	listModels(): Promise<ModelInfo[]>

	// ------------------------------------------------------------------ Image ops

	/** Text-to-image generation */
	generate(prompt: string, options: GenOptions): Promise<ImageResult>

	/** Image-to-image edit (prompt-guided) */
	edit(prompt: string, inputImage: string, options?: EditOptions): Promise<ImageResult>

	/** Inpainting — fill masked region given a prompt */
	inpaint(prompt: string, maskImage: string, options?: InpaintOptions): Promise<ImageResult>

	/** Outpainting — extend canvas beyond original bounds */
	outpaint(prompt: string, inputImage: string, options?: OutpaintOptions): Promise<ImageResult>

	/** Upscale an existing image */
	upscale(image: string, options?: UpscaleOptions): Promise<ImageResult>

	/** Remove background (return RGBA image with transparent BG) */
	removeBackground(image: string): Promise<ImageResult>

	// ------------------------------------------------------------------ Control

	/** Cancel a running generation */
	interrupt(): Promise<void>

	/** Poll progress of the current/last job */
	getProgress(): Promise<ProgressInfo>

	// ------------------------------------------------------------------ Meta

	/** Declare capabilities so the UI can enable/disable features */
	getCapabilities(): ProviderCapabilities
}

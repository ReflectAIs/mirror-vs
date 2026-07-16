/**
 * Shared types for the image generation provider architecture.
 */

/** Health check result */
export interface HealthStatus {
	alive: boolean
	message?: string
	version?: string
	uptime?: number
}

/** Metadata about an image model available from a provider */
export interface ModelInfo {
	id: string
	name: string
	provider: string
	installed?: boolean
	downloadable?: boolean
	recommended?: boolean
	minRAM?: number
	minVRAM?: number
	supportedFeatures?: string[]
	downloadUrl?: string
	checksum?: string
	size?: number
}

/** Options passed to `generate()` */
export interface GenOptions {
	model: string
	width?: number
	height?: number
	seed?: number
	steps?: number
	cfgScale?: number
	negativePrompt?: string
	/** Sampler name (e.g. "euler", "euler_ancestral", "dpmpp_2m") */
	samplerName?: string
	/** Scheduler (e.g. "normal", "sgm_uniform", "karras") */
	scheduler?: string
	/** Pipeline slug override (e.g. "txt2img-flash" for fast generation).
	 *  If omitted, the provider auto-selects based on task context. */
	pipeline?: string
	/** Optional callback for progress updates during generation */
	onProgress?: (progress: ProgressInfo) => void
	/**
	 * Pipeline allowlists for restricting which pipelines can be auto-selected.
	 * When provided, autoSelect() filters candidates to those matching the
	 * global allowlist and/or the per-model allowlist for the current model.
	 */
	allowlists?: import("../../shared/allowlists").PipelineAllowlists
}

/** Options passed to `edit()` */
export interface EditOptions extends GenOptions {
	maskImage?: string
}

/** Options passed to `inpaint()` */
export interface InpaintOptions extends GenOptions {
	maskImage: string
}

/** Options passed to `outpaint()` */
export interface OutpaintOptions extends GenOptions {
	direction?: "left" | "right" | "up" | "down"
	expandPixels?: number
}

/** Options passed to `upscale()` */
export interface UpscaleOptions {
	scaleFactor?: number
	targetWidth?: number
	targetHeight?: number
	/** Pipeline slug override (e.g. "upscale-real-esrgan") */
	pipeline?: string
	/** Model name for auto-selecting a compatible pipeline */
	model?: string
}

/** Result of a successful (or failed) image operation */
export interface ImageResult {
	success: boolean
	imageData?: string // base64 data URL
	imageFormat?: string
	error?: string
	/** Machine-readable error code (e.g. "MISSING_INPUT", "MODEL_NOT_FOUND") */
	errorCode?: string
	/** Error category (e.g. "workflow_validation", "network_error", "execution_error") */
	errorCategory?: string
	/** Actionable suggestion for the LLM on how to fix the issue */
	errorSuggestion?: string
	/** ID of the ComfyUI node that caused the error, if known */
	errorNodeId?: string
	seed?: number
	executionTimeMs?: number
}

/** Progress information for long-running operations */
export interface ProgressInfo {
	state: "idle" | "preparing" | "running" | "completed" | "failed"
	progress: number // 0-100
	stage?: string
	eta?: number
	currentNode?: string
	/** Raw progress step value from the provider (e.g. ComfyUI WS value) */
	value?: number
	/** Raw progress maximum from the provider (e.g. ComfyUI WS max) */
	max?: number
}

/** Flags describing what a provider supports */
export interface ProviderCapabilities {
	canGenerate: boolean
	canEdit: boolean
	canInpaint: boolean
	canOutpaint: boolean
	canUpscale: boolean
	canRemoveBackground: boolean
	supportsControlNet: boolean
	supportsIPAdapter: boolean
	supportsLoRA: boolean
	supportsVideo: boolean
}

/** Job tracked by the image job queue */
export interface ImageJob {
	id: string
	state: "queued" | "preparing" | "running" | "completed" | "failed" | "cancelled"
	prompt: string
	provider: string
	progress: number
	eta?: number
	result?: ImageResult
	createdAt: number
}

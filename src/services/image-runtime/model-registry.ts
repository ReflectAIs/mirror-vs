/**
 * Model Registry — metadata-driven catalog of downloadable models.
 *
 * Each entry describes the model, its hardware requirements, download URL,
 * checksum, and which features it supports. New models can be added without
 * touching any code.
 */
export interface ModelMetadata {
	id: string
	provider: string
	displayName: string
	installed: boolean
	downloadable: boolean
	recommended: boolean
	minRAM: number // GB
	minVRAM?: number // GB
	supportedFeatures: string[] // "txt2img", "img2img", "inpaint", "lora", "controlnet"
	downloadUrl?: string
	checksum?: string
	size?: number // bytes
	description?: string
}

/**
 * Built-in model catalog.
 * These are the models we know about and can auto-download.
 * Users can also install their own models manually.
 */
const MODEL_CATALOG: ModelMetadata[] = [
	{
		id: "flux.1-schnell",
		provider: "comfyui",
		displayName: "FLUX.1 Schnell",
		installed: false,
		downloadable: true,
		recommended: true,
		minRAM: 16,
		minVRAM: 8,
		supportedFeatures: ["txt2img", "img2img"],
		// NOTE: FLUX.1-schnell is a gated model on HuggingFace. Users must
		// accept the license at https://huggingface.co/black-forest-labs/FLUX.1-schnell
		// and provide a HF token for authentication.
		downloadUrl: "https://huggingface.co/black-forest-labs/FLUX.1-schnell/resolve/main/flux1-schnell.safetensors",
		size: 7_600_000_000, // ~7.6 GB
		description: "Fast version of Black Forest Labs FLUX.1 — good quality, 4-step generation",
	},
	{
		id: "sd_xl_turbo",
		provider: "comfyui",
		displayName: "Stable Diffusion XL Turbo",
		installed: false,
		downloadable: true,
		recommended: true,
		minRAM: 8,
		minVRAM: 4,
		supportedFeatures: ["txt2img", "img2img"],
		// Note: the SDXL Turbo checkpoint is named sd_xl_turbo_1.0.safetensors on HF
		downloadUrl: "https://huggingface.co/stabilityai/sdxl-turbo/resolve/main/sd_xl_turbo_1.0.safetensors",
		size: 3_400_000_000, // ~3.4 GB
		description: "Stability AI SDXL Turbo — fast 1-step generation, good for most tasks",
	},
	{
		id: "sd_1.5",
		provider: "comfyui",
		displayName: "Stable Diffusion 1.5",
		installed: false,
		downloadable: true,
		recommended: false,
		minRAM: 4,
		minVRAM: 2,
		supportedFeatures: ["txt2img", "img2img", "inpaint", "lora", "controlnet"],
		downloadUrl:
			"https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-v1-5/resolve/main/v1-5-pruned-emaonly.safetensors",
		size: 2_000_000_000, // ~2 GB
		description: "Stable Diffusion 1.5 — widely compatible with LoRAs and ControlNets",
	},
	{
		id: "sd_xl_inpaint",
		provider: "comfyui",
		displayName: "SDXL Inpaint",
		installed: false,
		downloadable: true,
		recommended: false,
		minRAM: 8,
		minVRAM: 4,
		supportedFeatures: ["inpaint"],
		// Note: SDXL Inpaint is a gated/diffusers model; no standalone .safetensors available
		// This URL may return 401. Users should install inpaint models manually.
		downloadUrl:
			"https://huggingface.co/diffusers/stable-diffusion-xl-1.0-inpainting/resolve/main/sdxl_inpaint.safetensors",
		size: 3_400_000_000,
		description: "SDXL fine-tuned for inpainting tasks",
	},
	{
		id: "4x_ultrasharp",
		provider: "comfyui",
		displayName: "4x UltraSharp Upscaler",
		installed: false,
		downloadable: true,
		recommended: false,
		minRAM: 4,
		minVRAM: 2,
		supportedFeatures: ["upscale"],
		downloadUrl: "https://huggingface.co/lokCX/4x-UltraSharp/resolve/main/4x-UltraSharp.safetensors",
		size: 65_000_000,
		description: "4x upscaling model — sharpens and enhances resolution",
	},
	{
		id: "tiny-sd",
		provider: "comfyui",
		displayName: "Tiny SD (Lightweight)",
		installed: false,
		downloadable: true,
		recommended: false,
		minRAM: 2,
		supportedFeatures: ["txt2img"],
		downloadUrl: "https://huggingface.co/OFA-Sys/small-stable-diffusion-v0/resolve/main/small-sd.safetensors",
		size: 800_000_000,
		description: "Lightweight model for systems with limited resources",
	},

	// ── Text-to-Audio ────────────────────────────────────────────────────────
	{
		id: "musicgen-small",
		provider: "comfyui",
		displayName: "MusicGen Small (Audio)",
		installed: false,
		downloadable: true,
		recommended: true,
		minRAM: 4,
		supportedFeatures: ["txt2audio"],
		// ComfyUI-AudioScheduler community node uses HF hub for this model
		downloadUrl: "https://huggingface.co/facebook/musicgen-small/resolve/main/pytorch_model.bin",
		size: 312_000_000, // ~312 MB
		description: "Facebook MusicGen Small — fast text-to-music/audio, no HF token required",
	},
	{
		id: "stable-audio-open",
		provider: "comfyui",
		displayName: "Stable Audio Open 1.0",
		installed: false,
		downloadable: true,
		recommended: false,
		minRAM: 8,
		minVRAM: 6,
		supportedFeatures: ["txt2audio"],
		// Gated model — requires HuggingFace token (licence agreement)
		downloadUrl: "https://huggingface.co/stabilityai/stable-audio-open-1.0/resolve/main/model.safetensors",
		size: 3_400_000_000, // ~3.4 GB
		description: "Stability AI Stable Audio Open — high-quality text-to-audio generation (requires HF token)",
		requiresHFToken: true,
	} as any,

	// ── Text-to-Video ────────────────────────────────────────────────────────
	{
		id: "wan2-t2v-1.3b",
		provider: "comfyui",
		displayName: "Wan2.1 T2V 1.3B (Video)",
		installed: false,
		downloadable: true,
		recommended: true,
		minRAM: 8,
		minVRAM: 6,
		supportedFeatures: ["txt2video"],
		downloadUrl: "https://huggingface.co/Wan-AI/Wan2.1-T2V-1.3B/resolve/main/wan2.1_t2v_1.3B_bf16.safetensors",
		size: 2_600_000_000, // ~2.6 GB
		description: "Wan2.1 T2V 1.3B — fast text-to-video, runs on Apple Silicon and NVIDIA GPUs",
	},
	{
		id: "animatediff-motion-v3",
		provider: "comfyui",
		displayName: "AnimateDiff Motion v3 (Video)",
		installed: false,
		downloadable: true,
		recommended: false,
		minRAM: 16,
		minVRAM: 8,
		supportedFeatures: ["txt2video"],
		downloadUrl: "https://huggingface.co/guoyww/animatediff/resolve/main/v3_sd15_mm.ckpt",
		size: 1_700_000_000, // ~1.7 GB (motion module only; requires SD 1.5 base)
		description: "AnimateDiff Motion Module v3 — high-quality video generation (requires SD 1.5 + 8GB+ VRAM)",
	},
]

class ModelRegistryClass {
	private installedModels: Map<string, ModelMetadata> = new Map()

	constructor() {
		// Seed catalog entries — installed status will be updated at runtime
		for (const model of MODEL_CATALOG) {
			this.installedModels.set(model.id, { ...model })
		}
	}

	/** Get all known models */
	getCatalog(): ModelMetadata[] {
		return Array.from(this.installedModels.values())
	}

	/** Get models for a specific provider */
	getModelsForProvider(provider: string): ModelMetadata[] {
		return this.getCatalog().filter((m) => m.provider === provider)
	}

	/** Get a single model by ID */
	getModel(id: string): ModelMetadata | undefined {
		return this.installedModels.get(id)
	}

	/** Mark a model as installed */
	markInstalled(id: string, path?: string): void {
		const model = this.installedModels.get(id)
		if (model) {
			model.installed = true
		}
	}

	/** Mark a model as not installed */
	markNotInstalled(id: string): void {
		const model = this.installedModels.get(id)
		if (model) {
			model.installed = false
		}
	}

	/** Register a custom (user-added) model */
	registerCustom(model: ModelMetadata): void {
		this.installedModels.set(model.id, { ...model, installed: true })
	}

	/** Get recommended models based on hardware */
	getRecommended(): ModelMetadata[] {
		return this.getCatalog().filter((m) => m.recommended)
	}
}

export const modelRegistry = new ModelRegistryClass()

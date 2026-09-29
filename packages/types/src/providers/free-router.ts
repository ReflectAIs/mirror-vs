import type { ModelInfo } from "../model.js"

export interface FreeRouterModelEntry {
	id: string
	name: string
	provider: "openrouter" | "gemini" | "custom"
	contextWindow: number
	maxTokens: number
	enabled: boolean
	description?: string
}

export const freeRouterDefaultModelId = "google/gemma-4-31b-it:free"

export const freeRouterDefaultModelInfo: ModelInfo = {
	maxTokens: 32_768,
	contextWindow: 262_144,
	supportsImages: true,
	supportsPromptCache: true,
	inputPrice: 0.0,
	outputPrice: 0.0,
	cacheWritesPrice: 0.0,
	cacheReadsPrice: 0.0,
	description: "Google Gemma 4 31B (Free Tier) — Multimodal open model routed via OpenRouter free tier.",
}

export const freeRouterModels: Record<string, ModelInfo> = {
	"google/gemma-4-31b-it:free": {
		maxTokens: 32_768,
		contextWindow: 262_144,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 0.0,
		outputPrice: 0.0,
		cacheWritesPrice: 0.0,
		cacheReadsPrice: 0.0,
		description:
			"Google Gemma 4 31B (Free) — Dense multimodal model with 262k context, vision support, and strong coding capabilities.",
	},
	"qwen/qwen3.8-27b:free": {
		maxTokens: 32_768,
		contextWindow: 262_144,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 0.0,
		outputPrice: 0.0,
		cacheWritesPrice: 0.0,
		cacheReadsPrice: 0.0,
		description:
			"Qwen 3.8 27B (Free) — Frontier open-weight model with strong code synthesis, refactoring, and agentic workflows.",
	},
	"cohere/north-mini-code:free": {
		maxTokens: 32_768,
		contextWindow: 256_000,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.0,
		outputPrice: 0.0,
		cacheWritesPrice: 0.0,
		cacheReadsPrice: 0.0,
		description: "Cohere North Mini Code (Free) — Purpose-built code reasoning and generation model.",
	},
	"nvidia/nemotron-3-ultra-550b-a55b:free": {
		maxTokens: 32_768,
		contextWindow: 1_000_000,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.0,
		outputPrice: 0.0,
		cacheWritesPrice: 0.0,
		cacheReadsPrice: 0.0,
		description:
			"NVIDIA Nemotron 3 Ultra 550B MoE (Free) — Massive 1M context window for large codebase comprehension.",
	},
	"nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free": {
		maxTokens: 32_768,
		contextWindow: 256_000,
		supportsImages: true,
		supportsPromptCache: true,
		preserveReasoning: true,
		inputPrice: 0.0,
		outputPrice: 0.0,
		cacheWritesPrice: 0.0,
		cacheReadsPrice: 0.0,
		description:
			"NVIDIA Nemotron 3 Nano Omni (Free) — High reasoning chain-of-thought model with 256k context and multimodal support.",
	},
	"google/gemma-4-26b-a4b-it:free": {
		maxTokens: 32_768,
		contextWindow: 262_144,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 0.0,
		outputPrice: 0.0,
		cacheWritesPrice: 0.0,
		cacheReadsPrice: 0.0,
		description: "Google Gemma 4 26B A4B (Free) — High efficiency multimodal model with 262k context.",
	},
	"nvidia/nemotron-3.5-lightning:free": {
		maxTokens: 32_768,
		contextWindow: 1_000_000,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.0,
		outputPrice: 0.0,
		cacheWritesPrice: 0.0,
		cacheReadsPrice: 0.0,
		description: "NVIDIA Nemotron 3.5 Lightning (Free) — 1M context lightning fast open model.",
	},
	"nvidia/nemotron-3-super-120b-a12b:free": {
		maxTokens: 32_768,
		contextWindow: 262_144,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.0,
		outputPrice: 0.0,
		cacheWritesPrice: 0.0,
		cacheReadsPrice: 0.0,
		description: "NVIDIA Nemotron 3 Super 120B (Free) — 262k context frontier open weights model.",
	},
	"thinkingmachines/inkling:free": {
		maxTokens: 32_768,
		contextWindow: 1_048_576,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.0,
		outputPrice: 0.0,
		cacheWritesPrice: 0.0,
		cacheReadsPrice: 0.0,
		description:
			"Thinking Machines Inkling (Free) — 1M token context reasoning model for whole-codebase comprehension.",
	},
	"poolside/laguna-s-2.1:free": {
		maxTokens: 32_768,
		contextWindow: 262_144,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.0,
		outputPrice: 0.0,
		cacheWritesPrice: 0.0,
		cacheReadsPrice: 0.0,
		description: "Poolside Laguna S 2.1 (Free) — Purpose-built coding foundation model with 262k context.",
	},
}

export const DEFAULT_FREE_ROUTER_MODELS: FreeRouterModelEntry[] = [
	{
		id: "google/gemma-4-31b-it:free",
		name: "Google Gemma 4 31B (OpenRouter Free)",
		provider: "openrouter",
		contextWindow: 262_144,
		maxTokens: 32_768,
		enabled: true,
		description: "Google DeepMind's 31B dense multimodal model with 262k context and strong coding capabilities",
	},
	{
		id: "google/gemma-4-26b-a4b-it:free",
		name: "Google Gemma 4 26B (OpenRouter Free)",
		provider: "openrouter",
		contextWindow: 262_144,
		maxTokens: 32_768,
		enabled: true,
		description: "Google DeepMind's 26B A4B efficient multimodal model with 262k context",
	},
	{
		id: "qwen/qwen3.8-27b:free",
		name: "Qwen 3.8 27B (OpenRouter Free)",
		provider: "openrouter",
		contextWindow: 262_144,
		maxTokens: 32_768,
		enabled: true,
		description: "Top-tier open weights model for complex coding, refactoring, and agentic workflows",
	},
	{
		id: "cohere/north-mini-code:free",
		name: "Cohere North Mini Code (OpenRouter Free)",
		provider: "openrouter",
		contextWindow: 256_000,
		maxTokens: 32_768,
		enabled: true,
		description: "Specialized code generation, refactoring, and debugging model by Cohere",
	},
	{
		id: "nvidia/nemotron-3-ultra-550b-a55b:free",
		name: "NVIDIA Nemotron 3 Ultra (OpenRouter Free)",
		provider: "openrouter",
		contextWindow: 1_000_000,
		maxTokens: 32_768,
		enabled: true,
		description: "Frontier 550B MoE open model with 1M context window for large codebase comprehension",
	},
	{
		id: "nvidia/nemotron-3.5-lightning:free",
		name: "NVIDIA Nemotron 3.5 Lightning (OpenRouter Free)",
		provider: "openrouter",
		contextWindow: 1_000_000,
		maxTokens: 32_768,
		enabled: true,
		description: "Ultra-fast 1M context model optimized for rapid analysis and retrieval",
	},
	{
		id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
		name: "NVIDIA Nemotron 3 Nano Omni (OpenRouter Free)",
		provider: "openrouter",
		contextWindow: 256_000,
		maxTokens: 32_768,
		enabled: true,
		description: "High-reasoning chain-of-thought model with 256k context for complex debugging",
	},
	{
		id: "nvidia/nemotron-3-super-120b-a12b:free",
		name: "NVIDIA Nemotron 3 Super (OpenRouter Free)",
		provider: "openrouter",
		contextWindow: 262_144,
		maxTokens: 32_768,
		enabled: true,
		description: "Frontier 120B MoE model with 262k context for advanced reasoning",
	},
	{
		id: "thinkingmachines/inkling:free",
		name: "Thinking Machines Inkling (OpenRouter Free)",
		provider: "openrouter",
		contextWindow: 1_048_576,
		maxTokens: 32_768,
		enabled: true,
		description: "1M token context reasoning model for whole-codebase comprehension",
	},
	{
		id: "poolside/laguna-s-2.1:free",
		name: "Poolside Laguna S 2.1 (OpenRouter Free)",
		provider: "openrouter",
		contextWindow: 262_144,
		maxTokens: 32_768,
		enabled: true,
		description: "Purpose-built coding foundation model with 262k context",
	},
]

/**
 * Resolves the model ID currently in use for the Free Router.
 * If apiModelId is set and present in the pool, it is returned.
 * Otherwise, the first model in the configured pool (or default model) is returned.
 */
export function getFreeRouterActiveModelId(apiConfiguration?: {
	apiModelId?: string
	freeRouterModels?: string[]
}): string {
	if (apiConfiguration?.apiModelId) {
		return apiConfiguration.apiModelId
	}

	const pool =
		Array.isArray(apiConfiguration?.freeRouterModels) && apiConfiguration.freeRouterModels.length > 0
			? apiConfiguration.freeRouterModels
			: DEFAULT_FREE_ROUTER_MODELS.map((m) => m.id)

	return pool[0] ?? freeRouterDefaultModelId
}

/**
 * Returns a clean, user-friendly display name for a free router model ID.
 * E.g., "google/gemma-4-31b-it:free" -> "Gemma 4 31B"
 */
export function getFreeRouterActiveModelName(modelId: string): string {
	const entry = DEFAULT_FREE_ROUTER_MODELS.find((m) => m.id === modelId)
	if (entry?.name) {
		return entry.name.replace(/ \(OpenRouter Free\)$/, "").replace(/^Google /, "")
	}
	const parts = modelId.replace(/:free$/, "").split("/")
	return parts.length > 1 && parts[1] ? parts[1] : modelId
}

import type { ModelInfo } from "../model.js"

export type FreeRouterProviderName =
	| "openrouter"
	| "groq"
	| "cerebras"
	| "nvidia"
	| "sambanova"
	| "gemini"
	| "ollama"
	| "custom"

export interface FreeRouterModelEntry {
	id: string
	name: string
	provider: FreeRouterProviderName
	upstreamModelId?: string
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
	// Groq Free Tier Models
	"groq/llama-3.3-70b-versatile": {
		maxTokens: 32_768,
		contextWindow: 128_000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
		cacheWritesPrice: 0.0,
		cacheReadsPrice: 0.0,
		description: "Groq Llama 3.3 70B (Free Tier) — Ultra-fast LPU inference on Meta's flagship 70B model.",
	},
	"groq/llama-3.1-8b-instant": {
		maxTokens: 8_192,
		contextWindow: 128_000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
		cacheWritesPrice: 0.0,
		cacheReadsPrice: 0.0,
		description: "Groq Llama 3.1 8B (Free Tier) — Instant responses for quick code edits.",
	},
	"groq/deepseek-r1-distill-llama-70b": {
		maxTokens: 32_768,
		contextWindow: 128_000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
		cacheWritesPrice: 0.0,
		cacheReadsPrice: 0.0,
		description: "Groq DeepSeek R1 Distill 70B (Free Tier) — Frontier reasoning model running on Groq LPUs.",
	},
	// Cerebras Free Tier Models
	"cerebras/llama-3.3-70b": {
		maxTokens: 8_192,
		contextWindow: 128_000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
		cacheWritesPrice: 0.0,
		cacheReadsPrice: 0.0,
		description: "Cerebras Llama 3.3 70B (Free Tier) — World's fastest wafer-scale inference (~2000 tokens/sec).",
	},
	"cerebras/llama3.1-8b": {
		maxTokens: 8_192,
		contextWindow: 128_000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
		cacheWritesPrice: 0.0,
		cacheReadsPrice: 0.0,
		description: "Cerebras Llama 3.1 8B (Free Tier) — Ultra-low latency wafer-scale inference.",
	},
	// NVIDIA NIM Free Trial Models
	"nvidia/meta/llama-3.3-70b-instruct": {
		maxTokens: 32_768,
		contextWindow: 128_000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
		cacheWritesPrice: 0.0,
		cacheReadsPrice: 0.0,
		description: "NVIDIA NIM Llama 3.3 70B (Free Trial) — Meta flagship hosted on NVIDIA DGX Cloud.",
	},
	"nvidia/deepseek-ai/deepseek-r1": {
		maxTokens: 32_768,
		contextWindow: 128_000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
		cacheWritesPrice: 0.0,
		cacheReadsPrice: 0.0,
		description: "NVIDIA NIM DeepSeek R1 (Free Trial) — Full 671B reasoning model on NVIDIA NIM infrastructure.",
	},
	"nvidia/nvidia/llama-3.1-nemotron-70b-instruct": {
		maxTokens: 32_768,
		contextWindow: 128_000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
		cacheWritesPrice: 0.0,
		cacheReadsPrice: 0.0,
		description: "NVIDIA Nemotron 70B Instruct (Free Trial) — Highly tuned for reasoning and coding.",
	},
	// SambaNova Free Tier Models
	"sambanova/Meta-Llama-3.3-70B-Instruct": {
		maxTokens: 8_192,
		contextWindow: 128_000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
		cacheWritesPrice: 0.0,
		cacheReadsPrice: 0.0,
		description: "SambaNova Llama 3.3 70B (Free Tier) — High-throughput SN40L cloud inference.",
	},
	"sambanova/DeepSeek-R1-Distill-Llama-70B": {
		maxTokens: 8_192,
		contextWindow: 128_000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
		cacheWritesPrice: 0.0,
		cacheReadsPrice: 0.0,
		description: "SambaNova DeepSeek R1 Distill 70B (Free Tier) — Fast reasoning on SambaNova cloud.",
	},
	// Google Gemini Free Tier Models
	"gemini/gemini-2.5-flash": {
		maxTokens: 65_536,
		contextWindow: 1_048_576,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 0.0,
		outputPrice: 0.0,
		cacheWritesPrice: 0.0,
		cacheReadsPrice: 0.0,
		description: "Google Gemini 2.5 Flash (Free Tier) — 1M token context, multimodal, free at ai.google.dev.",
	},
	"gemini/gemini-2.0-flash": {
		maxTokens: 8_192,
		contextWindow: 1_048_576,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 0.0,
		outputPrice: 0.0,
		cacheWritesPrice: 0.0,
		cacheReadsPrice: 0.0,
		description: "Google Gemini 2.0 Flash (Free Tier) — Fast multimodal 1M context free tier.",
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
		upstreamModelId: "poolside/laguna-s-2.1:free",
		contextWindow: 262_144,
		maxTokens: 32_768,
		enabled: true,
		description: "Purpose-built coding foundation model with 262k context",
	},
	// Groq models
	{
		id: "groq/llama-3.3-70b-versatile",
		name: "Groq: Llama 3.3 70B (Free)",
		provider: "groq",
		upstreamModelId: "llama-3.3-70b-versatile",
		contextWindow: 128_000,
		maxTokens: 32_768,
		enabled: true,
		description: "Groq ultra-fast LPU inference on Meta Llama 3.3 70B",
	},
	{
		id: "groq/deepseek-r1-distill-llama-70b",
		name: "Groq: DeepSeek R1 Distill 70B (Free)",
		provider: "groq",
		upstreamModelId: "deepseek-r1-distill-llama-70b",
		contextWindow: 128_000,
		maxTokens: 32_768,
		enabled: true,
		description: "Frontier reasoning model on Groq LPUs",
	},
	{
		id: "groq/llama-3.1-8b-instant",
		name: "Groq: Llama 3.1 8B (Free)",
		provider: "groq",
		upstreamModelId: "llama-3.1-8b-instant",
		contextWindow: 128_000,
		maxTokens: 8_192,
		enabled: true,
		description: "Instant responses on Groq for small edits and queries",
	},
	// Cerebras models
	{
		id: "cerebras/llama-3.3-70b",
		name: "Cerebras: Llama 3.3 70B (Free)",
		provider: "cerebras",
		upstreamModelId: "llama-3.3-70b",
		contextWindow: 128_000,
		maxTokens: 8_192,
		enabled: true,
		description: "Wafer-scale speed (~2000 tps) on Llama 3.3 70B",
	},
	{
		id: "cerebras/llama3.1-8b",
		name: "Cerebras: Llama 3.1 8B (Free)",
		provider: "cerebras",
		upstreamModelId: "llama3.1-8b",
		contextWindow: 128_000,
		maxTokens: 8_192,
		enabled: true,
		description: "Ultra-low latency wafer-scale inference",
	},
	// NVIDIA NIM models
	{
		id: "nvidia/meta/llama-3.3-70b-instruct",
		name: "NVIDIA: Llama 3.3 70B (Free Trial)",
		provider: "nvidia",
		upstreamModelId: "meta/llama-3.3-70b-instruct",
		contextWindow: 128_000,
		maxTokens: 32_768,
		enabled: true,
		description: "Meta flagship hosted on NVIDIA DGX Cloud free trial",
	},
	{
		id: "nvidia/deepseek-ai/deepseek-r1",
		name: "NVIDIA: DeepSeek R1 (Free Trial)",
		provider: "nvidia",
		upstreamModelId: "deepseek-ai/deepseek-r1",
		contextWindow: 128_000,
		maxTokens: 32_768,
		enabled: true,
		description: "Full 671B DeepSeek R1 reasoning on NVIDIA NIM",
	},
	{
		id: "nvidia/nvidia/llama-3.1-nemotron-70b-instruct",
		name: "NVIDIA: Nemotron 70B (Free Trial)",
		provider: "nvidia",
		upstreamModelId: "nvidia/llama-3.1-nemotron-70b-instruct",
		contextWindow: 128_000,
		maxTokens: 32_768,
		enabled: true,
		description: "NVIDIA Nemotron 70B tuned for reasoning and coding",
	},
	// SambaNova models
	{
		id: "sambanova/Meta-Llama-3.3-70B-Instruct",
		name: "SambaNova: Llama 3.3 70B (Free)",
		provider: "sambanova",
		upstreamModelId: "Meta-Llama-3.3-70B-Instruct",
		contextWindow: 128_000,
		maxTokens: 8_192,
		enabled: true,
		description: "High-throughput SN40L cloud inference on Llama 3.3 70B",
	},
	{
		id: "sambanova/DeepSeek-R1-Distill-Llama-70B",
		name: "SambaNova: DeepSeek R1 Distill (Free)",
		provider: "sambanova",
		upstreamModelId: "DeepSeek-R1-Distill-Llama-70B",
		contextWindow: 128_000,
		maxTokens: 8_192,
		enabled: true,
		description: "Fast reasoning on SambaNova cloud",
	},
	// Gemini models
	{
		id: "gemini/gemini-2.5-flash",
		name: "Google: Gemini 2.5 Flash (Free Tier)",
		provider: "gemini",
		upstreamModelId: "gemini-2.5-flash",
		contextWindow: 1_048_576,
		maxTokens: 65_536,
		enabled: true,
		description: "1M context multimodal reasoning from Google AI Studio",
	},
	{
		id: "gemini/gemini-2.0-flash",
		name: "Google: Gemini 2.0 Flash (Free Tier)",
		provider: "gemini",
		upstreamModelId: "gemini-2.0-flash",
		contextWindow: 1_048_576,
		maxTokens: 8_192,
		enabled: true,
		description: "Fast 1M context multimodal model from Google AI Studio",
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

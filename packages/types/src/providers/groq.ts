import type { ModelInfo } from "../model.js"

export type GroqModelId =
	| "llama-3.3-70b-versatile"
	| "llama-3.1-8b-instant"
	| "deepseek-r1-distill-llama-70b"
	| "qwen-qwq-32b"
	| "mixtral-8x7b-32768"

export const groqDefaultModelId: GroqModelId = "llama-3.3-70b-versatile"

export const groqModels: Record<GroqModelId, ModelInfo> = {
	"llama-3.3-70b-versatile": {
		maxTokens: 32768,
		contextWindow: 131072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
		description: "Meta Llama 3.3 70B on Groq LPUs with ultra-fast inference and 128K context window.",
	},
	"llama-3.1-8b-instant": {
		maxTokens: 8192,
		contextWindow: 131072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
		description: "Meta Llama 3.1 8B Instant on Groq with near-instantaneous token generation.",
	},
	"deepseek-r1-distill-llama-70b": {
		maxTokens: 8192,
		contextWindow: 131072,
		supportsImages: false,
		supportsPromptCache: false,
		preserveReasoning: true,
		inputPrice: 0.0,
		outputPrice: 0.0,
		description: "DeepSeek R1 Distill Llama 70B on Groq with high-speed chain-of-thought reasoning.",
	},
	"qwen-qwq-32b": {
		maxTokens: 8192,
		contextWindow: 131072,
		supportsImages: false,
		supportsPromptCache: false,
		preserveReasoning: true,
		inputPrice: 0.0,
		outputPrice: 0.0,
		description: "Qwen QwQ 32B reasoning model on Groq LPUs.",
	},
	"mixtral-8x7b-32768": {
		maxTokens: 32768,
		contextWindow: 32768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
		description: "Mistral Mixtral 8x7B MoE model on Groq with 32k context.",
	},
} as const satisfies Record<string, ModelInfo>

import type { ModelInfo } from "../model.js"

export type NvidiaModelId =
	| "meta/llama-3.3-70b-instruct"
	| "nvidia/llama-3.1-nemotron-70b-instruct"
	| "deepseek-ai/deepseek-r1"
	| "deepseek-ai/deepseek-v3"
	| "qwen/qwen2.5-coder-32b-instruct"
	| "mistralai/mistral-large-2-instruct"
	| "nvidia/nemotron-4-340b-instruct"

export const nvidiaDefaultModelId: NvidiaModelId = "meta/llama-3.3-70b-instruct"

export const nvidiaModels: Record<NvidiaModelId, ModelInfo> = {
	"meta/llama-3.3-70b-instruct": {
		maxTokens: 4096,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
		description: "Meta Llama 3.3 70B Instruct on NVIDIA NIM with 128k context window and free trial credits.",
	},
	"nvidia/llama-3.1-nemotron-70b-instruct": {
		maxTokens: 4096,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
		description: "NVIDIA Llama 3.1 Nemotron 70B Instruct fine-tuned for high accuracy reasoning and coding.",
	},
	"deepseek-ai/deepseek-r1": {
		maxTokens: 8192,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		preserveReasoning: true,
		inputPrice: 0.0,
		outputPrice: 0.0,
		description: "DeepSeek R1 reasoning model with full chain-of-thought capabilities hosted on NVIDIA NIM.",
	},
	"deepseek-ai/deepseek-v3": {
		maxTokens: 8192,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
		description: "DeepSeek V3 frontier model with 128k context on NVIDIA NIM.",
	},
	"qwen/qwen2.5-coder-32b-instruct": {
		maxTokens: 8192,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
		description: "Qwen 2.5 Coder 32B Instruct optimized for coding and refactoring on NVIDIA NIM.",
	},
	"mistralai/mistral-large-2-instruct": {
		maxTokens: 4096,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
		description: "Mistral Large 2 Instruct flagship model with 128k context on NVIDIA NIM.",
	},
	"nvidia/nemotron-4-340b-instruct": {
		maxTokens: 4096,
		contextWindow: 4096,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
		description: "NVIDIA Nemotron 4 340B Instruct large scale general-purpose model.",
	},
} as const satisfies Record<string, ModelInfo>

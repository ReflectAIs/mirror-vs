import type { ModelInfo } from "../model.js"

export type TogetherModelId =
	| "deepseek-ai/DeepSeek-R1"
	| "deepseek-ai/DeepSeek-V3"
	| "meta-llama/Llama-3.3-70B-Instruct-Turbo"
	| "Qwen/Qwen2.5-Coder-32B-Instruct"

export const togetherDefaultModelId: TogetherModelId = "deepseek-ai/DeepSeek-R1"

export const togetherModels: Record<TogetherModelId, ModelInfo> = {
	"deepseek-ai/DeepSeek-R1": {
		maxTokens: 8192,
		contextWindow: 131072,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.55,
		outputPrice: 2.19,
		description: "DeepSeek R1 full reasoning model hosted on Together AI's ultra-fast GPU cluster.",
	},
	"deepseek-ai/DeepSeek-V3": {
		maxTokens: 8192,
		contextWindow: 131072,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.45,
		outputPrice: 1.8,
		description: "DeepSeek V3 671B MoE model for high-efficiency code and instruction generation.",
	},
	"meta-llama/Llama-3.3-70B-Instruct-Turbo": {
		maxTokens: 8192,
		contextWindow: 131072,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.88,
		outputPrice: 0.88,
		description: "Meta Llama 3.3 70B Turbo with ultra-low latency inference on Together AI.",
	},
	"Qwen/Qwen2.5-Coder-32B-Instruct": {
		maxTokens: 8192,
		contextWindow: 32768,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.8,
		outputPrice: 0.8,
		description: "Alibaba Qwen 2.5 Coder 32B, fine-tuned for high-precision code synthesis.",
	},
} as const satisfies Record<string, ModelInfo>

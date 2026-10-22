import type { ModelInfo } from "../model.js"

export type HyperbolicModelId =
	| "deepseek-ai/DeepSeek-R1"
	| "deepseek-ai/DeepSeek-V3"
	| "meta-llama/Llama-3.3-70B-Instruct"
	| "Qwen/Qwen2.5-Coder-32B-Instruct"

export const hyperbolicDefaultModelId: HyperbolicModelId = "deepseek-ai/DeepSeek-R1"

export const hyperbolicModels: Record<HyperbolicModelId, ModelInfo> = {
	"deepseek-ai/DeepSeek-R1": {
		maxTokens: 8192,
		contextWindow: 131072,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.5,
		outputPrice: 2.0,
		description: "DeepSeek R1 on Hyperbolic's decentralized high-performance GPU cloud.",
	},
	"deepseek-ai/DeepSeek-V3": {
		maxTokens: 8192,
		contextWindow: 131072,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.4,
		outputPrice: 1.6,
		description: "DeepSeek V3 on Hyperbolic with high throughput and low token costs.",
	},
	"meta-llama/Llama-3.3-70B-Instruct": {
		maxTokens: 8192,
		contextWindow: 131072,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.6,
		outputPrice: 0.6,
		description: "Meta Llama 3.3 70B on Hyperbolic bare-metal GPU nodes.",
	},
	"Qwen/Qwen2.5-Coder-32B-Instruct": {
		maxTokens: 8192,
		contextWindow: 32768,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.7,
		outputPrice: 0.7,
		description: "Qwen 2.5 Coder 32B on Hyperbolic compute.",
	},
} as const satisfies Record<string, ModelInfo>

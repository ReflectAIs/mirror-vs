import type { ModelInfo } from "../model.js"

export type ScalewayModelId = "deepseek-r1" | "deepseek-v3" | "llama-3.3-70b-instruct"

export const scalewayDefaultModelId: ScalewayModelId = "deepseek-r1"

export const scalewayModels: Record<ScalewayModelId, ModelInfo> = {
	"deepseek-r1": {
		maxTokens: 8192,
		contextWindow: 128000,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.6,
		outputPrice: 2.4,
		description: "DeepSeek R1 hosted on European sovereign cloud infrastructure.",
	},
	"deepseek-v3": {
		maxTokens: 8192,
		contextWindow: 128000,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.45,
		outputPrice: 1.8,
		description: "DeepSeek V3 on Scaleway compute.",
	},
	"llama-3.3-70b-instruct": {
		maxTokens: 8192,
		contextWindow: 128000,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.6,
		outputPrice: 0.6,
		description: "Meta Llama 3.3 70B hosted in Europe by Scaleway.",
	},
} as const satisfies Record<string, ModelInfo>

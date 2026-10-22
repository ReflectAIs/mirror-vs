import type { ModelInfo } from "../model.js"

export type NebiusModelId =
	| "deepseek-ai/DeepSeek-R1"
	| "deepseek-ai/DeepSeek-V3"
	| "meta-llama/Meta-Llama-3.1-70B-Instruct"

export const nebiusDefaultModelId: NebiusModelId = "deepseek-ai/DeepSeek-R1"

export const nebiusModels: Record<NebiusModelId, ModelInfo> = {
	"deepseek-ai/DeepSeek-R1": {
		maxTokens: 8192,
		contextWindow: 131072,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.5,
		outputPrice: 2.0,
		description: "DeepSeek R1 full reasoning model on Nebius AI Studio GPU cloud.",
	},
	"deepseek-ai/DeepSeek-V3": {
		maxTokens: 8192,
		contextWindow: 131072,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.4,
		outputPrice: 1.6,
		description: "DeepSeek V3 on Nebius AI Studio.",
	},
	"meta-llama/Meta-Llama-3.1-70B-Instruct": {
		maxTokens: 8192,
		contextWindow: 131072,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.5,
		outputPrice: 0.5,
		description: "Meta Llama 3.1 70B on Nebius AI Studio.",
	},
} as const satisfies Record<string, ModelInfo>

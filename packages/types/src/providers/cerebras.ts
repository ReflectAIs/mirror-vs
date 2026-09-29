import type { ModelInfo } from "../model.js"

export type CerebrasModelId = "llama3.3-70b" | "llama3.1-8b"

export const cerebrasDefaultModelId: CerebrasModelId = "llama3.3-70b"

export const cerebrasModels: Record<CerebrasModelId, ModelInfo> = {
	"llama3.3-70b": {
		maxTokens: 8192,
		contextWindow: 131072,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
		description: "Meta Llama 3.3 70B on Cerebras CS-3 Wafer-Scale Engine with world-record inference speeds.",
	},
	"llama3.1-8b": {
		maxTokens: 8192,
		contextWindow: 8192,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0,
		outputPrice: 0.0,
		description: "Meta Llama 3.1 8B on Cerebras with ultra-fast speed.",
	},
} as const satisfies Record<string, ModelInfo>

import type { ModelInfo } from "../model.js"

export type YiModelId = "yi-lightning" | "yi-large" | "yi-medium"

export const yiDefaultModelId: YiModelId = "yi-lightning"

export const yiModels: Record<YiModelId, ModelInfo> = {
	"yi-lightning": {
		maxTokens: 8192,
		contextWindow: 16384,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.14,
		outputPrice: 0.14,
		description: "01.AI's ultra-fast, high-intelligence Yi-Lightning model.",
	},
	"yi-large": {
		maxTokens: 4096,
		contextWindow: 32768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 3.0,
		outputPrice: 3.0,
		description: "Top-tier bilingual reasoning and knowledge from 01.AI.",
	},
	"yi-medium": {
		maxTokens: 4096,
		contextWindow: 16384,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.35,
		outputPrice: 0.35,
		description: "Balanced general-purpose chat model.",
	},
} as const satisfies Record<string, ModelInfo>

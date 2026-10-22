import type { ModelInfo } from "../model.js"

export type PerplexityModelId = "sonar-pro" | "sonar" | "sonar-reasoning-pro" | "sonar-reasoning"

export const perplexityDefaultModelId: PerplexityModelId = "sonar-pro"

export const perplexityModels: Record<PerplexityModelId, ModelInfo> = {
	"sonar-pro": {
		maxTokens: 8192,
		contextWindow: 200000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 3.0,
		outputPrice: 15.0,
		description: "Perplexity's flagship search & grounded reasoning model.",
	},
	sonar: {
		maxTokens: 8192,
		contextWindow: 128000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 1.0,
		outputPrice: 1.0,
		description: "Fast, search-augmented chat model.",
	},
	"sonar-reasoning-pro": {
		maxTokens: 8192,
		contextWindow: 128000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 2.0,
		outputPrice: 8.0,
		description: "Deep research and mathematical chain-of-thought model.",
	},
	"sonar-reasoning": {
		maxTokens: 8192,
		contextWindow: 128000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 1.0,
		outputPrice: 5.0,
		description: "Fast search reasoning model.",
	},
} as const satisfies Record<string, ModelInfo>

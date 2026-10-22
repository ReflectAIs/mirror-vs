import type { ModelInfo } from "../model.js"

export type CohereModelId = "command-r-plus-08-2024" | "command-r-08-2024" | "command-r7b-12-2024"

export const cohereDefaultModelId: CohereModelId = "command-r-plus-08-2024"

export const cohereModels: Record<CohereModelId, ModelInfo> = {
	"command-r-plus-08-2024": {
		maxTokens: 4096,
		contextWindow: 128000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 2.5,
		outputPrice: 10.0,
		description: "Cohere's flagship model for complex enterprise reasoning and tool use.",
	},
	"command-r-08-2024": {
		maxTokens: 4096,
		contextWindow: 128000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.15,
		outputPrice: 0.6,
		description: "Cost-effective, highly scalable enterprise reasoning model.",
	},
	"command-r7b-12-2024": {
		maxTokens: 4096,
		contextWindow: 128000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.0375,
		outputPrice: 0.15,
		description: "Ultra-fast, small footprint reasoning model.",
	},
} as const satisfies Record<string, ModelInfo>

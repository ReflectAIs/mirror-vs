import type { ModelInfo } from "../model.js"

export type UpstageModelId = "solar-pro" | "solar-mini"

export const upstageDefaultModelId: UpstageModelId = "solar-pro"

export const upstageModels: Record<UpstageModelId, ModelInfo> = {
	"solar-pro": {
		maxTokens: 4096,
		contextWindow: 65536,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.25,
		outputPrice: 0.25,
		description: "Upstage's flagship Solar Pro model for agentic workflows.",
	},
	"solar-mini": {
		maxTokens: 4096,
		contextWindow: 32768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.15,
		outputPrice: 0.15,
		description: "Lightweight, high-speed Solar model for rapid code and reasoning.",
	},
} as const satisfies Record<string, ModelInfo>

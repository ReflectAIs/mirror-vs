import type { ModelInfo } from "../model.js"

export type RelaceModelId =
	| "deepseek-ai/DeepSeek-V4.1-Flash"
	| "deepseek-ai/DeepSeek-V4.1-Flash-1017"
	| "deepseek-ai/DeepSeek-V4-Flash-0731"
	| "deepseek-ai/DeepSeek-V4-Flash-0423"
	| "deepseek-ai/DeepSeek-V4-Pro"
	| "deepseek-ai/DeepSeek-V4-Pro-0813"
	| "relace-apply-3"
	| "relace-search"
	| "moonshotai/kimi-k3"
	| "z-ai/glm-5.3"
	| "z-ai/glm-5.3-flash"
	| "z-ai/glm-5.2"
	| "xiaomi/mimo-v2.6-flash"

export const relaceDefaultModelId: RelaceModelId = "deepseek-ai/DeepSeek-V4.1-Flash"

export const relaceModels: Record<RelaceModelId, ModelInfo> = {
	"deepseek-ai/DeepSeek-V4.1-Flash": {
		maxTokens: 131072,
		contextWindow: 1048576,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 0.2,
		outputPrice: 0.6,
		cacheReadsPrice: 0.008,
		supportsReasoningBinary: true,
		description: "DeepSeek V4.1 Flash MoE with 1M context, Engram memory, fast tool use, and reasoning.",
	},
	"deepseek-ai/DeepSeek-V4.1-Flash-1017": {
		maxTokens: 131072,
		contextWindow: 1048576,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 0.2,
		outputPrice: 0.6,
		cacheReadsPrice: 0.008,
		supportsReasoningBinary: true,
		description: "October update of DeepSeek V4.1 Flash with enhanced coding and reasoning capabilities.",
	},
	"deepseek-ai/DeepSeek-V4-Flash-0731": {
		maxTokens: 131072,
		contextWindow: 1048576,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 0.2,
		outputPrice: 0.6,
		cacheReadsPrice: 0.008,
		supportsReasoningBinary: true,
		description: "DeepSeek V4 Flash 0731 high-throughput coding and reasoning model on Relace infrastructure.",
	},
	"deepseek-ai/DeepSeek-V4-Flash-0423": {
		maxTokens: 131072,
		contextWindow: 1048576,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 0.2,
		outputPrice: 0.6,
		cacheReadsPrice: 0.008,
		supportsReasoningBinary: true,
		description: "DeepSeek V4 Flash 0423 checkpoint.",
	},
	"deepseek-ai/DeepSeek-V4-Pro": {
		maxTokens: 131072,
		contextWindow: 1048576,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 0.75,
		outputPrice: 2.4,
		cacheReadsPrice: 0.075,
		supportsReasoningBinary: true,
		description: "DeepSeek V4 Pro flagship reasoning and coding model with 1M context window.",
	},
	"deepseek-ai/DeepSeek-V4-Pro-0813": {
		maxTokens: 131072,
		contextWindow: 1048576,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 0.75,
		outputPrice: 2.4,
		cacheReadsPrice: 0.075,
		supportsReasoningBinary: true,
		description: "DeepSeek V4 Pro 0813 checkpoint.",
	},
	"relace-apply-3": {
		maxTokens: 8192,
		contextWindow: 128000,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.15,
		outputPrice: 0.6,
		description:
			"Relace's specialized code-merging and instant apply engine. Ultra-fast code edits and diff patching.",
	},
	"relace-search": {
		maxTokens: 8192,
		contextWindow: 128000,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.2,
		outputPrice: 0.8,
		description: "Relace agentic search model optimized for multi-file codebase navigation and tool calls.",
	},
	"moonshotai/kimi-k3": {
		maxTokens: 131072,
		contextWindow: 1048576,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.4,
		outputPrice: 4.0,
		cacheReadsPrice: 0.08,
		description: "MoonshotAI Kimi K3 1M-context reasoning model.",
	},
	"z-ai/glm-5.3": {
		maxTokens: 131072,
		contextWindow: 1048576,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.75,
		outputPrice: 2.4,
		cacheReadsPrice: 0.075,
		description: "Z.ai GLM 5.3 744B MoE flagship model with 1M context.",
	},
	"z-ai/glm-5.3-flash": {
		maxTokens: 131072,
		contextWindow: 1048576,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 0.075,
		outputPrice: 0.5,
		cacheReadsPrice: 0.0075,
		description: "Z.ai GLM 5.3 Flash hybrid-linear attention model with 1M context.",
	},
	"z-ai/glm-5.2": {
		maxTokens: 131072,
		contextWindow: 1048576,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.5,
		outputPrice: 1.8,
		cacheReadsPrice: 0.05,
		description: "Z.ai GLM 5.2 reasoning and coding model.",
	},
	"xiaomi/mimo-v2.6-flash": {
		maxTokens: 131072,
		contextWindow: 1048576,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 0.14,
		outputPrice: 0.14,
		cacheReadsPrice: 0.014,
		description: "Xiaomi MiMo-V2.6-Flash open-source MoE with 1M context.",
	},
} as const satisfies Record<string, ModelInfo>

import type { ModelInfo } from "../model.js"

// https://platform.deepseek.com/docs/api
// preserveReasoning enables interleaved thinking mode for tool calls:
// DeepSeek requires reasoning_content to be passed back during tool call
// continuation within the same turn. See: https://api-docs.deepseek.com/guides/thinking_mode
export type DeepSeekModelId = keyof typeof deepSeekModels

export const deepSeekDefaultModelId: DeepSeekModelId = "deepseek-v4-flash"

export const deepSeekModels = {
	"deepseek-chat": {
		maxTokens: 8192, // 8K max output
		contextWindow: 128_000,
		supportsImages: false,
		supportsPromptCache: true,
		supportsReasoningEffort: true,
		inputPrice: 0.28,
		outputPrice: 0.42,
		cacheWritesPrice: 0.28,
		cacheReadsPrice: 0.028,
		deprecated: true,
		description: `[DEPRECATED] DeepSeek-V3.2 (Non-thinking Mode).`,
	},
	"deepseek-reasoner": {
		maxTokens: 8192, // 8K max output
		contextWindow: 128_000,
		supportsImages: false,
		supportsPromptCache: true,
		supportsReasoningEffort: true,
		supportsReasoningBudget: true,
		preserveReasoning: true,
		inputPrice: 0.28,
		outputPrice: 0.42,
		cacheWritesPrice: 0.28,
		cacheReadsPrice: 0.028,
		deprecated: true,
		description: `[DEPRECATED] DeepSeek-R1 (Thinking Mode).`,
	},
	"deepseek-v3": {
		maxTokens: 8192,
		contextWindow: 128_000,
		supportsImages: false,
		supportsPromptCache: true,
		supportsReasoningEffort: true,
		inputPrice: 0.14,
		outputPrice: 0.28,
		cacheWritesPrice: 0.14,
		cacheReadsPrice: 0.014,
		description: `DeepSeek-V3 delivers next-generation intelligence and inference speed, topping open-source benchmarks.`,
	},
	"deepseek-r1": {
		maxTokens: 8192,
		contextWindow: 128_000,
		supportsImages: false,
		supportsPromptCache: true,
		supportsReasoningEffort: true,
		supportsReasoningBudget: true,
		preserveReasoning: true,
		inputPrice: 0.14,
		outputPrice: 0.28,
		cacheWritesPrice: 0.14,
		cacheReadsPrice: 0.014,
		description: `DeepSeek-R1 achieves OpenAI-o1-level performance across math, code, and complex reasoning tasks with full thinking output.`,
	},
	"deepseek-v4-flash": {
		maxTokens: 8192, // 8K max output
		contextWindow: 128_000,
		supportsImages: false,
		supportsPromptCache: true,
		supportsReasoningEffort: true,
		supportsReasoningBudget: true,
		inputPrice: 0.14,
		outputPrice: 0.28,
		cacheWritesPrice: 0.14,
		cacheReadsPrice: 0.014,
		description: `DeepSeek-V4 Flash delivers high-speed inference and thinking capabilities, optimized for low-latency coding and interactive agentic tasks.`,
	},
} as const satisfies Record<string, ModelInfo>

// https://api-docs.deepseek.com/quick_start/parameter_settings
export const DEEP_SEEK_DEFAULT_TEMPERATURE = 0.3

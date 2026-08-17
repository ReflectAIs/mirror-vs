import type { ModelInfo } from "../model.js"

// DeepInfra
// Anthropic-compatible API: https://api.deepinfra.com/anthropic
// https://deepinfra.com
// https://deepinfra.com/pricing
export type DeepInfraModelId = keyof typeof deepInfraModels
export const deepInfraDefaultModelId: DeepInfraModelId = "deepseek-ai/DeepSeek-V3.1"

export const deepInfraModels = {
	"deepseek-ai/DeepSeek-V3.1": {
		maxTokens: 16_384,
		contextWindow: 163_840,
		supportsImages: false,
		supportsPromptCache: true,
		preserveReasoning: true,
		inputPrice: 0.27,
		outputPrice: 1.0,
		cacheWritesPrice: 0.27,
		cacheReadsPrice: 0.04,
		description:
			"DeepSeek V3.1, a strong general-purpose open-weight model with hybrid inference (standard + deep thinking). See pricing at https://deepinfra.com/deepseek-ai/DeepSeek-V3.1.",
	},
	"deepseek-ai/DeepSeek-V3.1-Terminus": {
		maxTokens: 16_384,
		contextWindow: 163_840,
		supportsImages: false,
		supportsPromptCache: true,
		preserveReasoning: true,
		inputPrice: 0.27,
		outputPrice: 1.0,
		cacheWritesPrice: 0.27,
		cacheReadsPrice: 0.04,
		description:
			"DeepSeek V3.1 Terminus, the coding-tuned variant of DeepSeek V3.1 recommended for agentic coding workloads. See pricing at https://deepinfra.com/deepseek-ai/DeepSeek-V3.1-Terminus.",
	},
	"deepseek-ai/DeepSeek-R1": {
		maxTokens: 16_384,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: true,
		preserveReasoning: true,
		supportsReasoningBudget: true,
		inputPrice: 2.5,
		outputPrice: 7.5,
		cacheWritesPrice: 2.5,
		cacheReadsPrice: 0.38,
		description:
			"DeepSeek R1, a reasoning model with visible chain-of-thought. See pricing at https://deepinfra.com/deepseek-ai/DeepSeek-R1.",
	},
	"Qwen/Qwen3-Coder-480B-A35B-Instruct": {
		maxTokens: 65_536,
		contextWindow: 262_144,
		supportsImages: false,
		supportsPromptCache: true,
		preserveReasoning: true,
		inputPrice: 0.35,
		outputPrice: 1.8,
		cacheWritesPrice: 0.35,
		cacheReadsPrice: 0.05,
		description:
			"Qwen3 Coder 480B A35B, Qwen's most agentic open-weight coding model with coding, browser-use and agentic capability comparable to leading closed models. See pricing at https://deepinfra.com/Qwen/Qwen3-Coder-480B-A35B-Instruct.",
	},
	"Qwen/Qwen3-Coder-480B-A35B-Instruct-Turbo": {
		maxTokens: 65_536,
		contextWindow: 262_144,
		supportsImages: false,
		supportsPromptCache: true,
		preserveReasoning: true,
		inputPrice: 0.35,
		outputPrice: 1.8,
		cacheWritesPrice: 0.35,
		cacheReadsPrice: 0.05,
		description:
			"Qwen3 Coder 480B A35B Turbo, the high-throughput fast variant of Qwen3 Coder. See pricing at https://deepinfra.com/Qwen/Qwen3-Coder-480B-A35B-Instruct-Turbo.",
	},
	"Qwen/Qwen2.5-Coder-32B-Instruct": {
		maxTokens: 8192,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.1,
		outputPrice: 0.2,
		cacheWritesPrice: 0.1,
		cacheReadsPrice: 0.015,
		description:
			"Qwen 2.5 Coder 32B, an affordable and capable coding model. See pricing at https://deepinfra.com/Qwen/Qwen2.5-Coder-32B-Instruct.",
	},
	"Qwen/Qwen3-30B-A3B-Instruct": {
		maxTokens: 16_384,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.08,
		outputPrice: 0.16,
		cacheWritesPrice: 0.08,
		cacheReadsPrice: 0.012,
		description:
			"Qwen3 30B A3B, a small, fast MoE model well-suited for lightweight background tasks. See pricing at https://deepinfra.com/Qwen/Qwen3-30B-A3B-Instruct.",
	},
	"meta-llama/Llama-3.3-70B-Instruct": {
		maxTokens: 8192,
		contextWindow: 131_072,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.6,
		outputPrice: 1.2,
		cacheWritesPrice: 0.6,
		cacheReadsPrice: 0.09,
		description:
			"Meta Llama 3.3 70B Instruct, a strong general-purpose open model. See pricing at https://deepinfra.com/meta-llama/Llama-3.3-70B-Instruct.",
	},
	"meta-llama/Llama-4-Maverick-17B-128E-Instruct": {
		maxTokens: 8192,
		contextWindow: 131_072,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 0.63,
		outputPrice: 1.8,
		cacheWritesPrice: 0.63,
		cacheReadsPrice: 0.09,
		description:
			"Meta Llama 4 Maverick 17B 128E, a multimodal open model. See pricing at https://deepinfra.com/meta-llama/Llama-4-Maverick-17B-128E-Instruct.",
	},
	"mistralai/Mistral-Small-3.1-24B-Instruct-2503": {
		maxTokens: 8192,
		contextWindow: 32_768,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.1,
		outputPrice: 0.2,
		cacheWritesPrice: 0.1,
		cacheReadsPrice: 0.015,
		description:
			"Mistral Small 3.1 24B, a compact and fast general-purpose model. See pricing at https://deepinfra.com/mistralai/Mistral-Small-3.1-24B-Instruct-2503.",
	},
} as const satisfies Record<string, ModelInfo>

export const deepInfraDefaultModelInfo: ModelInfo = deepInfraModels[deepInfraDefaultModelId]

export const DEEPINFRA_DEFAULT_MAX_TOKENS = 16_384
export const DEEPINFRA_DEFAULT_TEMPERATURE = 1.0

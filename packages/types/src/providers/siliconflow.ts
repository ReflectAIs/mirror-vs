import type { ModelInfo } from "../model.js"

export type SiliconFlowModelId =
	| "deepseek-ai/DeepSeek-R1"
	| "deepseek-ai/DeepSeek-V3"
	| "Qwen/Qwen2.5-Coder-32B-Instruct"

export const siliconFlowDefaultModelId: SiliconFlowModelId = "deepseek-ai/DeepSeek-R1"

export const siliconFlowModels: Record<SiliconFlowModelId, ModelInfo> = {
	"deepseek-ai/DeepSeek-R1": {
		maxTokens: 8192,
		contextWindow: 65536,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.55,
		outputPrice: 2.19,
		description: "DeepSeek R1 full reasoning hosted on SiliconFlow high-speed clusters.",
	},
	"deepseek-ai/DeepSeek-V3": {
		maxTokens: 8192,
		contextWindow: 65536,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.28,
		outputPrice: 1.12,
		description: "DeepSeek V3 671B MoE model on SiliconFlow.",
	},
	"Qwen/Qwen2.5-Coder-32B-Instruct": {
		maxTokens: 8192,
		contextWindow: 32768,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.35,
		outputPrice: 0.35,
		description: "Qwen 2.5 Coder 32B for efficient code generation.",
	},
} as const satisfies Record<string, ModelInfo>

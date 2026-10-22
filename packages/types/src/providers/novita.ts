import type { ModelInfo } from "../model.js"

export type NovitaModelId =
	| "deepseek/deepseek-r1"
	| "deepseek/deepseek-v3"
	| "meta-llama/llama-3.3-70b-instruct"
	| "qwen/qwen-2.5-coder-32b-instruct"

export const novitaDefaultModelId: NovitaModelId = "deepseek/deepseek-r1"

export const novitaModels: Record<NovitaModelId, ModelInfo> = {
	"deepseek/deepseek-r1": {
		maxTokens: 8192,
		contextWindow: 128000,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.5,
		outputPrice: 2.0,
		description: "DeepSeek R1 full reasoning hosted on Novita AI's high-speed GPU cloud.",
	},
	"deepseek/deepseek-v3": {
		maxTokens: 8192,
		contextWindow: 128000,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.4,
		outputPrice: 1.6,
		description: "DeepSeek V3 671B MoE on Novita AI with high throughput.",
	},
	"meta-llama/llama-3.3-70b-instruct": {
		maxTokens: 8192,
		contextWindow: 128000,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.6,
		outputPrice: 0.6,
		description: "Meta Llama 3.3 70B on Novita AI.",
	},
	"qwen/qwen-2.5-coder-32b-instruct": {
		maxTokens: 8192,
		contextWindow: 32768,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.5,
		outputPrice: 0.5,
		description: "Qwen 2.5 Coder 32B fine-tuned for code synthesis.",
	},
} as const satisfies Record<string, ModelInfo>

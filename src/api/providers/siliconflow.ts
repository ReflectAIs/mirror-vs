import { type SiliconFlowModelId, siliconFlowDefaultModelId, siliconFlowModels } from "@mirror-vs/types"

import type { ApiHandlerOptions } from "../../shared/api"

import { BaseOpenAiCompatibleProvider } from "./base-openai-compatible-provider"

export class SiliconFlowHandler extends BaseOpenAiCompatibleProvider<SiliconFlowModelId> {
	constructor(options: ApiHandlerOptions) {
		super({
			...options,
			providerName: "SiliconFlow",
			baseURL: "https://api.siliconflow.cn/v1",
			apiKey: options.siliconFlowApiKey,
			defaultProviderModelId: siliconFlowDefaultModelId,
			providerModels: siliconFlowModels,
			defaultTemperature: 0.7,
		})
	}
}

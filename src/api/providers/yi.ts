import { type YiModelId, yiDefaultModelId, yiModels } from "@mirror-vs/types"

import type { ApiHandlerOptions } from "../../shared/api"

import { BaseOpenAiCompatibleProvider } from "./base-openai-compatible-provider"

export class YiHandler extends BaseOpenAiCompatibleProvider<YiModelId> {
	constructor(options: ApiHandlerOptions) {
		super({
			...options,
			providerName: "01.AI (Yi)",
			baseURL: "https://api.01.ai/v1",
			apiKey: options.yiApiKey,
			defaultProviderModelId: yiDefaultModelId,
			providerModels: yiModels,
			defaultTemperature: 0.6,
		})
	}
}

import { type CerebrasModelId, cerebrasDefaultModelId, cerebrasModels } from "@mirror-vs/types"

import type { ApiHandlerOptions } from "../../shared/api"

import { BaseOpenAiCompatibleProvider } from "./base-openai-compatible-provider"

export class CerebrasHandler extends BaseOpenAiCompatibleProvider<CerebrasModelId> {
	constructor(options: ApiHandlerOptions) {
		super({
			...options,
			providerName: "Cerebras",
			baseURL: "https://api.cerebras.ai/v1",
			apiKey: options.cerebrasApiKey,
			defaultProviderModelId: cerebrasDefaultModelId,
			providerModels: cerebrasModels,
			defaultTemperature: 0.7,
		})
	}
}

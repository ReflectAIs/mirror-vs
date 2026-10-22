import { type CohereModelId, cohereDefaultModelId, cohereModels } from "@mirror-vs/types"

import type { ApiHandlerOptions } from "../../shared/api"

import { BaseOpenAiCompatibleProvider } from "./base-openai-compatible-provider"

export class CohereHandler extends BaseOpenAiCompatibleProvider<CohereModelId> {
	constructor(options: ApiHandlerOptions) {
		super({
			...options,
			providerName: "Cohere",
			baseURL: "https://api.cohere.com/v2",
			apiKey: options.cohereApiKey,
			defaultProviderModelId: cohereDefaultModelId,
			providerModels: cohereModels,
			defaultTemperature: 0.3,
		})
	}
}

import { type NovitaModelId, novitaDefaultModelId, novitaModels } from "@mirror-vs/types"

import type { ApiHandlerOptions } from "../../shared/api"

import { BaseOpenAiCompatibleProvider } from "./base-openai-compatible-provider"

export class NovitaHandler extends BaseOpenAiCompatibleProvider<NovitaModelId> {
	constructor(options: ApiHandlerOptions) {
		super({
			...options,
			providerName: "Novita AI",
			baseURL: "https://api.novita.ai/v3/openai",
			apiKey: options.novitaApiKey,
			defaultProviderModelId: novitaDefaultModelId,
			providerModels: novitaModels,
			defaultTemperature: 0.7,
		})
	}
}

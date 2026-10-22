import { type RelaceModelId, relaceDefaultModelId, relaceModels } from "@mirror-vs/types"

import type { ApiHandlerOptions } from "../../shared/api"

import { BaseOpenAiCompatibleProvider } from "./base-openai-compatible-provider"

export class RelaceHandler extends BaseOpenAiCompatibleProvider<RelaceModelId> {
	constructor(options: ApiHandlerOptions) {
		super({
			...options,
			providerName: "Relace",
			baseURL: options.relaceBaseUrl || "https://models.relace.ai/v1",
			apiKey: options.relaceApiKey,
			defaultProviderModelId: relaceDefaultModelId,
			providerModels: relaceModels,
			defaultTemperature: 0.2,
		})
	}
}

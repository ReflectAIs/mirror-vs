import { type TogetherModelId, togetherDefaultModelId, togetherModels } from "@mirror-vs/types"

import type { ApiHandlerOptions } from "../../shared/api"

import { BaseOpenAiCompatibleProvider } from "./base-openai-compatible-provider"

export class TogetherHandler extends BaseOpenAiCompatibleProvider<TogetherModelId> {
	constructor(options: ApiHandlerOptions) {
		super({
			...options,
			providerName: "Together AI",
			baseURL: "https://api.together.xyz/v1",
			apiKey: options.togetherApiKey,
			defaultProviderModelId: togetherDefaultModelId,
			providerModels: togetherModels,
			defaultTemperature: 0.7,
		})
	}
}

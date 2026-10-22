import { type HyperbolicModelId, hyperbolicDefaultModelId, hyperbolicModels } from "@mirror-vs/types"

import type { ApiHandlerOptions } from "../../shared/api"

import { BaseOpenAiCompatibleProvider } from "./base-openai-compatible-provider"

export class HyperbolicHandler extends BaseOpenAiCompatibleProvider<HyperbolicModelId> {
	constructor(options: ApiHandlerOptions) {
		super({
			...options,
			providerName: "Hyperbolic",
			baseURL: "https://api.hyperbolic.xyz/v1",
			apiKey: options.hyperbolicApiKey,
			defaultProviderModelId: hyperbolicDefaultModelId,
			providerModels: hyperbolicModels,
			defaultTemperature: 0.7,
		})
	}
}

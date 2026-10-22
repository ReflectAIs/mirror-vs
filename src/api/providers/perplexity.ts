import { type PerplexityModelId, perplexityDefaultModelId, perplexityModels } from "@mirror-vs/types"

import type { ApiHandlerOptions } from "../../shared/api"

import { BaseOpenAiCompatibleProvider } from "./base-openai-compatible-provider"

export class PerplexityHandler extends BaseOpenAiCompatibleProvider<PerplexityModelId> {
	constructor(options: ApiHandlerOptions) {
		super({
			...options,
			providerName: "Perplexity",
			baseURL: "https://api.perplexity.ai",
			apiKey: options.perplexityApiKey,
			defaultProviderModelId: perplexityDefaultModelId,
			providerModels: perplexityModels,
			defaultTemperature: 0.2,
		})
	}
}

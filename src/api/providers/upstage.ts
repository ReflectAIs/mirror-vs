import { type UpstageModelId, upstageDefaultModelId, upstageModels } from "@mirror-vs/types"

import type { ApiHandlerOptions } from "../../shared/api"

import { BaseOpenAiCompatibleProvider } from "./base-openai-compatible-provider"

export class UpstageHandler extends BaseOpenAiCompatibleProvider<UpstageModelId> {
	constructor(options: ApiHandlerOptions) {
		super({
			...options,
			providerName: "Upstage Solar",
			baseURL: "https://api.upstage.ai/v1/solar",
			apiKey: options.upstageApiKey,
			defaultProviderModelId: upstageDefaultModelId,
			providerModels: upstageModels,
			defaultTemperature: 0.6,
		})
	}
}

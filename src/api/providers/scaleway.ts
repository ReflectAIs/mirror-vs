import { type ScalewayModelId, scalewayDefaultModelId, scalewayModels } from "@mirror-vs/types"

import type { ApiHandlerOptions } from "../../shared/api"

import { BaseOpenAiCompatibleProvider } from "./base-openai-compatible-provider"

export class ScalewayHandler extends BaseOpenAiCompatibleProvider<ScalewayModelId> {
	constructor(options: ApiHandlerOptions) {
		super({
			...options,
			providerName: "Scaleway",
			baseURL: "https://api.scaleway.ai/v1",
			apiKey: options.scalewayApiKey,
			defaultProviderModelId: scalewayDefaultModelId,
			providerModels: scalewayModels,
			defaultTemperature: 0.7,
		})
	}
}

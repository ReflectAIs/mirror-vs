import { type NebiusModelId, nebiusDefaultModelId, nebiusModels } from "@mirror-vs/types"

import type { ApiHandlerOptions } from "../../shared/api"

import { BaseOpenAiCompatibleProvider } from "./base-openai-compatible-provider"

export class NebiusHandler extends BaseOpenAiCompatibleProvider<NebiusModelId> {
	constructor(options: ApiHandlerOptions) {
		super({
			...options,
			providerName: "Nebius AI Studio",
			baseURL: "https://api.studio.nebius.ai/v1",
			apiKey: options.nebiusApiKey,
			defaultProviderModelId: nebiusDefaultModelId,
			providerModels: nebiusModels,
			defaultTemperature: 0.7,
		})
	}
}

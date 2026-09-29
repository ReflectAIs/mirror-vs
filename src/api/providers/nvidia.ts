import { type NvidiaModelId, nvidiaDefaultModelId, nvidiaModels } from "@mirror-vs/types"

import type { ApiHandlerOptions } from "../../shared/api"

import { BaseOpenAiCompatibleProvider } from "./base-openai-compatible-provider"

export class NvidiaHandler extends BaseOpenAiCompatibleProvider<NvidiaModelId> {
	constructor(options: ApiHandlerOptions) {
		super({
			...options,
			providerName: "NVIDIA",
			baseURL: "https://integrate.api.nvidia.com/v1",
			apiKey: options.nvidiaApiKey,
			defaultProviderModelId: nvidiaDefaultModelId,
			providerModels: nvidiaModels,
			defaultTemperature: 0.2,
		})
	}
}

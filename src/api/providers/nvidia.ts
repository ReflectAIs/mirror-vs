import { Anthropic } from "@anthropic-ai/sdk"
import { type NvidiaModelId, nvidiaDefaultModelId, nvidiaModels } from "@mirror-vs/types"

import type { ApiHandlerOptions } from "../../shared/api"
import type { ApiHandlerCreateMessageMetadata } from "../index"
import { ApiStream } from "../transform/stream"

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

	override async *createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		try {
			yield* super.createMessage(systemPrompt, messages, metadata)
		} catch (err: any) {
			const status = err?.status ?? err?.statusCode ?? err?.code
			const msg = String(err?.message || "")
			if (status === 410 || status === "410" || msg.includes("410")) {
				const enriched = new Error(
					`NVIDIA NIM API Error (410 Gone): Your NVIDIA developer account lacks "Public API Endpoints" permission. ` +
						`Please verify your account at https://build.nvidia.com or request enablement on https://forums.developer.nvidia.com (Access/Accounts), ` +
						`or use Groq, Cerebras, SambaNova, Google Gemini, or the Free Auto-Router.`,
				)
				;(enriched as any).status = 410
				throw enriched
			}
			throw err
		}
	}
}

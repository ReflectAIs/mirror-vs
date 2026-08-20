import axios from "axios"

import type { ModelRecord, ModelInfo } from "@mirror-vs/types"
import { fireworksModels } from "@mirror-vs/types"

import { DEFAULT_HEADERS } from "../constants"

/**
 * Fetches available models dynamically from Fireworks AI.
 * Falls back to built-in fireworksModels if API call fails or apiKey is absent.
 *
 * @param apiKey The Fireworks API key
 * @returns A promise that resolves to a record of model IDs to ModelInfo
 */
export async function getFireworksModels(apiKey?: string): Promise<ModelRecord> {
	const models: ModelRecord = { ...fireworksModels }

	if (!apiKey) {
		return models
	}

	try {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
			...DEFAULT_HEADERS,
		}

		const response = await axios.get("https://api.fireworks.ai/inference/v1/models", {
			headers,
			timeout: 7000,
		})

		if (response.data && Array.isArray(response.data.data)) {
			for (const item of response.data.data) {
				const modelId = item.id
				if (!modelId || typeof modelId !== "string") continue

				const existing = fireworksModels[modelId as keyof typeof fireworksModels] as ModelInfo | undefined

				const contextLength =
					item.context_length ||
					(item.architecture?.context_length ? Number(item.architecture.context_length) : undefined) ||
					existing?.contextWindow ||
					128000

				const maxTokens =
					item.max_output_tokens ||
					item.max_tokens ||
					existing?.maxTokens ||
					(contextLength >= 200000 ? 32768 : 16384)

				const supportsImages =
					existing?.supportsImages ??
					(modelId.includes("vision") ||
						modelId.includes("vl") ||
						modelId.includes("kimi-k2p5") ||
						modelId.includes("llama4") ||
						modelId.includes("qwen-vl") ||
						Boolean(item.supports_vision))

				const isThinking =
					existing?.preserveReasoning ??
					(modelId.includes("thinking") ||
						modelId.includes("r1") ||
						modelId.includes("reasoner") ||
						modelId.includes("k2p5"))

				models[modelId] = {
					maxTokens,
					contextWindow: contextLength,
					supportsImages,
					supportsPromptCache: existing?.supportsPromptCache ?? true,
					preserveReasoning: isThinking,
					supportsTemperature: existing?.supportsTemperature ?? true,
					defaultTemperature: existing?.defaultTemperature ?? (isThinking ? 1.0 : 0.5),
					inputPrice: existing?.inputPrice ?? 0.6,
					outputPrice: existing?.outputPrice ?? 2.5,
					cacheReadsPrice: existing?.cacheReadsPrice ?? 0.15,
					description:
						existing?.description ||
						item.description ||
						`${modelId.split("/").pop() ?? modelId} hosted on Fireworks AI`,
				}
			}
		}

		return models
	} catch (error: any) {
		console.warn(
			"[getFireworksModels] Failed to fetch live models from Fireworks AI, using built-in catalog:",
			error?.message || error,
		)
		return models
	}
}

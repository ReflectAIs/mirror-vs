import type { WebviewMessage } from "@mirror-vs/types"
import type { RouterModels } from "@mirror-vs/types"

import type { MirrorProvider } from "../MirrorProvider"
import type { RouterName } from "../../../shared/api"

/**
 * Handles the flushRouterModels message.
 */
export async function handleFlushRouterModels(provider: MirrorProvider, text?: string): Promise<void> {
	const { toRouterName } = await import("../../../shared/api")
	const { flushModels } = await import("../../../api/providers/fetchers/modelCache")
	const routerNameFlush: RouterName = toRouterName(text)
	await flushModels({ provider: routerNameFlush } as any, true)
}

/**
 * Handles the requestRouterModels message - fetches models from all router providers.
 */
export async function handleRequestRouterModels(provider: MirrorProvider, message: WebviewMessage): Promise<void> {
	const { toRouterName } = await import("../../../shared/api")
	const { getModels, flushModels } = await import("../../../api/providers/fetchers/modelCache")
	const { apiConfiguration } = await provider.getState()

	const requestedProvider = message?.values?.provider
	const providerFilter = requestedProvider ? toRouterName(requestedProvider) : undefined

	const shouldRefresh = message?.values?.refresh === true

	const routerModels: Record<string, any> = providerFilter
		? ({} as Record<string, any>)
		: {
				openrouter: {},
				"vercel-ai-gateway": {},
				litellm: {},
				requesty: {},
				unbound: {},
				ollama: {},
				lmstudio: {},
				poe: {},
			}

	const safeGetModels = async (options: any): Promise<any> => {
		try {
			return await getModels(options)
		} catch (error) {
			console.error(`Failed to fetch models in requestRouterModels for ${options.provider}:`, error)
			throw error
		}
	}

	const candidates: { key: string; options: any }[] = [
		{ key: "openrouter", options: { provider: "openrouter" } },
		{
			key: "requesty",
			options: {
				provider: "requesty",
				apiKey: apiConfiguration.requestyApiKey,
				baseUrl: apiConfiguration.requestyBaseUrl,
			},
		},
		{
			key: "unbound",
			options: {
				provider: "unbound",
				apiKey: apiConfiguration.unboundApiKey,
			},
		},
		{ key: "vercel-ai-gateway", options: { provider: "vercel-ai-gateway" } },
	]

	// LiteLLM is conditional on baseUrl+apiKey
	const litellmApiKey = apiConfiguration.litellmApiKey || message?.values?.litellmApiKey
	const litellmBaseUrl = apiConfiguration.litellmBaseUrl || message?.values?.litellmBaseUrl

	if (litellmApiKey && litellmBaseUrl) {
		if (message?.values?.litellmApiKey || message?.values?.litellmBaseUrl) {
			await flushModels({ provider: "litellm", apiKey: litellmApiKey, baseUrl: litellmBaseUrl }, true)
		}

		candidates.push({
			key: "litellm",
			options: { provider: "litellm", apiKey: litellmApiKey, baseUrl: litellmBaseUrl },
		})
	}

	// Poe is conditional on apiKey
	const poeApiKey = apiConfiguration.poeApiKey || message?.values?.poeApiKey
	const poeBaseUrl = apiConfiguration.poeBaseUrl || message?.values?.poeBaseUrl

	if (poeApiKey) {
		if (message?.values?.poeApiKey || message?.values?.poeBaseUrl) {
			await flushModels({ provider: "poe", apiKey: poeApiKey, baseUrl: poeBaseUrl }, true)
		}

		candidates.push({
			key: "poe",
			options: { provider: "poe", apiKey: poeApiKey, baseUrl: poeBaseUrl },
		})
	}

	// Apply single provider filter if specified
	const modelFetchPromises = providerFilter ? candidates.filter(({ key }) => key === providerFilter) : candidates

	// If refresh flag is set and we have a specific provider, flush its cache first
	if (shouldRefresh && providerFilter && modelFetchPromises.length > 0) {
		const targetCandidate = modelFetchPromises[0]
		await flushModels(targetCandidate.options, true)
	}

	const results = await Promise.allSettled(
		modelFetchPromises.map(async ({ key, options }) => {
			const models = await safeGetModels(options)
			return { key, models }
		}),
	)

	results.forEach((result, index) => {
		const routerName = modelFetchPromises[index].key

		if (result.status === "fulfilled") {
			routerModels[routerName] = result.value.models
		} else {
			const errorMessage = result.reason instanceof Error ? result.reason.message : String(result.reason)
			console.error(`Error fetching models for ${routerName}:`, result.reason)

			routerModels[routerName] = {}

			provider.postMessageToWebview({
				type: "singleRouterModelFetchResponse",
				success: false,
				error: errorMessage,
				values: { provider: routerName },
			})
		}
	})

	provider.postMessageToWebview({
		type: "routerModels",
		routerModels: routerModels as RouterModels,
		values: providerFilter ? { provider: requestedProvider } : undefined,
	})
}

/**
 * Handles the requestOllamaModels message.
 */
export async function handleRequestOllamaModels(provider: MirrorProvider): Promise<void> {
	const { getModels, flushModels } = await import("../../../api/providers/fetchers/modelCache")
	const { apiConfiguration: ollamaApiConfig } = await provider.getState()
	try {
		const ollamaOptions = {
			provider: "ollama" as const,
			baseUrl: ollamaApiConfig.ollamaBaseUrl,
			apiKey: ollamaApiConfig.ollamaApiKey,
		}
		await flushModels(ollamaOptions, true)

		const ollamaModels = await getModels(ollamaOptions)

		if (Object.keys(ollamaModels).length > 0) {
			provider.postMessageToWebview({ type: "ollamaModels", ollamaModels })
		}
	} catch (error) {
		console.debug("Ollama models fetch failed:", error)
	}
}

/**
 * Handles the requestLmStudioModels message.
 */
export async function handleRequestLmStudioModels(provider: MirrorProvider): Promise<void> {
	const { getModels, flushModels } = await import("../../../api/providers/fetchers/modelCache")
	const { apiConfiguration: lmStudioApiConfig } = await provider.getState()
	try {
		const lmStudioOptions = {
			provider: "lmstudio" as const,
			baseUrl: lmStudioApiConfig.lmStudioBaseUrl,
		}
		await flushModels(lmStudioOptions, true)

		const lmStudioModels = await getModels(lmStudioOptions)

		if (Object.keys(lmStudioModels).length > 0) {
			provider.postMessageToWebview({
				type: "lmStudioModels",
				lmStudioModels,
			})
		}
	} catch (error) {
		console.debug("LM Studio models fetch failed:", error)
	}
}

/**
 * Handles the requestOpenAiModels message.
 */
export async function handleRequestOpenAiModels(provider: MirrorProvider, message: WebviewMessage): Promise<void> {
	if (message?.values?.baseUrl && message?.values?.apiKey) {
		const { getOpenAiModels } = await import("../../../api/providers/openai")
		const openAiModels = await getOpenAiModels(
			message?.values?.baseUrl,
			message?.values?.apiKey,
			message?.values?.openAiHeaders,
		)

		provider.postMessageToWebview({ type: "openAiModels", openAiModels })
	}
}

/**
 * Handles the requestVsCodeLmModels message.
 */
export async function handleRequestVsCodeLmModels(provider: MirrorProvider): Promise<void> {
	const { getVsCodeLmModels } = await import("../../../api/providers/vscode-lm")
	const vsCodeLmModels = await getVsCodeLmModels()
	provider.postMessageToWebview({ type: "vsCodeLmModels", vsCodeLmModels })
}

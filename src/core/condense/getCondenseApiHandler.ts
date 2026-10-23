import { ApiHandler, buildApiHandler } from "../../api"
import { ProviderSettings } from "@mirror-vs/types"
import { Task } from "../task/Task"
import { logger } from "../../utils/logging"

/**
 * Returns an ApiHandler instance for conversation condensation / compression.
 * If the user configured a dedicated condenseProvider or condenseModelId, this
 * constructs an ApiHandler targeting that specific model/provider.
 * If not configured, or if construction fails, it falls back to the task's primary ApiHandler.
 */
export async function getCondenseApiHandler(task: Task, state?: any): Promise<ApiHandler> {
	try {
		const s = state ?? (await task.providerRef.deref()?.getState())
		const { condenseProvider, condenseModelId, apiConfiguration } = s ?? {}

		const hasCustomProvider = condenseProvider && condenseProvider.trim() !== "" && condenseProvider !== "same"
		const hasCustomModel = condenseModelId && condenseModelId.trim() !== ""

		// If neither custom provider nor custom model is configured, use primary task API handler
		if (!hasCustomProvider && !hasCustomModel) {
			return task.api
		}

		const targetProvider = hasCustomProvider ? condenseProvider.trim() : apiConfiguration?.apiProvider
		const targetModelId = hasCustomModel ? condenseModelId.trim() : undefined

		// If it's the exact same provider and model as the primary task, use task.api
		const primaryModelId = task.api.getModel().id
		if (targetProvider === apiConfiguration?.apiProvider && (!targetModelId || targetModelId === primaryModelId)) {
			return task.api
		}

		const condenseConfig: ProviderSettings = {
			...apiConfiguration,
			apiProvider: targetProvider,
			...(targetModelId ? { apiModelId: targetModelId } : {}),
			...(targetProvider === "relace" && targetModelId ? { relaceModelId: targetModelId as any } : {}),
			...(targetProvider === "deepseek" && targetModelId ? { deepSeekModelId: targetModelId as any } : {}),
			...(targetProvider === "openai" && targetModelId ? { openAiModelId: targetModelId } : {}),
			...(targetProvider === "openai-native" && targetModelId
				? { openAiNativeModelId: targetModelId as any }
				: {}),
			...(targetProvider === "openrouter" && targetModelId ? { openRouterModelId: targetModelId } : {}),
			...(targetProvider === "anthropic" && targetModelId ? { apiModelId: targetModelId } : {}),
			...(targetProvider === "gemini" && targetModelId ? { geminiModelId: targetModelId as any } : {}),
			...(targetProvider === "together" && targetModelId ? { togetherModelId: targetModelId as any } : {}),
			...(targetProvider === "hyperbolic" && targetModelId ? { hyperbolicModelId: targetModelId as any } : {}),
			...(targetProvider === "groq" && targetModelId ? { groqModelId: targetModelId as any } : {}),
		}

		logger.info(
			`[getCondenseApiHandler] Using dedicated compression handler: provider=${targetProvider}, model=${targetModelId || "default"}`,
		)
		return buildApiHandler(condenseConfig)
	} catch (error) {
		logger.error(
			`[getCondenseApiHandler] Failed to build compression API handler, falling back to task.api: ${error}`,
		)
		return task.api
	}
}

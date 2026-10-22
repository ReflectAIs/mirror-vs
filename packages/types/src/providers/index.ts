export * from "./anthropic.js"
export * from "./baseten.js"
export * from "./bedrock.js"
export * from "./deepinfra.js"
export * from "./deepseek.js"
export * from "./fireworks.js"
export * from "./gemini.js"
export * from "./lite-llm.js"
export * from "./lm-studio.js"
export * from "./mistral.js"
export * from "./moonshot.js"
export * from "./ollama.js"
export * from "./openai.js"
export * from "./openai-codex.js"
export * from "./openai-codex-rate-limits.js"
export * from "./openrouter.js"
export * from "./poe.js"
export * from "./qwen-code.js"
export * from "./requesty.js"
export * from "./sambanova.js"
export * from "./unbound.js"
export * from "./vertex.js"
export * from "./vscode-llm.js"
export * from "./xai.js"
export * from "./vercel-ai-gateway.js"
export * from "./zai.js"
export * from "./minimax.js"
export * from "./custom.js"
export * from "./free-router.js"
export * from "./nvidia.js"
export * from "./groq.js"
export * from "./cerebras.js"
export * from "./relace.js"
export * from "./together.js"
export * from "./hyperbolic.js"
export * from "./perplexity.js"
export * from "./cohere.js"
export * from "./novita.js"
export * from "./siliconflow.js"
export * from "./nebius.js"
export * from "./scaleway.js"
export * from "./yi.js"
export * from "./upstage.js"

import { anthropicDefaultModelId } from "./anthropic.js"
import { basetenDefaultModelId } from "./baseten.js"
import { bedrockDefaultModelId } from "./bedrock.js"
import { deepInfraDefaultModelId } from "./deepinfra.js"
import { deepSeekDefaultModelId } from "./deepseek.js"
import { fireworksDefaultModelId } from "./fireworks.js"
import { geminiDefaultModelId } from "./gemini.js"
import { litellmDefaultModelId } from "./lite-llm.js"
import { mistralDefaultModelId } from "./mistral.js"
import { moonshotDefaultModelId } from "./moonshot.js"
import { openAiCodexDefaultModelId } from "./openai-codex.js"
import { openAiNativeDefaultModelId } from "./openai.js"
import { openRouterDefaultModelId } from "./openrouter.js"
import { poeDefaultModelId } from "./poe.js"
import { qwenCodeDefaultModelId } from "./qwen-code.js"
import { requestyDefaultModelId } from "./requesty.js"
import { sambaNovaDefaultModelId } from "./sambanova.js"
import { unboundDefaultModelId } from "./unbound.js"
import { vertexDefaultModelId } from "./vertex.js"
import { vscodeLlmDefaultModelId } from "./vscode-llm.js"
import { xaiDefaultModelId } from "./xai.js"
import { vercelAiGatewayDefaultModelId } from "./vercel-ai-gateway.js"
import { internationalZAiDefaultModelId, mainlandZAiDefaultModelId } from "./zai.js"
import { minimaxDefaultModelId } from "./minimax.js"
import { customDefaultModelId } from "./custom.js"
import { freeRouterDefaultModelId } from "./free-router.js"
import { nvidiaDefaultModelId } from "./nvidia.js"
import { groqDefaultModelId } from "./groq.js"
import { cerebrasDefaultModelId } from "./cerebras.js"
import { relaceDefaultModelId } from "./relace.js"
import { togetherDefaultModelId } from "./together.js"
import { hyperbolicDefaultModelId } from "./hyperbolic.js"
import { perplexityDefaultModelId } from "./perplexity.js"
import { cohereDefaultModelId } from "./cohere.js"
import { novitaDefaultModelId } from "./novita.js"
import { siliconFlowDefaultModelId } from "./siliconflow.js"
import { nebiusDefaultModelId } from "./nebius.js"
import { scalewayDefaultModelId } from "./scaleway.js"
import { yiDefaultModelId } from "./yi.js"
import { upstageDefaultModelId } from "./upstage.js"

// Import the ProviderName type from provider-settings to avoid duplication
import type { ProviderName } from "../provider-settings.js"

/**
 * Get the default model ID for a given provider.
 * This function returns only the provider's default model ID, without considering user configuration.
 * Used as a fallback when provider models are still loading.
 */
export function getProviderDefaultModelId(
	provider: ProviderName,
	options: { isChina?: boolean } = { isChina: false },
): string {
	switch (provider) {
		case "openrouter":
			return openRouterDefaultModelId
		case "requesty":
			return requestyDefaultModelId
		case "litellm":
			return litellmDefaultModelId
		case "xai":
			return xaiDefaultModelId
		case "baseten":
			return basetenDefaultModelId
		case "bedrock":
			return bedrockDefaultModelId
		case "vertex":
			return vertexDefaultModelId
		case "gemini":
			return geminiDefaultModelId
		case "deepseek":
			return deepSeekDefaultModelId
		case "deepinfra":
			return deepInfraDefaultModelId
		case "moonshot":
			return moonshotDefaultModelId
		case "minimax":
			return minimaxDefaultModelId
		case "zai":
			return options?.isChina ? mainlandZAiDefaultModelId : internationalZAiDefaultModelId
		case "openai-native":
			return openAiNativeDefaultModelId
		case "openai-codex":
			return openAiCodexDefaultModelId
		case "mistral":
			return mistralDefaultModelId
		case "openai":
			return "" // OpenAI provider uses custom model configuration
		case "custom":
			return customDefaultModelId
		case "ollama":
			return "" // Ollama uses dynamic model selection
		case "lmstudio":
			return "" // LMStudio uses dynamic model selection
		case "vscode-lm":
			return vscodeLlmDefaultModelId
		case "sambanova":
			return sambaNovaDefaultModelId
		case "fireworks":
			return fireworksDefaultModelId
		case "qwen-code":
			return qwenCodeDefaultModelId
		case "poe":
			return poeDefaultModelId
		case "unbound":
			return unboundDefaultModelId
		case "vercel-ai-gateway":
			return vercelAiGatewayDefaultModelId
		case "free-router":
			return freeRouterDefaultModelId
		case "nvidia":
			return nvidiaDefaultModelId
		case "groq":
			return groqDefaultModelId
		case "cerebras":
			return cerebrasDefaultModelId
		case "relace":
			return relaceDefaultModelId
		case "together":
			return togetherDefaultModelId
		case "hyperbolic":
			return hyperbolicDefaultModelId
		case "perplexity":
			return perplexityDefaultModelId
		case "cohere":
			return cohereDefaultModelId
		case "novita":
			return novitaDefaultModelId
		case "siliconflow":
			return siliconFlowDefaultModelId
		case "nebius":
			return nebiusDefaultModelId
		case "scaleway":
			return scalewayDefaultModelId
		case "yi":
			return yiDefaultModelId
		case "upstage":
			return upstageDefaultModelId
		case "anthropic":
		case "gemini-cli":
		case "fake-ai":
		default:
			return anthropicDefaultModelId
	}
}

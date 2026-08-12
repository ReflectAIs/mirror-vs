import { MirrorVSSettings, ProviderNameWithRetired } from "@mirror-vs/types"
import type { SupportedProvider } from "@/types/index.js"

const envVarMap: Partial<Record<SupportedProvider, string>> = {
	anthropic: "ANTHROPIC_API_KEY",
	"openai-native": "OPENAI_API_KEY",
	gemini: "GOOGLE_API_KEY",
	openrouter: "OPENROUTER_API_KEY",
	"vercel-ai-gateway": "VERCEL_AI_GATEWAY_API_KEY",
	deepseek: "DEEPSEEK_API_KEY",
	mistral: "MISTRAL_API_KEY",
	xai: "XAI_API_KEY",
	zai: "ZAI_API_KEY",
	bedrock: "AWS_ACCESS_KEY_ID",
	vertex: "VERTEX_API_KEY",
	openai: "OPENAI_API_KEY",
	fireworks: "FIREWORKS_API_KEY",
	baseten: "BASETEN_API_KEY",
	litellm: "LITELLM_API_KEY",
	sambanova: "SAMBANOVA_API_KEY",
	moonshot: "MOONSHOT_API_KEY",
	minimax: "MINIMAX_API_KEY",
	requesty: "REQUESTY_API_KEY",
	unbound: "UNBOUND_API_KEY",
	poe: "POE_API_KEY",
}

export function getEnvVarName(provider: SupportedProvider): string {
	return envVarMap[provider] || `${provider.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`
}

export function getApiKeyFromEnv(provider: SupportedProvider): string | undefined {
	const envVar = getEnvVarName(provider)
	return process.env[envVar]
}

export function getProviderSettings(
	provider: SupportedProvider,
	apiKey: string | undefined,
	model: string | undefined,
): MirrorVSSettings {
	const config: MirrorVSSettings = { apiProvider: provider as ProviderNameWithRetired }

	switch (provider) {
		case "anthropic":
			if (apiKey) config.apiKey = apiKey
			if (model) config.apiModelId = model
			break
		case "openai-native":
			if (apiKey) config.openAiNativeApiKey = apiKey
			if (model) config.openAiModelId = model
			break
		case "gemini":
			if (apiKey) config.geminiApiKey = apiKey
			if (model) config.apiModelId = model
			break
		case "openrouter":
			if (apiKey) config.openRouterApiKey = apiKey
			if (model) config.openRouterModelId = model
			break
		case "vercel-ai-gateway":
			if (apiKey) config.vercelAiGatewayApiKey = apiKey
			if (model) config.vercelAiGatewayModelId = model
			break
		case "deepseek":
			if (apiKey) config.deepSeekApiKey = apiKey
			if (model) config.apiModelId = model
			break
		case "mistral":
			if (apiKey) config.mistralApiKey = apiKey
			if (model) config.apiModelId = model
			break
		case "xai":
			if (apiKey) config.xaiApiKey = apiKey
			if (model) config.apiModelId = model
			break
		case "zai":
			if (apiKey) config.zaiApiKey = apiKey
			if (model) config.apiModelId = model
			break
		case "baseten":
			if (apiKey) config.basetenApiKey = apiKey
			if (model) config.apiModelId = model
			break
		case "fireworks":
			if (apiKey) config.fireworksApiKey = apiKey
			if (model) config.apiModelId = model
			break
		case "litellm":
			if (apiKey) config.litellmApiKey = apiKey
			if (model) config.litellmModelId = model
			break
		case "sambanova":
			if (apiKey) config.sambaNovaApiKey = apiKey
			if (model) config.apiModelId = model
			break
		case "requesty":
			if (apiKey) config.requestyApiKey = apiKey
			if (model) config.requestyModelId = model
			break
		case "unbound":
			if (apiKey) config.unboundApiKey = apiKey
			if (model) config.unboundModelId = model
			break
		case "poe":
			if (apiKey) config.poeApiKey = apiKey
			if (model) config.apiModelId = model
			break
		case "moonshot":
			if (apiKey) config.moonshotApiKey = apiKey
			if (model) config.apiModelId = model
			break
		case "minimax":
			if (apiKey) config.minimaxApiKey = apiKey
			if (model) config.apiModelId = model
			break
		case "custom":
			if (apiKey) config.apiKey = apiKey
			if (model) config.customModelId = model
			break
		case "ollama":
			if (model) config.ollamaModelId = model
			break
		case "lmstudio":
			if (model) config.lmStudioModelId = model
			break
		default:
			if (apiKey) config.apiKey = apiKey
			if (model) config.apiModelId = model
	}

	return config
}

/**
 * Provider namespaces / prefixes used in model IDs — helps detect cross-provider model strings.
 * E.g. "anthropic/claude-opus-4.6" for openrouter, "deepseek-v4-pro" for deepseek.
 */
const PROVIDER_MODEL_NAMESPACES: Partial<Record<SupportedProvider, string[]>> = {
	anthropic: ["claude-"],
	deepseek: ["deepseek-"],
	gemini: ["gemini-"],
	xai: ["grok-"],
	mistral: ["mistral-", "codestral-"],
	sambanova: ["Meta-Llama-"],
}

/**
 * Returns true when the given model ID is plausibly compatible with the provider.
 * A model is considered INCOMPATIBLE when it contains a namespace prefix that clearly
 * belongs to a DIFFERENT provider (e.g. "anthropic/" prefix with deepseek provider).
 *
 * This is deliberately lenient — it only flags obvious mismatches so we don't break
 * custom/router models (e.g. openrouter supports any namespace).
 */
export function isModelCompatibleWithProvider(model: string, provider: SupportedProvider): boolean {
	if (!model) return true

	// OpenRouter and requesty are multi-provider gateways — all models are valid
	if (provider === "openrouter" || provider === "requesty" || provider === "litellm") {
		return true
	}

	// If model contains a slash ("anthropic/claude-opus-4.6"), it's router-style.
	// That's always wrong for native providers (deepseek, gemini, anthropic, etc.)
	if (model.includes("/")) {
		return false
	}

	// Check if the model belongs to a DIFFERENT provider's namespace
	for (const [providerName, prefixes] of Object.entries(PROVIDER_MODEL_NAMESPACES)) {
		if (providerName === provider) continue // same provider — OK
		for (const prefix of prefixes ?? []) {
			if (model.toLowerCase().startsWith(prefix.toLowerCase())) {
				return false // model is from another provider
			}
		}
	}

	return true
}

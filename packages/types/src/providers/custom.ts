import type { ModelInfo } from "../model.js"

/**
 * Default model ID for the Custom provider.
 * Users can configure any model ID via the customModelId setting.
 */
export const customDefaultModelId = "gpt-4o"

/**
 * Sensible default ModelInfo for the Custom provider.
 * These values represent a typical modern LLM and serve as fallback
 * when the user does not provide custom model info.
 */
export const customDefaultModelInfo: ModelInfo = {
    maxTokens: 8192,
    contextWindow: 128_000,
    supportsImages: true,
    supportsPromptCache: false,
    inputPrice: 0,
    outputPrice: 0,
}

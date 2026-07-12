import { OpenAICompatibleEmbedder } from "./openai-compatible"
import { IEmbedder, EmbeddingResponse, EmbedderInfo } from "../interfaces/embedder"
import { MAX_ITEM_TOKENS } from "../constants"
import { t } from "../../../i18n"

/**
 * Anthropic embedder implementation that wraps the OpenAI Compatible embedder
 * with configuration for Anthropic's embedding API.
 *
 * Anthropic routes embedding requests through Voyage AI:
 * - voyage-code-2 (dimension: 1536)
 */
export class AnthropicEmbedder implements IEmbedder {
	private readonly openAICompatibleEmbedder: OpenAICompatibleEmbedder
	private static readonly ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1"
	private static readonly DEFAULT_MODEL = "voyage-code-2"
	private readonly modelId: string

	/**
	 * Creates a new Anthropic embedder
	 * @param apiKey The Anthropic API key for authentication
	 * @param modelId The model ID to use (defaults to voyage-code-2)
	 */
	constructor(apiKey: string, modelId?: string) {
		if (!apiKey) {
			throw new Error(t("embeddings:validation.apiKeyRequired"))
		}

		// Use provided model or default
		this.modelId = modelId || AnthropicEmbedder.DEFAULT_MODEL

		// Create an OpenAI Compatible embedder with Anthropic's configuration
		this.openAICompatibleEmbedder = new OpenAICompatibleEmbedder(
			AnthropicEmbedder.ANTHROPIC_BASE_URL,
			apiKey,
			this.modelId,
			MAX_ITEM_TOKENS,
		)
	}

	/**
	 * Creates embeddings for the given texts using Anthropic's embedding API
	 * @param texts Array of text strings to embed
	 * @param model Optional model identifier (uses constructor model if not provided)
	 * @returns Promise resolving to embedding response
	 */
	async createEmbeddings(texts: string[], model?: string): Promise<EmbeddingResponse> {
		const modelToUse = model || this.modelId
		return this.openAICompatibleEmbedder.createEmbeddings(texts, modelToUse)
	}

	/**
	 * Validates the Anthropic embedder configuration by delegating to the underlying OpenAI-compatible embedder
	 * @returns Promise resolving to validation result with success status and optional error message
	 */
	async validateConfiguration(): Promise<{ valid: boolean; error?: string }> {
		return this.openAICompatibleEmbedder.validateConfiguration()
	}

	/**
	 * Returns information about this embedder
	 */
	get embedderInfo(): EmbedderInfo {
		return {
			name: "anthropic",
		}
	}
}

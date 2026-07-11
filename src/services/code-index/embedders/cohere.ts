import { OpenAICompatibleEmbedder } from "./openai-compatible"
import { IEmbedder, EmbeddingResponse, EmbedderInfo } from "../interfaces/embedder"
import { MAX_ITEM_TOKENS } from "../constants"
import { t } from "../../../i18n"

/**
 * Cohere embedder implementation that wraps the OpenAI Compatible embedder
 * with configuration for Cohere's embedding API.
 *
 * Supported models:
 * - embed-english-v3.0 (dimension: 1024)
 * - embed-multilingual-v3.0 (dimension: 1024)
 * - embed-english-light-v3.0 (dimension: 384)
 * - embed-multilingual-light-v3.0 (dimension: 384)
 */
export class CohereEmbedder implements IEmbedder {
	private readonly openAICompatibleEmbedder: OpenAICompatibleEmbedder
	private static readonly COHERE_BASE_URL = "https://api.cohere.ai/v1"
	private static readonly DEFAULT_MODEL = "embed-english-v3.0"
	private readonly modelId: string

	/**
	 * Creates a new Cohere embedder
	 * @param apiKey The Cohere API key for authentication
	 * @param modelId The model ID to use (defaults to embed-english-v3.0)
	 */
	constructor(apiKey: string, modelId?: string) {
		if (!apiKey) {
			throw new Error(t("embeddings:validation.apiKeyRequired"))
		}

		// Use provided model or default
		this.modelId = modelId || CohereEmbedder.DEFAULT_MODEL

		// Create an OpenAI Compatible embedder with Cohere's configuration
		this.openAICompatibleEmbedder = new OpenAICompatibleEmbedder(
			CohereEmbedder.COHERE_BASE_URL,
			apiKey,
			this.modelId,
			MAX_ITEM_TOKENS,
		)
	}

	/**
	 * Creates embeddings for the given texts using Cohere's embedding API
	 * @param texts Array of text strings to embed
	 * @param model Optional model identifier (uses constructor model if not provided)
	 * @returns Promise resolving to embedding response
	 */
	async createEmbeddings(texts: string[], model?: string): Promise<EmbeddingResponse> {
		const modelToUse = model || this.modelId
		return this.openAICompatibleEmbedder.createEmbeddings(texts, modelToUse)
	}

	/**
	 * Validates the Cohere embedder configuration by delegating to the underlying OpenAI-compatible embedder
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
			name: "cohere",
		}
	}
}

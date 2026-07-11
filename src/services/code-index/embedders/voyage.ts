import { OpenAICompatibleEmbedder } from "./openai-compatible"
import { IEmbedder, EmbeddingResponse, EmbedderInfo } from "../interfaces/embedder"
import { MAX_ITEM_TOKENS } from "../constants"
import { t } from "../../../i18n"

/**
 * Voyage AI embedder implementation that wraps the OpenAI Compatible embedder
 * with configuration for Voyage AI's embedding API.
 *
 * Supported models:
 * - voyage-3 (dimension: 1024)
 * - voyage-3-lite (dimension: 512)
 * - voyage-code-2 (dimension: 1536)
 */
export class VoyageEmbedder implements IEmbedder {
	private readonly openAICompatibleEmbedder: OpenAICompatibleEmbedder
	private static readonly VOYAGE_BASE_URL = "https://api.voyageai.com/v1"
	private static readonly DEFAULT_MODEL = "voyage-3"
	private readonly modelId: string

	/**
	 * Creates a new Voyage embedder
	 * @param apiKey The Voyage API key for authentication
	 * @param modelId The model ID to use (defaults to voyage-3)
	 */
	constructor(apiKey: string, modelId?: string) {
		if (!apiKey) {
			throw new Error(t("embeddings:validation.apiKeyRequired"))
		}

		// Use provided model or default
		this.modelId = modelId || VoyageEmbedder.DEFAULT_MODEL

		// Create an OpenAI Compatible embedder with Voyage's configuration
		this.openAICompatibleEmbedder = new OpenAICompatibleEmbedder(
			VoyageEmbedder.VOYAGE_BASE_URL,
			apiKey,
			this.modelId,
			MAX_ITEM_TOKENS,
		)
	}

	/**
	 * Creates embeddings for the given texts using Voyage's embedding API
	 * @param texts Array of text strings to embed
	 * @param model Optional model identifier (uses constructor model if not provided)
	 * @returns Promise resolving to embedding response
	 */
	async createEmbeddings(texts: string[], model?: string): Promise<EmbeddingResponse> {
		const modelToUse = model || this.modelId
		return this.openAICompatibleEmbedder.createEmbeddings(texts, modelToUse)
	}

	/**
	 * Validates the Voyage embedder configuration by delegating to the underlying OpenAI-compatible embedder
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
			name: "voyage",
		}
	}
}

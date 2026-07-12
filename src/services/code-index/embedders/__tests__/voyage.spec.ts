import type { MockedClass } from "vitest"

import { VoyageEmbedder } from "../voyage"
import { OpenAICompatibleEmbedder } from "../openai-compatible"

// Mock the OpenAICompatibleEmbedder
vitest.mock("../openai-compatible")

const MockedOpenAICompatibleEmbedder = OpenAICompatibleEmbedder as MockedClass<typeof OpenAICompatibleEmbedder>

describe("VoyageEmbedder", () => {
	let embedder: VoyageEmbedder

	beforeEach(() => {
		vitest.clearAllMocks()
	})

	describe("constructor", () => {
		it("should create an instance with default model when no model specified", () => {
			// Arrange
			const apiKey = "test-voyage-api-key"

			// Act
			embedder = new VoyageEmbedder(apiKey)

			// Assert
			expect(MockedOpenAICompatibleEmbedder).toHaveBeenCalledWith(
				"https://api.voyageai.com/v1",
				apiKey,
				"voyage-3",
				8191,
			)
		})

		it("should create an instance with specified model", () => {
			// Arrange
			const apiKey = "test-voyage-api-key"
			const modelId = "voyage-code-2"

			// Act
			embedder = new VoyageEmbedder(apiKey, modelId)

			// Assert
			expect(MockedOpenAICompatibleEmbedder).toHaveBeenCalledWith(
				"https://api.voyageai.com/v1",
				apiKey,
				"voyage-code-2",
				8191,
			)
		})

		it("should throw error when API key is not provided", () => {
			// Act & Assert
			expect(() => new VoyageEmbedder("")).toThrow("validation.apiKeyRequired")
			expect(() => new VoyageEmbedder(null as any)).toThrow("validation.apiKeyRequired")
			expect(() => new VoyageEmbedder(undefined as any)).toThrow("validation.apiKeyRequired")
		})
	})

	describe("embedderInfo", () => {
		it("should return correct embedder info", () => {
			// Arrange
			embedder = new VoyageEmbedder("test-api-key")

			// Act
			const info = embedder.embedderInfo

			// Assert
			expect(info).toEqual({
				name: "voyage",
			})
		})

		describe("createEmbeddings", () => {
			let mockCreateEmbeddings: any

			beforeEach(() => {
				mockCreateEmbeddings = vitest.fn()
				MockedOpenAICompatibleEmbedder.prototype.createEmbeddings = mockCreateEmbeddings
			})

			it("should use instance model when no model parameter provided", async () => {
				// Arrange
				embedder = new VoyageEmbedder("test-api-key")
				const texts = ["test text 1", "test text 2"]
				const mockResponse = {
					embeddings: [
						[0.1, 0.2],
						[0.3, 0.4],
					],
				}
				mockCreateEmbeddings.mockResolvedValue(mockResponse)

				// Act
				const result = await embedder.createEmbeddings(texts)

				// Assert
				expect(mockCreateEmbeddings).toHaveBeenCalledWith(texts, "voyage-3")
				expect(result).toEqual(mockResponse)
			})

			it("should use provided model parameter when specified", async () => {
				// Arrange
				embedder = new VoyageEmbedder("test-api-key", "voyage-code-2")
				const texts = ["test text 1", "test text 2"]
				const mockResponse = {
					embeddings: [
						[0.1, 0.2],
						[0.3, 0.4],
					],
				}
				mockCreateEmbeddings.mockResolvedValue(mockResponse)

				// Act
				const result = await embedder.createEmbeddings(texts, "voyage-3")

				// Assert
				expect(mockCreateEmbeddings).toHaveBeenCalledWith(texts, "voyage-3")
				expect(result).toEqual(mockResponse)
			})

			it("should handle errors from OpenAICompatibleEmbedder", async () => {
				// Arrange
				embedder = new VoyageEmbedder("test-api-key")
				const texts = ["test text"]
				const error = new Error("Embedding failed")
				mockCreateEmbeddings.mockRejectedValue(error)

				// Act & Assert
				await expect(embedder.createEmbeddings(texts)).rejects.toThrow("Embedding failed")
			})
		})
	})

	describe("validateConfiguration", () => {
		let mockValidateConfiguration: any

		beforeEach(() => {
			mockValidateConfiguration = vitest.fn()
			MockedOpenAICompatibleEmbedder.prototype.validateConfiguration = mockValidateConfiguration
		})

		it("should delegate validation to OpenAICompatibleEmbedder", async () => {
			// Arrange
			embedder = new VoyageEmbedder("test-api-key")
			mockValidateConfiguration.mockResolvedValue({ valid: true })

			// Act
			const result = await embedder.validateConfiguration()

			// Assert
			expect(mockValidateConfiguration).toHaveBeenCalled()
			expect(result).toEqual({ valid: true })
		})

		it("should pass through validation errors from OpenAICompatibleEmbedder", async () => {
			// Arrange
			embedder = new VoyageEmbedder("test-api-key")
			mockValidateConfiguration.mockResolvedValue({
				valid: false,
				error: "embeddings:validation.authenticationFailed",
			})

			// Act
			const result = await embedder.validateConfiguration()

			// Assert
			expect(mockValidateConfiguration).toHaveBeenCalled()
			expect(result).toEqual({
				valid: false,
				error: "embeddings:validation.authenticationFailed",
			})
		})

		it("should handle validation exceptions", async () => {
			// Arrange
			embedder = new VoyageEmbedder("test-api-key")
			mockValidateConfiguration.mockRejectedValue(new Error("Validation failed"))

			// Act & Assert
			await expect(embedder.validateConfiguration()).rejects.toThrow("Validation failed")
		})
	})
})

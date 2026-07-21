// npx vitest run api/transform/__tests__/image-cleaning.spec.ts

import type { ModelInfo } from "@mirror-vs/types"
import type { Mock } from "vitest"

import { ApiHandler } from "../../index"
import { ApiMessage } from "../../../core/task-persistence/apiMessages"
import { maybeRemoveImageBlocks } from "../image-cleaning"

// Mock tesseract.js to avoid actual OCR calls in tests
vi.mock("tesseract.js", () => ({
	recognize: vi.fn(),
}))

import { recognize } from "tesseract.js"

describe("maybeRemoveImageBlocks", () => {
	// Mock ApiHandler factory function
	const createMockApiHandler = (supportsImages: boolean): ApiHandler => {
		return {
			getModel: vi.fn().mockReturnValue({
				id: "test-model",
				info: {
					supportsImages,
				} as ModelInfo,
			}),
			createMessage: vi.fn(),
			countTokens: vi.fn(),
		}
	}

	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should handle empty messages array", async () => {
		const apiHandler = createMockApiHandler(true)
		const messages: ApiMessage[] = []

		const result = await maybeRemoveImageBlocks(messages, apiHandler)

		expect(result).toEqual([])
	})

	it("should not modify messages with no image blocks", async () => {
		const apiHandler = createMockApiHandler(true)
		const messages: ApiMessage[] = [
			{
				role: "user",
				content: "Hello, world!",
			},
			{
				role: "assistant",
				content: "Hi there!",
			},
		]

		const result = await maybeRemoveImageBlocks(messages, apiHandler)

		expect(result).toEqual(messages)
	})

	it("should not modify messages with array content but no image blocks", async () => {
		const apiHandler = createMockApiHandler(true)
		const messages: ApiMessage[] = [
			{
				role: "user",
				content: [
					{
						type: "text",
						text: "Hello, world!",
					},
					{
						type: "text",
						text: "How are you?",
					},
				],
			},
		]

		const result = await maybeRemoveImageBlocks(messages, apiHandler)

		expect(result).toEqual(messages)
		expect(apiHandler.getModel).toHaveBeenCalled()
	})

	it("should not modify image blocks when API handler supports images", async () => {
		const apiHandler = createMockApiHandler(true)
		const messages: ApiMessage[] = [
			{
				role: "user",
				content: [
					{
						type: "text",
						text: "Check out this image:",
					},
					{
						type: "image",
						source: {
							type: "base64",
							media_type: "image/jpeg",
							data: "base64-encoded-image-data",
						},
					},
				],
			},
		]

		const result = await maybeRemoveImageBlocks(messages, apiHandler)

		// Should not modify the messages since the API handler supports images
		expect(result).toEqual(messages)
		expect(apiHandler.getModel).toHaveBeenCalled()
		// OCR should never be called for vision models
		expect(recognize).not.toHaveBeenCalled()
	})

	it("should convert image blocks to text descriptions when API handler doesn't support images and DOM text is present", async () => {
		const apiHandler = createMockApiHandler(false)
		const messages: ApiMessage[] = [
			{
				role: "user",
				content: [
					{
						type: "text",
						text: "Check out this image:\n\n--- Page Text Content ---\nHello, this is substantive page content with plenty of text extracted from the DOM.",
					},
					{
						type: "image",
						source: {
							type: "base64",
							media_type: "image/jpeg",
							data: "base64-encoded-image-data",
						},
					},
				],
			},
		]

		const result = await maybeRemoveImageBlocks(messages, apiHandler)

		// Should convert image blocks to a text reference since DOM content is present
		expect(result).toEqual([
			{
				role: "user",
				content: [
					{
						type: "text",
						text: "Check out this image:\n\n--- Page Text Content ---\nHello, this is substantive page content with plenty of text extracted from the DOM.",
					},
					{
						type: "text",
						text: "[Screenshot captured — page text content is included above]",
					},
				],
			},
		])
		expect(apiHandler.getModel).toHaveBeenCalled()
		// OCR should NOT be called because DOM text is already present
		expect(recognize).not.toHaveBeenCalled()
	})

	it("should run OCR fallback when DOM text is empty and API handler doesn't support images", async () => {
		const apiHandler = createMockApiHandler(false)
		const messages: ApiMessage[] = [
			{
				role: "user",
				content: [
					{
						type: "text",
						text: "Here's a screenshot of the page:",
					},
					{
						type: "image",
						source: {
							type: "base64",
							media_type: "image/png",
							data: "screenshot-base64-data",
						},
					},
				],
			},
		]

		// Mock OCR to return meaningful text
		;(recognize as Mock).mockResolvedValueOnce({
			data: { text: "Extracted OCR text from the screenshot\nLine 2\nLine 3" },
		})

		const result = await maybeRemoveImageBlocks(messages, apiHandler)

		expect(result).toEqual([
			{
				role: "user",
				content: [
					{
						type: "text",
						text: "Here's a screenshot of the page:",
					},
					{
						type: "text",
						text: "[Page screenshot OCR text:\nExtracted OCR text from the screenshot\nLine 2\nLine 3\n]",
					},
				],
			},
		])
		expect(apiHandler.getModel).toHaveBeenCalled()
		expect(recognize).toHaveBeenCalledTimes(1)
		expect(recognize).toHaveBeenCalledWith(
			expect.stringContaining("data:image/png;base64,screenshot-base64-data"),
			"eng",
			expect.any(Object),
		)
	})

	it("should handle OCR returning empty text gracefully", async () => {
		const apiHandler = createMockApiHandler(false)
		const messages: ApiMessage[] = [
			{
				role: "user",
				content: [
					{
						type: "text",
						text: "Here's a screenshot:",
					},
					{
						type: "image",
						source: {
							type: "base64",
							media_type: "image/png",
							data: "screenshot-base64-data",
						},
					},
				],
			},
		]

		// Mock OCR to return empty text
		;(recognize as Mock).mockResolvedValueOnce({
			data: { text: "   " },
		})

		const result = await maybeRemoveImageBlocks(messages, apiHandler)

		expect(result).toEqual([
			{
				role: "user",
				content: [
					{
						type: "text",
						text: "Here's a screenshot:",
					},
					{
						type: "text",
						text: "[Screenshot captured — OCR returned no meaningful text]",
					},
				],
			},
		])
		expect(recognize).toHaveBeenCalledTimes(1)
	})

	it("should handle OCR errors gracefully", async () => {
		const apiHandler = createMockApiHandler(false)
		const messages: ApiMessage[] = [
			{
				role: "user",
				content: [
					{
						type: "text",
						text: "Here's a screenshot:",
					},
					{
						type: "image",
						source: {
							type: "base64",
							media_type: "image/png",
							data: "screenshot-base64-data",
						},
					},
				],
			},
		]

		// Mock OCR to throw an error
		;(recognize as Mock).mockRejectedValueOnce(new Error("OCR service unavailable"))

		const result = await maybeRemoveImageBlocks(messages, apiHandler)

		expect(result).toEqual([
			{
				role: "user",
				content: [
					{
						type: "text",
						text: "Here's a screenshot:",
					},
					{
						type: "text",
						text: "[Screenshot captured — OCR unavailable]",
					},
				],
			},
		])
		expect(recognize).toHaveBeenCalledTimes(1)
	})

	it("should handle mixed content messages with multiple text and image blocks", async () => {
		const apiHandler = createMockApiHandler(false)
		const messages: ApiMessage[] = [
			{
				role: "user",
				content: [
					{
						type: "text",
						text: "Here are some images:",
					},
					{
						type: "image",
						source: {
							type: "base64",
							media_type: "image/jpeg",
							data: "image-data-1",
						},
					},
					{
						type: "text",
						text: "And another one:",
					},
					{
						type: "image",
						source: {
							type: "base64",
							media_type: "image/png",
							data: "image-data-2",
						},
					},
				],
			},
		]

		// No DOM page content, so OCR will be attempted
		;(recognize as Mock).mockResolvedValue({
			data: { text: "This is longer OCR extracted text from the screenshot page content." },
		})

		const result = await maybeRemoveImageBlocks(messages, apiHandler)

		// Should call OCR for each image and convert all image blocks
		expect(result).toEqual([
			{
				role: "user",
				content: [
					{
						type: "text",
						text: "Here are some images:",
					},
					{
						type: "text",
						text: "[Page screenshot OCR text:\nThis is longer OCR extracted text from the screenshot page content.\n]",
					},
					{
						type: "text",
						text: "And another one:",
					},
					{
						type: "text",
						text: "[Page screenshot OCR text:\nThis is longer OCR extracted text from the screenshot page content.\n]",
					},
				],
			},
		])
		expect(apiHandler.getModel).toHaveBeenCalled()
		expect(recognize).toHaveBeenCalledTimes(2)
	})

	it("should handle multiple messages with image blocks", async () => {
		const apiHandler = createMockApiHandler(false)
		const messages: ApiMessage[] = [
			{
				role: "user",
				content: [
					{
						type: "text",
						text: "Here's an image:",
					},
					{
						type: "image",
						source: {
							type: "base64",
							media_type: "image/jpeg",
							data: "image-data-1",
						},
					},
				],
			},
			{
				role: "assistant",
				content: "I see the image!",
			},
			{
				role: "user",
				content: [
					{
						type: "text",
						text: "Here's another image:",
					},
					{
						type: "image",
						source: {
							type: "base64",
							media_type: "image/png",
							data: "image-data-2",
						},
					},
				],
			},
		]

		;(recognize as Mock).mockResolvedValue({
			data: { text: "This is longer OCR extracted text from the screenshot page content." },
		})

		const result = await maybeRemoveImageBlocks(messages, apiHandler)

		// Should convert all image blocks to OCR text descriptions
		expect(result).toEqual([
			{
				role: "user",
				content: [
					{
						type: "text",
						text: "Here's an image:",
					},
					{
						type: "text",
						text: "[Page screenshot OCR text:\nThis is longer OCR extracted text from the screenshot page content.\n]",
					},
				],
			},
			{
				role: "assistant",
				content: "I see the image!",
			},
			{
				role: "user",
				content: [
					{
						type: "text",
						text: "Here's another image:",
					},
					{
						type: "text",
						text: "[Page screenshot OCR text:\nThis is longer OCR extracted text from the screenshot page content.\n]",
					},
				],
			},
		])
		expect(apiHandler.getModel).toHaveBeenCalled()
		// OCR called twice, once per image block
		expect(recognize).toHaveBeenCalledTimes(2)
	})

	it("should preserve additional message properties", async () => {
		const apiHandler = createMockApiHandler(false)
		const messages: ApiMessage[] = [
			{
				role: "user",
				content: [
					{
						type: "text",
						text: "Here's an image:",
					},
					{
						type: "image",
						source: {
							type: "base64",
							media_type: "image/jpeg",
							data: "image-data",
						},
					},
				],
				ts: 1620000000000,
				isSummary: true,
			},
		]

		;(recognize as Mock).mockResolvedValue({
			data: { text: "This is longer OCR extracted text from the screenshot page content." },
		})

		const result = await maybeRemoveImageBlocks(messages, apiHandler)

		// Should convert image blocks to OCR text while preserving additional properties
		expect(result).toEqual([
			{
				role: "user",
				content: [
					{
						type: "text",
						text: "Here's an image:",
					},
					{
						type: "text",
						text: "[Page screenshot OCR text:\nThis is longer OCR extracted text from the screenshot page content.\n]",
					},
				],
				ts: 1620000000000,
				isSummary: true,
			},
		])
		expect(apiHandler.getModel).toHaveBeenCalled()
	})

	it("should use text reference instead of OCR when DOM page content is present but below 50 chars", async () => {
		const apiHandler = createMockApiHandler(false)
		const messages: ApiMessage[] = [
			{
				role: "user",
				content: [
					{
						type: "text",
						text: "Check out this image:\n\n--- Page Text Content ---\nShort",
					},
					{
						type: "image",
						source: {
							type: "base64",
							media_type: "image/jpeg",
							data: "base64-encoded-image-data",
						},
					},
				],
			},
		]

		// Page content is less than 50 chars, so OCR should run
		;(recognize as Mock).mockResolvedValueOnce({
			data: { text: "OCR fallback text from short page" },
		})

		const result = await maybeRemoveImageBlocks(messages, apiHandler)

		// OCR was used because DOM text was too short
		expect(result[0].content).toEqual([
			{
				type: "text",
				text: "Check out this image:\n\n--- Page Text Content ---\nShort",
			},
			{
				type: "text",
				text: "[Page screenshot OCR text:\nOCR fallback text from short page\n]",
			},
		])
		expect(recognize).toHaveBeenCalledTimes(1)
	})
})

import { recognize } from "tesseract.js"
import { ApiMessage } from "../../core/task-persistence/apiMessages"

import { ApiHandler } from "../index"

/**
 * Extracts base64 image data and converts it to a data URI suitable for Tesseract.js.
 */
function toDataUri(mediaType: string, base64Data: string): string {
	return `data:${mediaType};base64,${base64Data}`
}

/**
 * Checks whether a given text block contains substantive page content.
 * Returns true if the text has meaningful DOM-extracted content beyond just a header.
 */
function hasSubstantiveContent(text: string): boolean {
	// Look for the "--- Page Text Content ---" marker we inject in browser tool results
	const pageContentMarker = "--- Page Text Content ---"
	const markerIndex = text.indexOf(pageContentMarker)
	if (markerIndex === -1) {
		return false
	}
	const contentAfterMarker = text.slice(markerIndex + pageContentMarker.length).trim()
	// If there are at least 50 chars of substantive text, consider it sufficient
	return contentAfterMarker.length >= 50
}

/**
 * Removes image blocks from messages if they are not supported by the Api Handler.
 *
 * For non-vision models:
 * - If sibling text blocks already contain substantive DOM-extracted page content,
 *   the image is replaced with a brief text reference.
 * - If DOM text content is minimal/absent (e.g., canvas/iframe-heavy pages),
 *   Tesseract.js OCR is used as a fallback to extract text from the screenshot.
 *
 * Vision models are unaffected — images pass through unchanged.
 */
export async function maybeRemoveImageBlocks(messages: ApiMessage[], apiHandler: ApiHandler): Promise<ApiMessage[]> {
	const supportsImages = apiHandler.getModel().info.supportsImages

	if (supportsImages) {
		// Vision model: pass through unchanged
		return messages
	}

	// Non-vision model: process each message
	const processedMessages: ApiMessage[] = []

	for (const message of messages) {
		let { content } = message

		if (Array.isArray(content)) {
			const hasImageBlocks = content.some((block) => block.type === "image")

			if (hasImageBlocks) {
				// Check if sibling text blocks already have substantive page content
				const textParts = content.filter((b) => b.type === "text") as { type: "text"; text: string }[]
				const allText = textParts.map((b) => b.text).join("\n")
				const hasPageContent = hasSubstantiveContent(allText)

				// Process each block: keep text blocks, replace image blocks
				const newContent: (typeof content)[number][] = []

				for (const block of content) {
					if (block.type === "image") {
						if (hasPageContent) {
							// DOM text is already present — no need for OCR
							newContent.push({
								type: "text",
								text: "[Screenshot captured — page text content is included above]",
							})
						} else {
							// DOM text is empty/insufficient — run OCR fallback
							try {
								const mediaType = block.source.media_type ?? "image/png"
								const dataUri = toDataUri(mediaType, block.source.data)
								const { data } = await recognize(dataUri, "eng", {
									logger: () => {}, // suppress logging
								})
								const ocrText = data.text?.trim()
								if (ocrText && ocrText.length > 20) {
									newContent.push({
										type: "text",
										text: `[Page screenshot OCR text:\n${ocrText}\n]`,
									})
								} else {
									newContent.push({
										type: "text",
										text: "[Screenshot captured — OCR returned no meaningful text]",
									})
								}
							} catch (ocrError) {
								// OCR failed — fall back to a simple reference
								newContent.push({
									type: "text",
									text: "[Screenshot captured — OCR unavailable]",
								})
							}
						}
					} else {
						// Keep text blocks unchanged
						newContent.push(block)
					}
				}

				content = newContent as ApiMessage["content"]
			}
		}

		processedMessages.push({ ...message, content })
	}

	return processedMessages
}

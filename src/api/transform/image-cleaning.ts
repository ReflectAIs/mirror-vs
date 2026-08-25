import TesseractModule, { recognize as namedRecognize } from "tesseract.js"
import * as path from "path"
import * as os from "os"
import * as fs from "fs"
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
							// DOM text is empty/insufficient — attempt fast OCR fallback
							// Use a 10-second timeout so large UI screenshots have ample time to process
							// after worker & WASM initialization.
							const OCR_TIMEOUT_MS = 10_000
							try {
								const mediaType = block.source.media_type ?? "image/png"
								const dataUri = toDataUri(mediaType, block.source.data)
								const recognizeFn =
									namedRecognize ||
									(TesseractModule as any)?.recognize ||
									(TesseractModule as any)?.default?.recognize

								// Specify explicit writable cache path and bundled worker script path.
								const cachePath = path.join(os.homedir(), ".mirror-vs", "tessdata")
								try {
									if (!fs.existsSync(cachePath)) {
										fs.mkdirSync(cachePath, { recursive: true })
									}
								} catch {}

								const localWorkerScript = path.join(
									__dirname,
									"tesseract-worker",
									"worker-script",
									"node",
									"index.js",
								)
								const workerPath = fs.existsSync(localWorkerScript) ? localWorkerScript : undefined

								const localCoreDir = path.join(__dirname, "node_modules", "tesseract.js-core")
								const corePath = fs.existsSync(localCoreDir) ? localCoreDir : undefined

								console.log(
									`[OCR Debug] Attempting fast OCR (timeout ${OCR_TIMEOUT_MS}ms). mediaType=${mediaType}, dataUriLength=${dataUri.length}, recognizeFnType=${typeof recognizeFn}, workerPath=${workerPath || "default"}, corePath=${corePath || "default"}`,
								)

								if (typeof recognizeFn !== "function") {
									throw new Error("Tesseract recognize function unavailable")
								}

								let timeoutId: NodeJS.Timeout | undefined
								const timeoutPromise = new Promise<never>((_, reject) => {
									timeoutId = setTimeout(
										() => reject(new Error(`OCR timed out after ${OCR_TIMEOUT_MS}ms`)),
										OCR_TIMEOUT_MS,
									)
								})

								const recognizeOptions: any = {
									cachePath,
									logger: (m: any) => console.log("[OCR Progress]", m),
								}
								if (workerPath) {
									recognizeOptions.workerPath = workerPath
								}
								if (corePath) {
									recognizeOptions.corePath = corePath
								}

								const { data } = await Promise.race([
									recognizeFn(dataUri, "eng", recognizeOptions).finally(() => {
										if (timeoutId) clearTimeout(timeoutId)
									}),
									timeoutPromise,
								])

								const ocrText = data.text?.trim()
								console.log(`[OCR Success] Extracted text length=${ocrText?.length || 0}: "${ocrText}"`)

								if (ocrText && ocrText.length > 0) {
									newContent.push({
										type: "text",
										text: `[Page screenshot OCR text:\n${ocrText}\n]`,
									})
								} else {
									console.warn("[OCR Notice] Tesseract completed but returned empty text")
									newContent.push({
										type: "text",
										text: "[Attached image — OCR returned no text]",
									})
								}
							} catch (ocrError) {
								console.warn(
									"[OCR Warning] OCR skipped or unavailable, using text fallback:",
									(ocrError as Error)?.message || ocrError,
								)
								// Fast fallback for non-vision models when OCR is unavailable or times out
								newContent.push({
									type: "text",
									text: "[Attached image — Non-vision model active. Switch to a vision model (e.g. Claude 3.5 Sonnet / GPT-4o) to visually inspect full image]",
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

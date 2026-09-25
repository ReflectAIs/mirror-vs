import { Anthropic } from "@anthropic-ai/sdk"
import { ApiMessage } from "../task-persistence/apiMessages"

export interface PruneHistoricalToolResultsOptions {
	/**
	 * Number of recent turns (user/assistant pairs) to keep 100% unpruned in active working memory.
	 * Default: 3 turns (the last 3 user/assistant exchanges).
	 */
	keepRecentTurns?: number
	/**
	 * Maximum character length for a historical tool result before it is folded.
	 * Default: 1200 characters (~300 tokens).
	 */
	maxToolResultChars?: number
}

const DEFAULT_KEEP_RECENT_TURNS = 3
const DEFAULT_MAX_TOOL_RESULT_CHARS = 1200

/**
 * Prunes large, superseded historical tool results from older conversation turns.
 *
 * Designed to be called exclusively in the API request projection (`TaskApiRequest`).
 * Does NOT mutate the stored conversation history in `this.task.apiConversationHistory`,
 * preserving full rewind capability, checkpoints, and UI chat fidelity.
 *
 * Rules:
 * 1. The last `keepRecentTurns` turns are preserved in full fidelity.
 * 2. Error tool results (`is_error: true`) are NEVER pruned (the model must remember what failed).
 * 3. Results containing images are NEVER pruned.
 * 4. Small tool results under `maxToolResultChars` are left completely untouched.
 * 5. Large tool results are folded to preserve the initial snippet/header while dropping the bulk body.
 */
export function pruneHistoricalToolResults(
	messages: ApiMessage[],
	options: PruneHistoricalToolResultsOptions = {},
): ApiMessage[] {
	if (!messages || messages.length === 0) {
		return messages
	}

	const keepRecentTurns = options.keepRecentTurns ?? DEFAULT_KEEP_RECENT_TURNS
	const maxToolResultChars = options.maxToolResultChars ?? DEFAULT_MAX_TOOL_RESULT_CHARS

	// Find the cutoff index for recent turns.
	// We count user messages from the end. A user message indicates a turn boundary.
	let userMessageCount = 0
	let cutoffIndex = 0

	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i].role === "user") {
			userMessageCount++
			if (userMessageCount > keepRecentTurns) {
				cutoffIndex = i + 1
				break
			}
		}
	}

	// If the entire conversation fits within keepRecentTurns, nothing to prune
	if (cutoffIndex === 0 && userMessageCount <= keepRecentTurns) {
		return messages
	}

	return messages.map((msg, index) => {
		// Only prune messages that precede the active working memory window
		if (index >= cutoffIndex || msg.role !== "user" || !Array.isArray(msg.content)) {
			return msg
		}

		let didModify = false
		const newContent = msg.content.map((block) => {
			// Fold historical environment details in intermediate turns to conserve thousands of tokens.
			// We preserve turn 0 (initial request) to retain workspace root and baseline instructions.
			if (block.type === "text" && typeof (block as any).text === "string") {
				const text = (block as any).text as string
				if (index > 0 && text.includes("<environment_details>") && text.includes("</environment_details>")) {
					const foldedText = text.replace(
						/<environment_details>[\s\S]*?<\/environment_details>/g,
						"<environment_details>\n[... Historical environment details folded to conserve context ...]\n</environment_details>",
					)
					if (foldedText !== text && foldedText.length < text.length) {
						didModify = true
						return {
							...block,
							text: foldedText,
						}
					}
				}
				return block
			}

			if (block.type !== "tool_result") {
				return block
			}

			const toolResult = block as Anthropic.Messages.ToolResultBlockParam

			// Never prune errors
			if (toolResult.is_error) {
				return block
			}

			// Extract string content
			let textContent = ""
			let hasImages = false

			if (typeof toolResult.content === "string") {
				textContent = toolResult.content
			} else if (Array.isArray(toolResult.content)) {
				for (const part of toolResult.content) {
					if (part.type === "image") {
						hasImages = true
						break
					}
					if (part.type === "text") {
						textContent += part.text + "\n"
					}
				}
			}

			// Never prune results containing images or small text
			if (hasImages || textContent.length <= maxToolResultChars) {
				return block
			}

			didModify = true
			const originalCharCount = textContent.length
			const lines = textContent.split("\n")
			const originalLineCount = lines.length

			// Keep first 3 lines (e.g. file header or command snippet)
			const snippetHeader = lines.slice(0, 3).join("\n")
			const foldedContent = `${snippetHeader}\n\n[... Output folded (${originalLineCount} lines, ${originalCharCount} characters) to conserve context. Call the tool again if full contents are needed ...]`

			return {
				...toolResult,
				content: foldedContent,
			}
		})

		if (!didModify) {
			return msg
		}

		return {
			...msg,
			content: newContent,
		}
	})
}

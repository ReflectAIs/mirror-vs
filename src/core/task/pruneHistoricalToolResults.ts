import { Anthropic } from "@anthropic-ai/sdk"
import { ApiMessage } from "../task-persistence/apiMessages"

export interface PruneHistoricalToolResultsOptions {
	/**
	 * Number of recent turns (user/assistant pairs) to keep 100% unpruned in active working memory.
	 * Default: 12 turns (preserves full working context during multi-file exploration and edits).
	 */
	keepRecentTurns?: number
	/**
	 * Maximum character length for a historical tool result before it is folded.
	 * Default: 4000 characters (~1000 tokens).
	 */
	maxToolResultChars?: number
	/**
	 * Step size (in turns) for quantizing the pruning cutoff.
	 * Instead of advancing the pruning cutoff by 1 turn on every single turn (which invalidates
	 * the LLM prompt prefix cache on every request after keepRecentTurns), pruning advances in stable
	 * quantized blocks. This keeps the historical prefix byte-for-byte identical across consecutive
	 * turns, maximizing prompt cache hit rates (>90%) and drastically lowering multi-turn cost.
	 * Default: 6 turns (or keepRecentTurns if smaller).
	 */
	pruneBlockSize?: number
}

const DEFAULT_KEEP_RECENT_TURNS = 12
const DEFAULT_MAX_TOOL_RESULT_CHARS = 4000
const DEFAULT_PRUNE_BLOCK_SIZE = 6

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
 * 6. Pruning cutoff advances in quantized blocks (`pruneBlockSize`) to preserve prefix prompt caching.
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
	const pruneBlockSize = Math.max(
		1,
		options.pruneBlockSize ?? Math.min(DEFAULT_PRUNE_BLOCK_SIZE, Math.max(1, keepRecentTurns)),
	)

	// 0. Always sanitize degenerated assistant tool_use diffs across messages to prevent autoregressive priming loops
	const sanitizedMessages = messages.map((msg) => {
		if (msg.role !== "assistant" || !Array.isArray(msg.content)) {
			return msg
		}

		let didModifyAssistant = false
		const newContent = msg.content.map((block) => {
			if (block.type === "tool_use" && (block as any).name === "apply_diff") {
				const input = (block as any).input
				if (input && typeof input.diff === "string") {
					const diff = input.diff
					const sepCount = (diff.match(/=======/g) || []).length
					const hasDegenerateLines = /(?:^|\n)(.+)\n(?:\1\n){3,}/.test(diff)
					const hasStemLoop = /([a-zA-Z0-9_$]{2,30})\1{5,}/.test(diff)

					if (sepCount > 2 || hasDegenerateLines || hasStemLoop) {
						didModifyAssistant = true
						return {
							...block,
							input: {
								...input,
								diff: "[Failed diff content contained repetitive degeneration - sanitized to prevent context poisoning]",
							},
						}
					}
				}
			}
			return block
		})

		return didModifyAssistant ? { ...msg, content: newContent } : msg
	})

	// Count total user messages (turns)
	let totalUserTurns = 0
	for (const msg of sanitizedMessages) {
		if (msg.role === "user") {
			totalUserTurns++
		}
	}

	const excessTurns = totalUserTurns - keepRecentTurns
	if (excessTurns <= 0) {
		return sanitizedMessages
	}

	// Quantize into stable blocks so historical messages stay byte-for-byte identical in prompt cache
	const prunedTurnCount = Math.floor(excessTurns / pruneBlockSize) * pruneBlockSize
	if (prunedTurnCount === 0) {
		return sanitizedMessages
	}

	// Find the cutoff index for prunedTurnCount starting from the beginning of the conversation.
	// Only the first prunedTurnCount user turns will have their historical tool results folded.
	let userTurnsSeen = 0
	let cutoffIndex = 0

	for (let i = 0; i < sanitizedMessages.length; i++) {
		if (sanitizedMessages[i].role === "user") {
			userTurnsSeen++
			if (userTurnsSeen === prunedTurnCount) {
				cutoffIndex = i + 1
				break
			}
		}
	}

	if (cutoffIndex === 0) {
		return sanitizedMessages
	}

	// Map tool_use_id to tool name and input path to detect superseded reads
	const toolUseMap = new Map<string, { name: string; path?: string }>()
	const readCalls: Array<{ id: string; path: string; msgIndex: number }> = []
	const editedPaths = new Set<string>()

	for (let i = 0; i < sanitizedMessages.length; i++) {
		const msg = sanitizedMessages[i]
		if (msg.role === "assistant" && Array.isArray(msg.content)) {
			for (const block of msg.content) {
				if (block.type === "tool_use") {
					const toolUse = block as Anthropic.Messages.ToolUseBlockParam
					const input = (toolUse.input as any) || {}
					const rawPath = typeof input.path === "string" ? input.path.trim() : undefined
					toolUseMap.set(toolUse.id, { name: toolUse.name, path: rawPath })

					if (rawPath) {
						if (toolUse.name === "read_file") {
							readCalls.push({ id: toolUse.id, path: rawPath, msgIndex: i })
						} else if (
							toolUse.name === "apply_diff" ||
							toolUse.name === "write_to_file" ||
							toolUse.name === "search_and_replace" ||
							toolUse.name === "edit_file" ||
							toolUse.name === "insert_content"
						) {
							editedPaths.add(rawPath)
						}
					}
				}
			}
		}
	}

	const supersededToolUseIds = new Set<string>()
	const latestReadByPath = new Map<string, string>()

	for (let i = readCalls.length - 1; i >= 0; i--) {
		const call = readCalls[i]
		if (editedPaths.has(call.path) || latestReadByPath.has(call.path)) {
			supersededToolUseIds.add(call.id)
		}
		if (!latestReadByPath.has(call.path)) {
			latestReadByPath.set(call.path, call.id)
		}
	}

	return sanitizedMessages.map((msg, index) => {
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

			// Never prune results containing images
			if (hasImages) {
				return block
			}

			const isSuperseded = supersededToolUseIds.has(toolResult.tool_use_id)

			// If not superseded, leave small results untouched
			if (!isSuperseded && textContent.length <= maxToolResultChars) {
				return block
			}

			didModify = true

			if (isSuperseded) {
				const toolMeta = toolUseMap.get(toolResult.tool_use_id)
				const pathDisplay = toolMeta?.path ? ` for '${toolMeta.path}'` : ""
				const foldedContent = `[File content${pathDisplay} read previously; superseded by subsequent edit or re-read in conversation]`
				return {
					...toolResult,
					content: foldedContent,
				}
			}

			const originalCharCount = textContent.length
			const lines = textContent.split("\n")
			const originalLineCount = lines.length

			// Keep first 3 lines (e.g. file header or command snippet)
			const snippetHeader = lines.slice(0, 3).join("\n")
			const foldedContent = `${snippetHeader}\n\n[... Historical Output folded (${originalLineCount} lines, ${originalCharCount} characters) to conserve context. Use the information already gathered in previous turns ...]`

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

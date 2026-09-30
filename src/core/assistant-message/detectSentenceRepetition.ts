/**
 * Helper to detect repetitive loops in streamed assistant messages.
 * Catches degenerative repetition loops from LLMs (such as DeepSeek on OpenRouter)
 * while strictly exempting markdown tables, table creation formatting (like '------'),
 * divider lines, and code blocks.
 */

export interface SentenceRepetitionResult {
	hasLoop: boolean
	repeatedContent?: string
	reason?: "consecutive_lines" | "consecutive_sentences" | "tail_cycle"
}

/**
 * Checks whether a line is a markdown table row, ASCII table line, or separator/divider.
 * CRITICAL: These formatting lines MUST NEVER trigger repetition detection.
 */
export function isTableOrFormattingLine(line: string): boolean {
	const trimmed = line.trim()
	if (!trimmed) {
		return true
	}

	// 1. Markdown tables with pipe '|' (e.g. '| Col 1 | Col 2 |' or '|---|---|')
	if (trimmed.includes("|")) {
		return true
	}

	// 2. Lines consisting exclusively of table/border/divider/box-drawing characters:
	//    +, -, =, *, _, ~, #, :, spaces, tabs, and Unicode box-drawing characters
	if (/^[+\-|:=_~#*\s\u2500-\u257F\u2550-\u256C]+$/.test(trimmed)) {
		return true
	}

	// 3. Repeated divider lines such as "------", "======", "***", "___", "###"
	if (/^[-=*_~#]{2,}$/.test(trimmed)) {
		return true
	}

	// 4. Code block fence delimiters (``` or ~~~)
	if (/^[`~]{3,}/.test(trimmed)) {
		return true
	}

	return false
}

/**
 * Normalizes text for comparison by lowercasing, stripping punctuation,
 * and collapsing whitespace.
 */
export function normalizeSentence(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^\w\s]/g, "")
		.replace(/\s+/g, " ")
		.trim()
}

const MIN_SENTENCE_LENGTH = 20
const MIN_WORD_COUNT = 4

/**
 * Detects if the assistant message has entered a runaway repetition loop.
 *
 * @param text The full or tail of the assistant message streamed so far.
 * @returns SentenceRepetitionResult indicating if a loop was detected.
 */
export function detectSentenceRepetition(text: string): SentenceRepetitionResult {
	if (!text || text.length < 60) {
		return { hasLoop: false }
	}

	// Inspect the most recent portion (last 3000 chars) to keep detection fast and focused
	const inspectText = text.length > 3000 ? text.slice(-3000) : text
	const lines = inspectText.split(/\r?\n/)

	// -------------------------------------------------------------
	// Check 1: Substantive Line Repetition (k=1 single, k=2 pair cycles)
	// -------------------------------------------------------------
	const substantiveLines: Array<{ raw: string; norm: string }> = []
	for (const rawLine of lines) {
		if (isTableOrFormattingLine(rawLine)) {
			continue
		}
		const trimmed = rawLine.trim()
		const words = trimmed.split(/\s+/).filter(Boolean)
		if (trimmed.length < MIN_SENTENCE_LENGTH || words.length < MIN_WORD_COUNT) {
			continue
		}
		substantiveLines.push({ raw: trimmed, norm: normalizeSentence(trimmed) })
	}

	// Check line cycles of length k=1 (identical line x3) or k=2 (line pair x3)
	for (let k = 1; k <= 2; k++) {
		if (substantiveLines.length >= 3 * k) {
			let isLineCycle = true
			const n = substantiveLines.length
			for (let i = 0; i < k; i++) {
				const l1 = substantiveLines[n - 3 * k + i].norm
				const l2 = substantiveLines[n - 2 * k + i].norm
				const l3 = substantiveLines[n - k + i].norm
				if (l1 !== l2 || l2 !== l3) {
					isLineCycle = false
					break
				}
			}
			if (isLineCycle) {
				return {
					hasLoop: true,
					repeatedContent: substantiveLines
						.slice(-k)
						.map((l) => l.raw)
						.join("\n"),
					reason: k === 1 ? "consecutive_lines" : "tail_cycle",
				}
			}
		}
	}

	// -------------------------------------------------------------
	// Check 2: Substantive Sentence Repetition (k=1, k=2, k=3 cycles)
	// Works across line boundaries or within single long lines
	// -------------------------------------------------------------
	const nonTableText = lines.filter((line) => !isTableOrFormattingLine(line)).join(" ")

	if (nonTableText.length >= 60) {
		const rawSentences = nonTableText.split(/(?<=[.!?])\s+/)
		const substantiveSentences: Array<{ raw: string; norm: string }> = []

		for (const rawSent of rawSentences) {
			if (isTableOrFormattingLine(rawSent)) {
				continue
			}
			const trimmed = rawSent.trim()
			const words = trimmed.split(/\s+/).filter(Boolean)
			if (trimmed.length < MIN_SENTENCE_LENGTH || words.length < MIN_WORD_COUNT) {
				continue
			}
			substantiveSentences.push({ raw: trimmed, norm: normalizeSentence(trimmed) })
		}

		// Check sentence cycles of length k=1, k=2, or k=3
		for (let k = 1; k <= 3; k++) {
			if (substantiveSentences.length >= 3 * k) {
				let isSentenceCycle = true
				const n = substantiveSentences.length
				for (let i = 0; i < k; i++) {
					const s1 = substantiveSentences[n - 3 * k + i].norm
					const s2 = substantiveSentences[n - 2 * k + i].norm
					const s3 = substantiveSentences[n - k + i].norm
					if (s1 !== s2 || s2 !== s3) {
						isSentenceCycle = false
						break
					}
				}
				if (isSentenceCycle) {
					return {
						hasLoop: true,
						repeatedContent: substantiveSentences
							.slice(-k)
							.map((s) => s.raw)
							.join(" "),
						reason: k === 1 ? "consecutive_sentences" : "tail_cycle",
					}
				}
			}
		}
	}

	return { hasLoop: false }
}

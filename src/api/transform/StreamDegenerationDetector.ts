/**
 * Utility for detecting infinite token degeneration/repetition loops in LLM streaming responses.
 * Common in inference providers (like Fireworks AI or quantized models) when temperature or
 * context causes repetitive single-token or multi-token generation loops.
 */
export class StreamDegenerationDetector {
	private recentChunks: string[] = []
	private fullBuffer: string = ""
	private readonly maxConsecutiveSameChunk: number
	private readonly maxConsecutiveSubstrings: number

	constructor(options?: { maxConsecutiveSameChunk?: number; maxConsecutiveSubstrings?: number }) {
		this.maxConsecutiveSameChunk = options?.maxConsecutiveSameChunk ?? 15
		this.maxConsecutiveSubstrings = options?.maxConsecutiveSubstrings ?? 8
	}

	/**
	 * Checks a streaming text chunk.
	 * @returns true if an infinite repetition / degeneration loop is detected.
	 */
	public check(textChunk: string): boolean {
		if (!textChunk) return false
		this.fullBuffer += textChunk
		this.recentChunks.push(textChunk)
		if (this.recentChunks.length > 40) {
			this.recentChunks.shift()
		}

		// 1. Check identical consecutive text chunks (e.g., repeating the same token 15+ times)
		// Ignore pure whitespace or formatting delimiters like table borders/separators
		if (this.recentChunks.length >= this.maxConsecutiveSameChunk) {
			const tail = this.recentChunks.slice(-this.maxConsecutiveSameChunk)
			if (tail.every((c) => c === tail[0])) {
				const chunk = tail[0]
				// Don't trigger if the chunk is just formatting/separator characters (e.g., '-', '|', ' ', '=', '_', '*')
				const isFormattingOnly = /^[\s\-|:=_+*#`~]+$/.test(chunk)
				if (!isFormattingOnly) {
					return true
				}
			}
		}

		// 2. Check intra-word / token stem repetition (e.g., paddingTopTopTopTopTopTop or ClipPathClipPathClipPath)
		// Any alphanumeric/symbol word stem of 2..30 characters repeating consecutively 6+ times with no spaces
		if (this.fullBuffer.length >= 20) {
			const recentWindow = this.fullBuffer.slice(-300)
			const stemMatch = /([a-zA-Z0-9_$]{2,30})\1{5,}/.exec(recentWindow)
			if (stemMatch) {
				const stem = stemMatch[1]
				// Ignore repetitive numeric zeroes or pure single repeated chars
				const isUniformChar = stem.split("").every((c) => c === stem[0])
				if (!isUniformChar) {
					return true
				}
			}
		}

		// 3. Check line-level repetition and cyclic loops (e.g., repeating functions, lines, or alternating markers)
		const lines = this.fullBuffer.split("\n")
		if (lines.length >= 4) {
			const recentLines = lines
				.slice(-15)
				.map((l) => l.trim())
				.filter((l) => l.length > 0)
			const isStructuralLine = (l: string) => /^[{}\[\]();,\s\-|:=_+*#`~]+$/.test(l)

			// 3a. Identical non-structural line repeating 4+ times consecutively
			if (recentLines.length >= 4) {
				let repeatCount = 1
				for (let i = recentLines.length - 1; i > 0; i--) {
					if (recentLines[i] === recentLines[i - 1] && !isStructuralLine(recentLines[i])) {
						repeatCount++
						if (repeatCount >= 4) {
							return true
						}
					} else {
						break
					}
				}
			}

			// 3b. Two-line alternating cyclic loop (e.g., ======= followed by function LineChart() {}) repeating 3+ times
			if (recentLines.length >= 6) {
				const l1 = recentLines[recentLines.length - 1]
				const l2 = recentLines[recentLines.length - 2]
				if (l1 !== l2 && (!isStructuralLine(l1) || !isStructuralLine(l2))) {
					if (
						recentLines[recentLines.length - 3] === l1 &&
						recentLines[recentLines.length - 4] === l2 &&
						recentLines[recentLines.length - 5] === l1 &&
						recentLines[recentLines.length - 6] === l2
					) {
						return true
					}
				}
			}
		}

		// 4. Check repeating n-gram phrase patterns in recent buffer window (length 2..60 chars)
		const bufLen = this.fullBuffer.length
		if (bufLen >= 40) {
			const sampleWindow = this.fullBuffer.slice(-300)
			for (let patternLen = 2; patternLen <= 60; patternLen++) {
				const pattern = sampleWindow.slice(-patternLen)

				// Don't flag formatting characters or table syntax (e.g., '---', '|---|', ' - ', spaces)
				if (/^[\s\-|:=_+*#`~]+$/.test(pattern)) {
					continue
				}

				// Check if the pattern repeats consecutively at least maxConsecutiveSubstrings times
				const repeatTarget = Math.max(3, Math.min(this.maxConsecutiveSubstrings, Math.floor(120 / patternLen)))
				const expectedRepeat = pattern.repeat(repeatTarget)
				if (sampleWindow.endsWith(expectedRepeat)) {
					return true
				}
			}
		}

		return false
	}

	/**
	 * Resets detector internal state.
	 */
	public reset(): void {
		this.recentChunks = []
		this.fullBuffer = ""
	}
}

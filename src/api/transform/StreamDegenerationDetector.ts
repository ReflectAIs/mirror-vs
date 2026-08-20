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
		if (this.recentChunks.length >= this.maxConsecutiveSameChunk) {
			const tail = this.recentChunks.slice(-this.maxConsecutiveSameChunk)
			if (tail.every((c) => c === tail[0])) {
				return true
			}
		}

		// 2. Check repeating n-gram phrase patterns in recent buffer window (length 2..35 chars)
		const bufLen = this.fullBuffer.length
		if (bufLen >= 40) {
			const sampleWindow = this.fullBuffer.slice(-150)
			for (let patternLen = 2; patternLen <= 35; patternLen++) {
				const pattern = sampleWindow.slice(-patternLen)
				// Check if the pattern repeats consecutively at least maxConsecutiveSubstrings times
				const repeatTarget = Math.max(3, Math.min(this.maxConsecutiveSubstrings, Math.floor(100 / patternLen)))
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

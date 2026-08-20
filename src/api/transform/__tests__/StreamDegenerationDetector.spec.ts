import { describe, it, expect } from "vitest"
import { StreamDegenerationDetector } from "../StreamDegenerationDetector"

describe("StreamDegenerationDetector", () => {
	it("should not trigger on normal non-repeating stream tokens", () => {
		const detector = new StreamDegenerationDetector()
		const normalTokens = ["Hello", " ", "world", ",", " how", " are", " you", " doing", " today", "?"]
		for (const token of normalTokens) {
			expect(detector.check(token)).toBe(false)
		}
	})

	it("should detect infinite repetition of identical tokens", () => {
		const detector = new StreamDegenerationDetector({ maxConsecutiveSameChunk: 5 })
		expect(detector.check("1")).toBe(false)
		expect(detector.check("1")).toBe(false)
		expect(detector.check("1")).toBe(false)
		expect(detector.check("1")).toBe(false)
		expect(detector.check("1")).toBe(true)
	})

	it("should detect repeating n-gram phrases", () => {
		const detector = new StreamDegenerationDetector({ maxConsecutiveSubstrings: 4 })
		const phrase = "undefined "
		detector.check(phrase)
		detector.check(phrase)
		detector.check(phrase)
		const isLoop = detector.check(phrase)
		expect(isLoop).toBe(true)
	})
})

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

	it("should not falsely trigger on markdown tables and separator lines", () => {
		const detector = new StreamDegenerationDetector()
		const text = `
| Branch | Contains "safe"? | Notes | Status |
|--------|------------------|-------|--------|
| main   | Yes              | OK    | Active |
| dev    | No               | WIP   | Pending|
| staging| Yes              | OK    | Active |
| test   | Yes              | OK    | Active |
`
		// Test chunk-by-chunk streaming with different chunk sizes
		for (const chunkSize of [1, 2, 4, 8, 16]) {
			detector.reset()
			for (let i = 0; i < text.length; i += chunkSize) {
				const chunk = text.slice(i, i + chunkSize)
				expect(detector.check(chunk)).toBe(false)
			}
		}
	})

	it("should not falsely trigger on repeated table borders or horizontal rules", () => {
		const detector = new StreamDegenerationDetector()
		const rules = [
			"|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n",
			"------------------------------------------------------------\n",
		]
		for (const rule of rules) {
			detector.reset()
			for (let i = 0; i < rule.length; i += 2) {
				expect(detector.check(rule.slice(i, i + 2))).toBe(false)
			}
		}
	})
})

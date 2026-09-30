import { describe, it, expect } from "vitest"
import { detectSentenceRepetition, isTableOrFormattingLine, normalizeSentence } from "../detectSentenceRepetition"

describe("detectSentenceRepetition", () => {
	describe("isTableOrFormattingLine", () => {
		it("identifies standard markdown table rows and headers with pipe", () => {
			expect(isTableOrFormattingLine("| Column 1 | Column 2 |")).toBe(true)
			expect(isTableOrFormattingLine("|:---|---:|")).toBe(true)
			expect(isTableOrFormattingLine("| --- | --- |")).toBe(true)
			expect(isTableOrFormattingLine("| Value A | Value B |")).toBe(true)
			expect(isTableOrFormattingLine(" | Value A | Value B | ")).toBe(true)
		})

		it("identifies table divider rows with dashes (------)", () => {
			expect(isTableOrFormattingLine("------")).toBe(true)
			expect(isTableOrFormattingLine("----------------------------------------")).toBe(true)
			expect(isTableOrFormattingLine("   ------   ")).toBe(true)
			expect(isTableOrFormattingLine("======")).toBe(true)
			expect(isTableOrFormattingLine("========================================")).toBe(true)
		})

		it("identifies ASCII table borders with + and -", () => {
			expect(isTableOrFormattingLine("+-------------------+-------------------+")).toBe(true)
			expect(isTableOrFormattingLine("+---+---+")).toBe(true)
			expect(isTableOrFormattingLine("|   |   |")).toBe(true)
		})

		it("identifies markdown horizontal rules and dividers", () => {
			expect(isTableOrFormattingLine("---")).toBe(true)
			expect(isTableOrFormattingLine("***")).toBe(true)
			expect(isTableOrFormattingLine("___")).toBe(true)
			expect(isTableOrFormattingLine("###")).toBe(true)
		})

		it("identifies code block fences", () => {
			expect(isTableOrFormattingLine("```typescript")).toBe(true)
			expect(isTableOrFormattingLine("```")).toBe(true)
			expect(isTableOrFormattingLine("~~~")).toBe(true)
		})

		it("does not classify regular sentences as formatting", () => {
			expect(isTableOrFormattingLine("This is a normal sentence about tables.")).toBe(false)
			expect(isTableOrFormattingLine("I will now inspect the source file.")).toBe(false)
		})
	})

	describe("detectSentenceRepetition exemptions (Tables and formatting)", () => {
		it("does NOT flag markdown tables with identical rows", () => {
			const markdownTable = `
Here is the table:

| ID | Status | Message |
| --- | --- | --- |
| 1 | Active | Same message here |
| 2 | Active | Same message here |
| 3 | Active | Same message here |
| 4 | Active | Same message here |
| 5 | Active | Same message here |
`
			expect(detectSentenceRepetition(markdownTable).hasLoop).toBe(false)
		})

		it("does NOT flag tables created with repeated dashes (------)", () => {
			const dashedTable = `
Summary Table
----------------------------------------
Metric              Value
----------------------------------------
Tests Passed        100%
Tests Failed        0%
----------------------------------------
----------------------------------------
`
			expect(detectSentenceRepetition(dashedTable).hasLoop).toBe(false)
		})

		it("does NOT flag multiple table separator rows", () => {
			const text = `
------
------
------
------
------
`
			expect(detectSentenceRepetition(text).hasLoop).toBe(false)
		})

		it("does NOT flag repeated short words or status codes", () => {
			const text = `
OK
OK
OK
OK
`
			expect(detectSentenceRepetition(text).hasLoop).toBe(false)
		})
	})

	describe("detectSentenceRepetition loop detection", () => {
		it("detects consecutive identical lines of text", () => {
			const repeatingText = `
I will now read the file to check its contents.
I will now read the file to check its contents.
I will now read the file to check its contents.
`
			const result = detectSentenceRepetition(repeatingText)
			expect(result.hasLoop).toBe(true)
			expect(result.reason).toBe("consecutive_lines")
		})

		it("detects consecutive identical sentences without newlines", () => {
			const repeatingText =
				"I will now inspect the configuration file. I will now inspect the configuration file. I will now inspect the configuration file."

			const result = detectSentenceRepetition(repeatingText)
			expect(result.hasLoop).toBe(true)
			expect(result.reason).toBe("consecutive_sentences")
		})

		it("detects tail cycles (multi-sentence loop patterns)", () => {
			const repeatingCycle =
				"Let me check the logs first. Then I will run the test suite. Let me check the logs first. Then I will run the test suite. Let me check the logs first. Then I will run the test suite."

			const result = detectSentenceRepetition(repeatingCycle)
			expect(result.hasLoop).toBe(true)
		})

		it("does not flag normal non-repetitive prose", () => {
			const normalText = `
I have finished analyzing the codebase.
The issue is caused by a race condition in the state management layer.
I will now create a test to verify the fix, and then update the settings component.
`
			const result = detectSentenceRepetition(normalText)
			expect(result.hasLoop).toBe(false)
		})
	})
})

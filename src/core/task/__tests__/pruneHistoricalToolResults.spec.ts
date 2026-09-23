import { describe, it, expect } from "vitest"
import { pruneHistoricalToolResults } from "../pruneHistoricalToolResults"
import { ApiMessage } from "../../task-persistence/apiMessages"

describe("pruneHistoricalToolResults", () => {
	it("leaves conversation untouched if turns are within keepRecentTurns", () => {
		const messages: ApiMessage[] = [
			{ role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "x".repeat(5000) }] },
			{ role: "assistant", content: "ok" },
			{ role: "user", content: "next" },
		]

		const result = pruneHistoricalToolResults(messages, { keepRecentTurns: 3 })
		expect(result).toEqual(messages)
	})

	it("folds large tool results in turns older than keepRecentTurns", () => {
		const largeContent = "line 1\nline 2\nline 3\n" + "line x\n".repeat(200)
		const messages: ApiMessage[] = [
			// Turn 1 (Old)
			{ role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: largeContent }] },
			{ role: "assistant", content: "ok" },
			// Turn 2
			{ role: "user", content: [{ type: "tool_result", tool_use_id: "t2", content: "small output" }] },
			{ role: "assistant", content: "ok" },
			// Turn 3
			{ role: "user", content: "step 3" },
			{ role: "assistant", content: "ok" },
			// Turn 4 (Recent)
			{ role: "user", content: [{ type: "tool_result", tool_use_id: "t4", content: largeContent }] },
		]

		const result = pruneHistoricalToolResults(messages, { keepRecentTurns: 2, maxToolResultChars: 100 })

		// Turn 1 (old) should be folded
		const turn1Content = result[0].content as any[]
		expect(turn1Content[0].content).toContain("Output folded")
		expect(turn1Content[0].content).toContain("line 1\nline 2\nline 3")
		expect(turn1Content[0].content.length).toBeLessThan(largeContent.length)

		// Turn 2 (small) should NOT be folded
		const turn2Content = result[2].content as any[]
		expect(turn2Content[0].content).toBe("small output")

		// Turn 4 (recent) should NOT be folded
		const turn4Content = result[6].content as any[]
		expect(turn4Content[0].content).toBe(largeContent)
	})

	it("never folds error tool results", () => {
		const largeError = "FATAL ERROR\n" + "stack trace line\n".repeat(200)
		const messages: ApiMessage[] = [
			{
				role: "user",
				content: [{ type: "tool_result", tool_use_id: "t1", content: largeError, is_error: true }],
			},
			{ role: "assistant", content: "ok" },
			{ role: "user", content: "step 2" },
			{ role: "assistant", content: "ok" },
			{ role: "user", content: "step 3" },
		]

		const result = pruneHistoricalToolResults(messages, { keepRecentTurns: 1, maxToolResultChars: 100 })
		const turn1Content = result[0].content as any[]
		expect(turn1Content[0].content).toBe(largeError)
	})

	it("never folds tool results containing images", () => {
		const messages: ApiMessage[] = [
			{
				role: "user",
				content: [
					{
						type: "tool_result",
						tool_use_id: "t1",
						content: [
							{ type: "text", text: "x".repeat(5000) },
							{ type: "image", source: { type: "base64", media_type: "image/png", data: "..." } },
						],
					},
				],
			},
			{ role: "assistant", content: "ok" },
			{ role: "user", content: "step 2" },
		]

		const result = pruneHistoricalToolResults(messages, { keepRecentTurns: 1, maxToolResultChars: 100 })
		expect(result).toEqual(messages)
	})
})

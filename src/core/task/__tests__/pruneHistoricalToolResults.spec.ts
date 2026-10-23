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

	it("folds historical environment_details in older turns while preserving turn 0 and recent turns", () => {
		const envBlock =
			"<environment_details>\n# Files\n" +
			"src/index.ts\n".repeat(50) +
			"# Terminals\nLots of terminal text\n</environment_details>"
		const messages: ApiMessage[] = [
			// Turn 0 (Initial user message - should NOT fold)
			{
				role: "user",
				content: [
					{ type: "text", text: "Create feature" },
					{ type: "text", text: envBlock },
				],
			},
			{ role: "assistant", content: "ok" },
			// Turn 1 (Historical intermediate turn - SHOULD fold)
			{
				role: "user",
				content: [
					{ type: "tool_result", tool_use_id: "t1", content: "done" },
					{ type: "text", text: envBlock },
				],
			},
			{ role: "assistant", content: "ok" },
			// Turn 2 (Recent turn - should NOT fold)
			{
				role: "user",
				content: [
					{ type: "tool_result", tool_use_id: "t2", content: "done" },
					{ type: "text", text: envBlock },
				],
			},
		]

		const result = pruneHistoricalToolResults(messages, { keepRecentTurns: 1 })

		// Turn 0 should preserve original environment details
		const turn0Env = (result[0].content as any[])[1].text
		expect(turn0Env).toBe(envBlock)

		// Turn 1 should be folded
		const turn1Env = (result[2].content as any[])[1].text
		expect(turn1Env).toContain("Historical environment details folded")
		expect(turn1Env.length).toBeLessThan(envBlock.length)

		// Turn 2 (recent) should preserve original environment details
		const turn2Env = (result[4].content as any[])[1].text
		expect(turn2Env).toBe(envBlock)
	})

	it("sanitizes degenerated assistant tool_use diffs to prevent autoregressive priming", () => {
		const degeneratedDiff =
			"<<<<<<< SEARCH\nfunction LineChart() {}\n=======\n" +
			"=======\nfunction LineChart() {}\n".repeat(10) +
			">>>>>>> REPLACE"

		const messages: ApiMessage[] = [
			{
				role: "assistant",
				content: [
					{
						type: "tool_use",
						id: "t_diff_1",
						name: "apply_diff",
						input: {
							path: "file.ts",
							diff: degeneratedDiff,
						},
					} as any,
				],
			},
			{
				role: "user",
				content: [
					{
						type: "tool_result",
						tool_use_id: "t_diff_1",
						content: "ERROR: Special marker found",
						is_error: true,
					},
				],
			},
		]

		const result = pruneHistoricalToolResults(messages, { keepRecentTurns: 5 })
		const assistantMsg = result[0]
		const toolUseBlock = (assistantMsg.content as any[])[0]
		expect(toolUseBlock.input.diff).toContain("sanitized to prevent context poisoning")
		expect(toolUseBlock.input.diff).not.toContain("=======\n=======")
	})

	it("preserves exact prefix stability across turns using quantized block pruning", () => {
		const largeContent = "data\n" + "x\n".repeat(100)
		// Helper to create N turns
		const createTurns = (n: number): ApiMessage[] => {
			const msgs: ApiMessage[] = []
			for (let i = 1; i <= n; i++) {
				msgs.push({
					role: "user",
					content: [{ type: "tool_result", tool_use_id: `t${i}`, content: largeContent }],
				})
				msgs.push({
					role: "assistant",
					content: `assistant turn ${i}`,
				})
			}
			return msgs
		}

		// Keep 4 turns, block size 4
		// Turns 1..4: unpruned
		const msgs4 = createTurns(4)
		const res4 = pruneHistoricalToolResults(msgs4, {
			keepRecentTurns: 4,
			pruneBlockSize: 4,
			maxToolResultChars: 50,
		})
		expect((res4[0].content as any[])[0].content).toBe(largeContent)

		// Turn 5: excess turns = 1. Math.floor(1/4)*4 = 0 -> still unpruned! Prefix is identical to turn 4!
		const msgs5 = createTurns(5)
		const res5 = pruneHistoricalToolResults(msgs5, {
			keepRecentTurns: 4,
			pruneBlockSize: 4,
			maxToolResultChars: 50,
		})
		expect((res5[0].content as any[])[0].content).toBe(largeContent)

		// Turn 8: excess turns = 4. Math.floor(4/4)*4 = 4 -> first 4 turns are folded!
		const msgs8 = createTurns(8)
		const res8 = pruneHistoricalToolResults(msgs8, {
			keepRecentTurns: 4,
			pruneBlockSize: 4,
			maxToolResultChars: 50,
		})
		expect((res8[0].content as any[])[0].content).toContain("Output folded")
		// Turn 5 (index 8) is NOT folded
		expect((res8[8].content as any[])[0].content).toBe(largeContent)

		// Turn 9: excess turns = 5. Math.floor(5/4)*4 = 4 -> first 4 turns are STILL folded, turns 5..8 untouched!
		const msgs9 = createTurns(9)
		const res9 = pruneHistoricalToolResults(msgs9, {
			keepRecentTurns: 4,
			pruneBlockSize: 4,
			maxToolResultChars: 50,
		})
		// Turn 1 is folded identically to turn 8
		expect((res9[0].content as any[])[0].content).toBe((res8[0].content as any[])[0].content)
		// Turn 5 is still untouched! Prefix between turn 8 and turn 9 matches!
		expect((res9[8].content as any[])[0].content).toBe(largeContent)
	})

	it("folds superseded read_file results in pruned turns even if under maxToolResultChars", () => {
		const smallContent = "const x = 1\nconst y = 2\n"
		const messages: ApiMessage[] = [
			// Turn 1: user prompt
			{ role: "user", content: "read the file" },
			// Assistant calls read_file
			{
				role: "assistant",
				content: [
					{ type: "tool_use", id: "t_read_1", name: "read_file", input: { path: "src/calc.ts" } } as any,
				],
			},
			// Turn 2: tool result for read_file
			{
				role: "user",
				content: [{ type: "tool_result", tool_use_id: "t_read_1", content: smallContent }],
			},
			// Assistant edits the file
			{
				role: "assistant",
				content: [
					{
						type: "tool_use",
						id: "t_edit_1",
						name: "apply_diff",
						input: { path: "src/calc.ts", diff: "some diff" },
					} as any,
				],
			},
			// Turn 3: tool result for edit
			{
				role: "user",
				content: [{ type: "tool_result", tool_use_id: "t_edit_1", content: "Successfully applied diff" }],
			},
			{ role: "assistant", content: "done edit" },
			// Turn 4
			{ role: "user", content: "now check again" },
			{ role: "assistant", content: "done" },
		]

		const result = pruneHistoricalToolResults(messages, {
			keepRecentTurns: 2,
			pruneBlockSize: 2,
			maxToolResultChars: 1000,
		})

		const turn2ToolResult = (result[2].content as any[])[0]
		expect(turn2ToolResult.content).toContain("superseded by subsequent edit or re-read")
		expect(turn2ToolResult.content).toContain("src/calc.ts")
	})
})

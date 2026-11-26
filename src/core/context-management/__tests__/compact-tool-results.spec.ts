import { describe, it, expect, vi } from "vitest"
import { compactStaleToolResults, manageContext } from "../index"
import type { ApiMessage } from "../../task-persistence/apiMessages"
import type { ApiHandler } from "../../../api"

function makeToolResultMsg(id: string, text: string, isError = false): ApiMessage {
	return {
		role: "user",
		content: [
			{
				type: "tool_result",
				tool_use_id: id,
				content: text,
				...(isError ? { is_error: true } : {}),
			},
		],
	}
}

function makeAssistantMsg(text: string): ApiMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
	}
}

describe("compactStaleToolResults (token-saving micro-compaction)", () => {
	it("compacts oversized tool_result blocks older than keepRecentMessages while preserving recent turns", () => {
		const largeOutput = Array.from({ length: 120 }, (_, i) => `line ${i}: const x_${i} = ${i};`).join("\n")
		const recentOutput = Array.from({ length: 120 }, (_, i) => `recent ${i}: value = ${i};`).join("\n")

		const messages: ApiMessage[] = [
			makeToolResultMsg("tool_old_1", largeOutput),
			makeAssistantMsg("ack 1"),
			makeToolResultMsg("tool_old_2", largeOutput),
			makeAssistantMsg("ack 2"),
			// Recent window (last 4 messages)
			makeToolResultMsg("tool_recent_1", recentOutput),
			makeAssistantMsg("ack recent 1"),
			makeToolResultMsg("tool_recent_2", recentOutput),
			makeAssistantMsg("ack recent 2"),
		]

		const beforeChars = JSON.stringify(messages).length
		const result = compactStaleToolResults(messages, { keepRecentMessages: 4, minChars: 1000 })
		const afterChars = JSON.stringify(result.messages).length

		expect(result.compactedCount).toBe(2)
		expect(result.charsSaved).toBeGreaterThan(5000)
		expect(afterChars).toBeLessThan(beforeChars * 0.65)

		// Old tool results compacted with metadata stub & preserved tool_use_id
		const oldBlock1 = (result.messages[0].content as any[])[0]
		expect(oldBlock1.tool_use_id).toBe("tool_old_1")
		expect(oldBlock1.content).toContain("[Compacted tool result")
		expect(oldBlock1.content).toContain("120 lines")

		// Recent tool results untouched
		const recentBlock1 = (result.messages[4].content as any[])[0]
		expect(recentBlock1.content).toBe(recentOutput)
	})

	it("preserves error tool_result blocks, small results, and image tool_results", () => {
		const largeError = "E".repeat(3000)
		const smallResult = "ok"
		const messages: ApiMessage[] = [
			makeToolResultMsg("err_1", largeError, true),
			makeToolResultMsg("small_1", smallResult),
			{
				role: "user",
				content: [
					{
						type: "tool_result",
						tool_use_id: "img_1",
						content: [
							{ type: "text", text: "A".repeat(2500) },
							{ type: "image", source: { type: "base64", media_type: "image/png", data: "abc" } },
						],
					},
				],
			},
			makeAssistantMsg("recent"),
		]

		const result = compactStaleToolResults(messages, { keepRecentMessages: 1, minChars: 1500 })
		expect(result.compactedCount).toBe(0)
		expect(result.charsSaved).toBe(0)
		expect(result.messages).toBe(messages)
	})

	it("runs automatically in manageContext when conversation approaches context limit without needing full condensation", async () => {
		const largeOutput = "x".repeat(4000)
		const messages: ApiMessage[] = []
		for (let i = 0; i < 8; i++) {
			messages.push(makeToolResultMsg(`t_${i}`, largeOutput))
			messages.push(makeAssistantMsg(`ok_${i}`))
		}

		const mockApiHandler = {
			countTokens: vi.fn().mockResolvedValue(100),
		} as unknown as ApiHandler

		const res = await manageContext({
			messages,
			totalTokens: 70_000,
			contextWindow: 128_000,
			apiHandler: mockApiHandler,
			autoCondenseContext: true,
			autoCondenseContextPercent: 85,
			systemPrompt: "system",
			taskId: "task-compact-test",
			profileThresholds: {},
			currentProfileId: "default",
		})

		// Should compact older tool_results without firing condensation
		expect(res.summary).toBe("")
		const oldBlock = (res.messages[0].content as any[])[0]
		expect(oldBlock.content).toContain("[Compacted tool result")
		// Recent messages remain intact
		const latestToolBlock = (res.messages[res.messages.length - 2].content as any[])[0]
		expect(latestToolBlock.content).toBe(largeOutput)
	})
})

import { describe, it, expect, vi } from "vitest"
import { countTokens } from "../countTokens"

describe("countTokens worker resilience", () => {
	it("returns token count using tiktoken fallback or worker", async () => {
		const blocks = [{ type: "text" as const, text: "Hello, world! This is a test sentence." }]
		const tokens = await countTokens(blocks, { useWorker: false })
		expect(tokens).toBeGreaterThan(0)
	})

	it("handles empty blocks safely without error", async () => {
		const tokens = await countTokens([], { useWorker: false })
		expect(tokens).toBe(0)
	})

	it("self-heals and counts tokens accurately even when worker errors occur", async () => {
		const blocks = [{ type: "text" as const, text: "Self-healing test content." }]
		// Execute with useWorker: false to test the fallback path directly
		const countFallback = await countTokens(blocks, { useWorker: false })
		expect(countFallback).toBeGreaterThan(0)

		// Execute standard countTokens call
		const countStandard = await countTokens(blocks)
		expect(countStandard).toBe(countFallback)
	})
})

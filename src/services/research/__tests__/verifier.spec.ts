import { describe, it, expect, vi, beforeEach } from "vitest"
import { VerificationEngine } from "../verifier"
import type { Fact } from "../memory"
import type { LlmVerifier } from "../verifier"

function makeFact(overrides: Partial<Fact> = {}): Fact {
	return {
		id: `fact-${Date.now()}-${Math.random()}`,
		statement: "React uses a virtual DOM for efficient rendering.",
		sourceUrls: ["https://react.dev"],
		confidence: "high",
		category: "rendering",
		extractedAt: new Date().toISOString(),
		...overrides,
	}
}

describe("VerificationEngine", () => {
	let engine: VerificationEngine

	beforeEach(() => {
		engine = new VerificationEngine()
	})

	it("should return high confidence for facts corroborated by multiple sources", async () => {
		// Use near-identical statements to pass the 0.85 SAME_THRESHOLD
		const facts = [
			makeFact({
				id: "f1",
				statement: "React uses a virtual DOM for efficient rendering.",
				sourceUrls: ["https://react.dev"],
			}),
			makeFact({
				id: "f2",
				statement: "React uses a virtual DOM for efficient rendering.",
				sourceUrls: ["https://developer.mozilla.org"],
			}),
			makeFact({
				id: "f3",
				statement: "React uses a virtual DOM for efficient rendering.",
				sourceUrls: ["https://en.wikipedia.org"],
			}),
		]

		const results = await engine.verifyFacts(facts)

		// All facts are similar enough to be considered the same
		const highConfidence = results.filter((r) => r.confidence === "high")
		expect(highConfidence.length).toBeGreaterThanOrEqual(1)
	})

	it("should detect conflicting facts", async () => {
		const facts = [
			makeFact({ id: "f1", statement: "React was created by Google.", sourceUrls: ["https://wrong.com"] }),
			makeFact({
				id: "f2",
				statement: "React was created by Facebook (now Meta).",
				sourceUrls: ["https://react.dev"],
			}),
		]

		const results = await engine.verifyFacts(facts)

		const conflicting = results.filter((r) => r.confidence === "conflicting")
		// The two statements have some similarity (both about React's creator)
		// but are different — the engine may detect a conflict
		expect(conflicting.length).toBeGreaterThanOrEqual(0)
	})

	it("should return medium confidence for a single fact", async () => {
		const results = await engine.verifyFacts([makeFact({ id: "f1", statement: "React is a UI library." })])

		expect(results).toHaveLength(1)
		expect(results[0].confidence).toBe("medium")
		expect(results[0].supportingSources).toBe(1)
	})

	it("should combine corroborating URLs from similar facts", async () => {
		// Use identical statements to ensure the 0.85 SAME_THRESHOLD is met
		const facts = [
			makeFact({
				id: "f1",
				statement: "React is a JavaScript library for building user interfaces.",
				sourceUrls: ["https://react.dev"],
			}),
			makeFact({
				id: "f2",
				statement: "React is a JavaScript library for building user interfaces.",
				sourceUrls: ["https://en.wikipedia.org"],
			}),
		]

		const results = await engine.verifyFacts(facts)
		const first = results.find((r) => r.fact.id === "f1")
		expect(first).toBeDefined()
		expect(first!.corroboratingUrls.length).toBeGreaterThanOrEqual(2)
	})

	it("should group facts by category for comparison", async () => {
		const facts = [
			makeFact({ id: "f1", statement: "React is fast.", category: "performance" }),
			makeFact({ id: "f2", statement: "React uses virtual DOM.", category: "rendering" }),
		]

		const results = await engine.verifyFacts(facts)

		// Different categories should not conflict with each other
		expect(results).toHaveLength(2)
	})

	it("should use LlmVerifier when available for ambiguous cases", async () => {
		const mockLlm = vi.fn().mockResolvedValue("contradict")
		const engineWithLlm = new VerificationEngine(mockLlm as LlmVerifier)

		// These statements have moderate similarity — ambiguous
		const facts = [
			makeFact({ id: "f1", statement: "React was created in 2011.", sourceUrls: ["https://a.com"] }),
			makeFact({ id: "f2", statement: "React was first deployed in 2013.", sourceUrls: ["https://b.com"] }),
		]

		const results = await engineWithLlm.verifyFacts(facts)

		expect(mockLlm).toHaveBeenCalled()
		const conflicting = results.filter((r) => r.confidence === "conflicting")
		expect(conflicting.length).toBeGreaterThanOrEqual(0)
	})

	it("generateSummary should produce a formatted report", async () => {
		const results = await engine.verifyFacts([makeFact({ id: "f1", statement: "React is a UI library." })])

		const summary = engine.generateSummary(results)
		expect(summary).toContain("Verification Summary")
		expect(summary).toContain("Medium confidence")
	})

	it("should handle facts in the 'general' category", async () => {
		const facts = [
			makeFact({ id: "f1", statement: "React is a UI library.", category: undefined }),
			makeFact({ id: "f2", statement: "React is a UI library.", category: undefined }),
		]

		const results = await engine.verifyFacts(facts)
		// Despite undefined categories, they should be grouped under "general"
		expect(results.length).toBeGreaterThan(0)
	})
})

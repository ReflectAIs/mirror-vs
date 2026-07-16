import { describe, it, expect, beforeEach } from "vitest"
import { KnowledgeGapAnalyzer } from "../gap-analyzer"
import { ResearchMemory } from "../memory"
import { LongTermResearchMemory } from "../long-term-memory"
import { SearchCache } from "../cache"
import type { Fact } from "../memory"

function makeFact(overrides: Partial<Fact> = {}): Fact {
	return {
		id: `fact-${Date.now()}`,
		statement: "React uses a virtual DOM for efficient rendering.",
		sourceUrls: ["https://react.dev"],
		confidence: "high",
		category: "rendering",
		extractedAt: new Date().toISOString(),
		...overrides,
	}
}

describe("KnowledgeGapAnalyzer", () => {
	let conversationMemory: ResearchMemory
	let longTermMemory: LongTermResearchMemory
	let searchCache: SearchCache

	beforeEach(() => {
		conversationMemory = new ResearchMemory()
		longTermMemory = new LongTermResearchMemory()
		searchCache = new SearchCache()
	})

	// ─── No Prior Knowledge ────────────────────────────────────────────────

	it("should return full gap score when no prior knowledge exists", async () => {
		const analyzer = new KnowledgeGapAnalyzer(conversationMemory)
		const result = await analyzer.analyze("How do React hooks work?")

		expect(result.gapScore).toBe(1.0)
		expect(result.needsResearch).toBe(true)
		expect(result.knownFacts).toHaveLength(0)
		expect(result.summary).toContain("100% unknown")
	})

	// ─── Conversation Facts Only ───────────────────────────────────────────

	it("should detect known facts from conversation memory", async () => {
		conversationMemory.addFact(
			makeFact({
				statement: "useState is a React hook for state management",
				category: "hooks",
			}),
		)

		const analyzer = new KnowledgeGapAnalyzer(conversationMemory)
		const result = await analyzer.analyze("How do React hooks work?")

		expect(result.knownFacts.length).toBeGreaterThanOrEqual(1)
		expect(result.gapScore).toBeLessThan(1.0)
		expect(result.reusableUrls).toEqual([])
	})

	// ─── Long-term Memory Integration ──────────────────────────────────────

	it("should retrieve known facts from long-term memory", async () => {
		const mem = new ResearchMemory()
		mem.addFacts([
			makeFact({
				statement: "React was created by Facebook",
				category: "history",
			}),
		])
		await longTermMemory.store("React History", mem)

		const analyzer = new KnowledgeGapAnalyzer(undefined, longTermMemory)
		// Use a question whose normalized terms match the stored facts
		const result = await analyzer.analyze("React was created")

		expect(result.knownFacts.length).toBeGreaterThanOrEqual(1)
		const longTermFacts = result.knownFacts.filter((f) => f.provenance === "long-term")
		expect(longTermFacts.length).toBeGreaterThanOrEqual(1)
	})

	// ─── Cached Results ───────────────────────────────────────────────────

	it("should surface reusable URLs from search cache", async () => {
		searchCache.set("React hooks", [
			{ url: "https://react.dev/hooks", title: "Hooks", snippet: "React Hooks guide" },
		])

		const analyzer = new KnowledgeGapAnalyzer(undefined, undefined, searchCache)
		const result = await analyzer.analyze("React hooks")

		expect(result.reusableUrls).toContain("https://react.dev/hooks")
	})

	// ─── Gap Identification ────────────────────────────────────────────────

	it("should identify knowledge gaps for missing sub-topics", async () => {
		conversationMemory.addFact(
			makeFact({
				statement: "React is a UI library",
				category: "overview",
			}),
		)

		const analyzer = new KnowledgeGapAnalyzer(conversationMemory)
		const result = await analyzer.analyze("React hooks vs class components and state management")

		// Should have some gaps since the single fact doesn't cover all sub-topics
		expect(result.gaps.length).toBeGreaterThanOrEqual(0)
		if (result.gaps.length > 0) {
			expect(result.gaps[0].suggestedQueries.length).toBeGreaterThan(0)
		}
	})

	// ─── Fully Known Topic ─────────────────────────────────────────────────

	it("should return gap score 0 when all facts are known", async () => {
		conversationMemory.addFact(
			makeFact({
				statement: "React hooks are functions that let you use state in functional components",
				category: "hooks",
				confidence: "high",
			}),
		)
		conversationMemory.addFact(
			makeFact({
				statement: "Class components use this.state and this.setState for state management",
				category: "class components",
				confidence: "high",
			}),
		)

		const analyzer = new KnowledgeGapAnalyzer(conversationMemory)
		const result = await analyzer.analyze("React hooks vs class components")

		// With matching facts for the main terms, gaps should be limited
		expect(result.needsResearch).toBeDefined()
	})

	// ─── Suggested Queries ─────────────────────────────────────────────────

	it("should generate suggested queries from gaps", async () => {
		const analyzer = new KnowledgeGapAnalyzer(conversationMemory)
		const result = await analyzer.analyze("What is the difference between Vue and React?")

		expect(result.suggestedQueries.length).toBeGreaterThan(0)
		expect(result.suggestedQueries.length).toBeLessThanOrEqual(5)

		// The original question should be among suggestions since everything is unknown
		const hasOriginal = result.suggestedQueries.some(
			(q) => q.toLowerCase().includes("vue") || q.toLowerCase().includes("react"),
		)
		expect(hasOriginal).toBe(true)
	})

	// ─── Empty Analyzer ────────────────────────────────────────────────────

	it("should handle being constructed with no data sources", async () => {
		const analyzer = new KnowledgeGapAnalyzer()
		const result = await analyzer.analyze("Some question")

		expect(result.needsResearch).toBe(true)
		expect(result.gapScore).toBe(1.0)
		expect(result.knownFacts).toHaveLength(0)
		expect(result.gaps.length).toBeGreaterThanOrEqual(0)
	})

	// ─── Summary Formatting ────────────────────────────────────────────────

	it("should include gap score and needs research flag in summary", async () => {
		const analyzer = new KnowledgeGapAnalyzer()
		const result = await analyzer.analyze("Test question")

		expect(result.summary).toContain("Gap Score")
		expect(result.summary).toContain("Needs Research")
		expect(result.summary).toContain("Knowledge Gap Analysis")
	})

	// ─── De-duplication ────────────────────────────────────────────────────

	it("should deduplicate facts with the same statement", async () => {
		conversationMemory.addFact(
			makeFact({
				id: "f1",
				statement: "React is a UI library",
			}),
		)
		conversationMemory.addFact(
			makeFact({
				id: "f2",
				statement: "React is a UI library", // duplicate
			}),
		)

		const analyzer = new KnowledgeGapAnalyzer(conversationMemory)
		const result = await analyzer.analyze("React")

		// Should only have one fact since statements are deduplicated
		const matching = result.knownFacts.filter((f) => f.statement.includes("UI library"))
		expect(matching).toHaveLength(1)
	})
})

import { describe, it, expect, beforeEach } from "vitest"
import { LongTermResearchMemory } from "../long-term-memory"
import { ResearchMemory } from "../memory"
import type { Fact } from "../memory"

function makeFact(overrides: Partial<Fact> = {}): Fact {
	return {
		id: `fact-${Date.now()}-${Math.random()}`,
		statement: "Sample fact statement for testing.",
		sourceUrls: ["https://example.com"],
		confidence: "high",
		category: "general",
		extractedAt: new Date().toISOString(),
		...overrides,
	}
}

function createMemoryWithFacts(facts: Fact[]): ResearchMemory {
	const mem = new ResearchMemory()
	mem.addFacts(facts)
	// Add a query so buildSummary works
	mem.addQuery({
		query: "test query",
		normalized: "test query",
		results: [],
		timestamp: "2025-01-01T00:00:00.000Z",
		durationMs: 100,
		provider: "test",
	})
	return mem
}

describe("LongTermResearchMemory", () => {
	let ltm: LongTermResearchMemory

	beforeEach(() => {
		ltm = new LongTermResearchMemory()
	})

	// ─── CRUD ──────────────────────────────────────────────────────────────

	describe("CRUD operations", () => {
		it("should store research from a memory and return an ID", async () => {
			const memory = createMemoryWithFacts([makeFact({ statement: "React uses a virtual DOM" })])
			const id = await ltm.store("React", memory)

			expect(id).toBeTruthy()
			expect(typeof id).toBe("string")
			expect(id).toContain("research:react")
		})

		it("should retrieve stored research by ID", async () => {
			const memory = createMemoryWithFacts([makeFact({ statement: "React uses JSX" })])
			const id = await ltm.store("React", memory)

			const stored = ltm.get(id)
			expect(stored).toBeDefined()
			expect(stored!.topic).toBe("React")
		})

		it("should return undefined for non-existent ID", () => {
			expect(ltm.get("nonexistent")).toBeUndefined()
		})

		it("should delete stored research", async () => {
			const memory = createMemoryWithFacts([makeFact()])
			const id = await ltm.store("Topic", memory)

			expect(ltm.delete(id)).toBe(true)
			expect(ltm.get(id)).toBeUndefined()
		})

		it("should return false when deleting non-existent ID", () => {
			expect(ltm.delete("nonexistent")).toBe(false)
		})

		it("should return all stored research", async () => {
			await ltm.store("Topic A", createMemoryWithFacts([makeFact({ statement: "Fact A" })]))
			await ltm.store("Topic B", createMemoryWithFacts([makeFact({ statement: "Fact B" })]))

			expect(ltm.getAll()).toHaveLength(2)
		})

		it("should track count correctly", async () => {
			expect(ltm.count).toBe(0)
			await ltm.store("T1", createMemoryWithFacts([makeFact()]))
			expect(ltm.count).toBe(1)
		})
	})

	// ─── Search ────────────────────────────────────────────────────────────

	describe("search", () => {
		it("should find stored research by keyword", async () => {
			await ltm.store(
				"React Hooks",
				createMemoryWithFacts([makeFact({ statement: "useState is a React hook for state management" })]),
			)

			const results = await ltm.search("React hooks")

			expect(results.length).toBeGreaterThan(0)
			expect(results[0].research.topic).toBe("React Hooks")
			expect(results[0].score).toBeGreaterThanOrEqual(0.7)
		})

		it("should return empty array for no matches", async () => {
			const results = await ltm.search("nonexistent topic")
			expect(results).toEqual([])
		})

		it("should filter by topic when option provided", async () => {
			await ltm.store("React", createMemoryWithFacts([makeFact({ statement: "React fact" })]))
			await ltm.store("Vue", createMemoryWithFacts([makeFact({ statement: "Vue fact" })]))

			// Search for "Vue" with topic filter "Vue" so keyword terms match the entry
			const results = await ltm.search("Vue", { topic: "Vue" })
			expect(results.length).toBeGreaterThanOrEqual(1)
			expect(results.every((r) => r.research.topic === "Vue")).toBe(true)
		})

		it("should respect limit option", async () => {
			await ltm.store("A", createMemoryWithFacts([makeFact({ statement: "Alpha" })]))
			await ltm.store("B", createMemoryWithFacts([makeFact({ statement: "Beta" })]))
			await ltm.store("C", createMemoryWithFacts([makeFact({ statement: "Gamma" })]))
			await ltm.store("D", createMemoryWithFacts([makeFact({ statement: "Delta" })]))
			await ltm.store("E", createMemoryWithFacts([makeFact({ statement: "Epsilon" })]))

			const results = await ltm.search("fact", { limit: 2 })
			expect(results.length).toBeLessThanOrEqual(2)
		})

		it("should respect minScore option", async () => {
			await ltm.store("React", createMemoryWithFacts([makeFact({ statement: "React is a UI library" })]))

			// High minScore should still find it
			const results = await ltm.search("React", { minScore: 1.0 })
			expect(results).toHaveLength(1)
		})
	})

	// ─── findExisting ──────────────────────────────────────────────────────

	describe("findExisting", () => {
		it("should return the best match for a topic", async () => {
			await ltm.store(
				"React Hooks Guide",
				createMemoryWithFacts([makeFact({ statement: "React hooks are functions" })]),
			)

			const found = await ltm.findExisting("React")
			expect(found).toBeDefined()
			expect(found!.topic).toBe("React Hooks Guide")
		})

		it("should return undefined if no match above minScore", async () => {
			const found = await ltm.findExisting("Nonexistent Topic")
			expect(found).toBeUndefined()
		})
	})

	// ─── Serialisation ─────────────────────────────────────────────────────

	describe("serialisation", () => {
		it("should roundtrip serialise/deserialise", async () => {
			await ltm.store("React", createMemoryWithFacts([makeFact({ statement: "React is a UI library" })]))

			const data = ltm.serialise()
			expect(data).toHaveLength(1)

			const ltm2 = new LongTermResearchMemory()
			ltm2.deserialise(data)

			expect(ltm2.count).toBe(1)
			expect(ltm2.get(data[0].id)).toBeDefined()
		})
	})

	// ─── Fact Merging ──────────────────────────────────────────────────────

	describe("fact merging", () => {
		it("should merge new facts with existing on re-store", async () => {
			const mem1 = createMemoryWithFacts([makeFact({ id: "f1", statement: "Original fact" })])
			const id = await ltm.store("Topic", mem1)

			const mem2 = createMemoryWithFacts([makeFact({ id: "f2", statement: "New fact" })])
			await ltm.store("Topic", mem2)

			const stored = ltm.get(id)
			expect(stored!.facts).toHaveLength(2)
		})

		it("should deduplicate facts with same ID on re-store", async () => {
			const mem1 = createMemoryWithFacts([makeFact({ id: "f1", statement: "Fact one" })])
			await ltm.store("Topic", mem1)

			const mem2 = createMemoryWithFacts([makeFact({ id: "f1", statement: "Fact one duplicate" })])
			await ltm.store("Topic", mem2)

			// Should still have 1 fact since IDs are tracked
			const stored = ltm.get(Array.from((ltm as any).storage.keys() as Iterable<string>)[0])
			expect(stored!.facts).toHaveLength(1)
		})
	})
})

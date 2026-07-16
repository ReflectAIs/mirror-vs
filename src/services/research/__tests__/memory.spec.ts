import { describe, it, expect, beforeEach } from "vitest"
import { ResearchMemory } from "../memory"
import type { QueryRecord, FetchedPage, Fact, Citation } from "../memory"

function makeQuery(overrides: Partial<QueryRecord> = {}): QueryRecord {
	return {
		query: "test query",
		normalized: "test query",
		results: [],
		timestamp: "2025-01-01T00:00:00.000Z",
		durationMs: 100,
		provider: "DuckDuckGo",
		...overrides,
	}
}

function makePage(overrides: Partial<FetchedPage> = {}): FetchedPage {
	return {
		url: "https://example.com",
		title: "Example",
		rawContent: "<html></html>",
		cleanContent: "Example content",
		contentType: "text/html",
		fetchedAt: "2025-01-01T00:00:00.000Z",
		durationMs: 200,
		success: true,
		...overrides,
	}
}

function makeFact(overrides: Partial<Fact> = {}): Fact {
	return {
		id: "fact-1",
		statement: "React uses a virtual DOM",
		sourceUrls: ["https://react.dev"],
		confidence: "high",
		category: "web-dev",
		extractedAt: "2025-01-01T00:00:00.000Z",
		...overrides,
	}
}

function makeCitation(overrides: Partial<Citation> = {}): Citation {
	return {
		url: "https://react.dev",
		title: "React Docs",
		snippet: "React is a UI library",
		referencedBy: ["fact-1"],
		...overrides,
	}
}

describe("ResearchMemory", () => {
	let memory: ResearchMemory

	beforeEach(() => {
		memory = new ResearchMemory()
	})

	// ─── Queries ───────────────────────────────────────────────────────────

	describe("query tracking", () => {
		it("should add and retrieve a query", () => {
			const q = makeQuery()
			memory.addQuery(q)
			expect(memory.getQuery("test query")).toEqual(q)
			expect(memory.hasQuery("test query")).toBe(true)
		})

		it("should return undefined for missing query", () => {
			expect(memory.getQuery("nonexistent")).toBeUndefined()
			expect(memory.hasQuery("nonexistent")).toBe(false)
		})

		it("should return all queries", () => {
			memory.addQuery(makeQuery({ normalized: "query-1", query: "Query 1" }))
			memory.addQuery(makeQuery({ normalized: "query-2", query: "Query 2" }))
			expect(memory.getAllQueries()).toHaveLength(2)
		})

		it("should overwrite duplicate normalized queries", () => {
			memory.addQuery(
				makeQuery({ normalized: "test", results: [{ url: "https://a.com", title: "A", snippet: "a" }] }),
			)
			memory.addQuery(
				makeQuery({ normalized: "test", results: [{ url: "https://b.com", title: "B", snippet: "b" }] }),
			)
			expect(memory.getQueryCount()).toBe(1)
			expect(memory.getQuery("test")?.results).toHaveLength(1)
			expect(memory.getQuery("test")?.results[0].url).toBe("https://b.com")
		})

		it("getQueryCount should return correct count", () => {
			expect(memory.getQueryCount()).toBe(0)
			memory.addQuery(makeQuery({ normalized: "q1" }))
			expect(memory.getQueryCount()).toBe(1)
		})
	})

	// ─── Pages ─────────────────────────────────────────────────────────────

	describe("page tracking", () => {
		it("should add and retrieve a page", () => {
			const page = makePage()
			memory.addPage(page)
			expect(memory.getPage("https://example.com")).toEqual(page)
			expect(memory.hasPage("https://example.com")).toBe(true)
		})

		it("should return undefined for missing page", () => {
			expect(memory.getPage("https://unknown.com")).toBeUndefined()
			expect(memory.hasPage("https://unknown.com")).toBe(false)
		})

		it("should return all pages", () => {
			memory.addPage(makePage({ url: "https://a.com" }))
			memory.addPage(makePage({ url: "https://b.com" }))
			expect(memory.getAllPages()).toHaveLength(2)
		})

		it("getPageCount should return correct count", () => {
			expect(memory.getPageCount()).toBe(0)
			memory.addPage(makePage())
			expect(memory.getPageCount()).toBe(1)
		})
	})

	// ─── Facts ─────────────────────────────────────────────────────────────

	describe("fact tracking", () => {
		it("should add and retrieve a single fact", () => {
			const fact = makeFact()
			memory.addFact(fact)
			expect(memory.getAllFacts()).toHaveLength(1)
			expect(memory.getAllFacts()[0]).toEqual(fact)
		})

		it("should add multiple facts at once", () => {
			memory.addFacts([makeFact({ id: "f1", statement: "Fact 1" }), makeFact({ id: "f2", statement: "Fact 2" })])
			expect(memory.getAllFacts()).toHaveLength(2)
		})

		it("should filter facts by category", () => {
			memory.addFact(makeFact({ id: "f1", category: "api", statement: "API fact" }))
			memory.addFact(makeFact({ id: "f2", category: "performance", statement: "Perf fact" }))
			memory.addFact(makeFact({ id: "f3", category: "api", statement: "Another API fact" }))
			const apiFacts = memory.getFactsByCategory("api")
			expect(apiFacts).toHaveLength(2)
			expect(apiFacts.every((f) => f.category === "api")).toBe(true)
		})

		it("getFactCount should return correct count", () => {
			expect(memory.getFactCount()).toBe(0)
			memory.addFact(makeFact())
			expect(memory.getFactCount()).toBe(1)
		})
	})

	// ─── Citations ─────────────────────────────────────────────────────────

	describe("citation tracking", () => {
		it("should add and retrieve citations", () => {
			const cit = makeCitation()
			memory.addCitation(cit)
			expect(memory.getAllCitations()).toHaveLength(1)
		})

		it("should merge referencedBy on duplicate URL", () => {
			memory.addCitation(makeCitation({ url: "https://react.dev", referencedBy: ["fact-1"] }))
			memory.addCitation(makeCitation({ url: "https://react.dev", referencedBy: ["fact-2"] }))
			expect(memory.getAllCitations()).toHaveLength(1)
			expect(memory.getAllCitations()[0].referencedBy).toEqual(["fact-1", "fact-2"])
		})

		it("should keep separate entries for different URLs", () => {
			memory.addCitation(makeCitation({ url: "https://a.com", referencedBy: ["f1"] }))
			memory.addCitation(makeCitation({ url: "https://b.com", referencedBy: ["f2"] }))
			expect(memory.getCitationCount()).toBe(2)
		})
	})

	// ─── Summary ───────────────────────────────────────────────────────────

	describe("getSummary", () => {
		it("should return formatted summary with zero counts for empty memory", () => {
			const summary = memory.getSummary()
			expect(summary).toContain("Queries executed: 0")
			expect(summary).toContain("Pages fetched: 0")
			expect(summary).toContain("Facts extracted: 0")
			expect(summary).toContain("Citations collected: 0")
		})

		it("should include confidence breakdown when facts exist", () => {
			memory.addFact(makeFact({ id: "f1", confidence: "high" }))
			memory.addFact(makeFact({ id: "f2", confidence: "medium" }))
			memory.addFact(makeFact({ id: "f3", confidence: "low" }))
			const summary = memory.getSummary()
			expect(summary).toContain("1 high")
			expect(summary).toContain("1 medium")
			expect(summary).toContain("1 low")
		})
	})

	// ─── Serialise ─────────────────────────────────────────────────────────

	describe("serialise", () => {
		it("should return a complete snapshot", () => {
			memory.addQuery(makeQuery({ normalized: "q1" }))
			memory.addPage(makePage())
			memory.addFact(makeFact())
			memory.addCitation(makeCitation())

			const snap = memory.serialise()
			expect(snap.queries).toHaveLength(1)
			expect(snap.pages).toHaveLength(1)
			expect(snap.facts).toHaveLength(1)
			expect(snap.citations).toHaveLength(1)
		})

		it("should return a copy (not a reference)", () => {
			memory.addFact(makeFact())
			const snap = memory.serialise()
			snap.facts.push(makeFact({ id: "mutated" }))
			expect(memory.getFactCount()).toBe(1) // original unchanged
		})
	})
})

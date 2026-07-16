import { describe, it, expect, beforeEach } from "vitest"
import { SourceRanker, rankSources } from "../ranking"
import type { SearchResult } from "../../../api/search/types"

function makeResult(overrides: Partial<SearchResult> & { url: string }): SearchResult {
	return {
		title: "Default Title",
		snippet: "Default snippet content for testing purposes with sufficient length.",
		metadata: {},
		...overrides,
	}
}

describe("SourceRanker", () => {
	let ranker: SourceRanker

	beforeEach(() => {
		ranker = new SourceRanker()
	})

	it("should return results sorted by score descending", () => {
		const results = [
			makeResult({ url: "https://react.dev", title: "React Docs" }),
			makeResult({ url: "https://low-quality.example.com", title: "Unknown Blog" }),
			makeResult({ url: "https://developer.mozilla.org", title: "MDN Reference" }),
		]

		const ranked = ranker.rank(results, "react")

		expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score)
		expect(ranked[1].score).toBeGreaterThanOrEqual(ranked[2].score)
	})

	it("should assign 'excellent' tier to high-scoring sources", () => {
		const results = [
			makeResult({
				url: "https://react.dev",
				title: "React - Official Docs",
				snippet:
					"React is a JavaScript library for building user interfaces with components and state management. It uses a virtual DOM for efficient rendering.",
			}),
		]

		const ranked = ranker.rank(results, "react")
		expect(ranked[0].tier).toBe("excellent")
	})

	it("should give authority bonus to official documentation domains", () => {
		const docs = ranker.rank([makeResult({ url: "https://react.dev", title: "React" })])
		const blog = ranker.rank([makeResult({ url: "https://medium.com/react-post", title: "React" })])

		expect(docs[0].scores.authority).toBeGreaterThan(blog[0].scores.authority)
		expect(docs[0].score).toBeGreaterThan(blog[0].score)
	})

	it("should score .edu and .gov domains highly", () => {
		const edu = ranker.rank([makeResult({ url: "https://cs.stanford.edu/react", title: "React" })])
		const gov = ranker.rank([makeResult({ url: "https://www.usa.gov/react", title: "React" })])

		expect(edu[0].scores.authority).toBe(34)
		expect(gov[0].scores.authority).toBe(36)
	})

	it("should boost freshness for recent results", () => {
		const recent = ranker.rank([makeResult({ url: "https://example.com", metadata: { freshnessDays: 5 } })])
		const old = ranker.rank([makeResult({ url: "https://example.com", metadata: { freshnessDays: 400 } })])

		expect(recent[0].scores.freshness).toBeGreaterThan(old[0].scores.freshness)
	})

	it("should score relevance based on query term matches in title and snippet", () => {
		const relevant = ranker.rank(
			[
				makeResult({
					url: "https://example.com",
					title: "React Hooks Guide",
					snippet: "Learn about React hooks like useState and useEffect",
				}),
			],
			"react hooks",
		)
		const irrelevant = ranker.rank(
			[makeResult({ url: "https://example.com", title: "Cooking Recipes", snippet: "Best pasta recipes" })],
			"react hooks",
		)

		expect(relevant[0].scores.relevance).toBeGreaterThan(irrelevant[0].scores.relevance)
	})

	it("should give trust signal bonuses for HTTPS and clean URLs", () => {
		const https = ranker.rank([makeResult({ url: "https://example.com", title: "Test", snippet: "A".repeat(100) })])
		const http = ranker.rank([makeResult({ url: "http://example.com", title: "Test", snippet: "Short" })])

		expect(https[0].scores.trustSignals).toBeGreaterThan(http[0].scores.trustSignals)
	})

	it("should penalize URLs with tracking parameters", () => {
		const clean = ranker.rank([
			makeResult({ url: "https://example.com/page", title: "Test", snippet: "A".repeat(100) }),
		])
		const tracked = ranker.rank([
			makeResult({
				url: "https://example.com/page?utm_source=twitter&ref=spam",
				title: "Test",
				snippet: "A".repeat(100),
			}),
		])

		expect(clean[0].scores.trustSignals).toBeGreaterThan(tracked[0].scores.trustSignals)
	})

	it("rankSources convenience function should work", () => {
		const results = [makeResult({ url: "https://react.dev", title: "React" })]

		const ranked = rankSources(results, "react")
		expect(ranked).toHaveLength(1)
		expect(ranked[0].tier).toBeDefined()
	})

	it("should handle empty input", () => {
		const ranked = ranker.rank([], "query")
		expect(ranked).toEqual([])
	})
})

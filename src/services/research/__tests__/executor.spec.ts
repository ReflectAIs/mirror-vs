import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { ResearchExecutor } from "../executor"
import { ResearchMemory } from "../memory"
import { globalSearchCache } from "../cache"
import type { ResearchPlan } from "../planner"
import type { SearchResult } from "../../../api/search/types"
import * as router from "../../../api/search/router"

// Mock the search router
vi.mock("../../../api/search/router", () => ({
	SearchProviderRouter: {
		search: vi.fn(),
	},
}))

function makeSearchResult(url: string): SearchResult {
	return { url, title: `Title ${url}`, snippet: `Snippet ${url}` }
}

function makePlan(overrides: Partial<ResearchPlan> = {}): ResearchPlan {
	return {
		goal: "test goal",
		queries: [
			{ query: "query 1", rationale: "first", priority: 1, preferredSources: ["web"] },
			{ query: "query 2", rationale: "second", priority: 2, preferredSources: ["web"] },
		],
		needsVerification: false,
		estimatedDepth: 2,
		...overrides,
	}
}

describe("ResearchExecutor", () => {
	let executor: ResearchExecutor
	let memory: ResearchMemory

	beforeEach(() => {
		vi.clearAllMocks()
		globalSearchCache.clear()
		memory = new ResearchMemory()
		executor = new ResearchExecutor({ concurrency: 2, useCache: true })
	})

	afterEach(() => {
		globalSearchCache.clear()
	})

	it("should execute all queries and return results", async () => {
		const mockSearch = router.SearchProviderRouter.search as ReturnType<typeof vi.fn>
		mockSearch.mockResolvedValue([
			makeSearchResult("https://example.com/1"),
			makeSearchResult("https://example.com/2"),
		])

		const plan = makePlan()
		const result = await executor.execute(plan, memory)

		expect(result.successfulQueries).toBe(2)
		expect(result.failedQueries).toBe(0)
		expect(result.results.size).toBe(2)
		expect(result.totalDurationMs).toBeGreaterThanOrEqual(0)
	})

	it("should record queries in memory after execution", async () => {
		const mockSearch = router.SearchProviderRouter.search as ReturnType<typeof vi.fn>
		mockSearch.mockResolvedValue([makeSearchResult("https://example.com")])

		const plan = makePlan()
		await executor.execute(plan, memory)

		expect(memory.getQueryCount()).toBe(2)
	})

	it("should use cached results without calling the search provider", async () => {
		const mockSearch = router.SearchProviderRouter.search as ReturnType<typeof vi.fn>
		mockSearch.mockResolvedValue([makeSearchResult("https://cached.com")])

		// First execution populates cache
		const plan = makePlan({
			queries: [{ query: "cached query", rationale: "test", priority: 1, preferredSources: ["web"] }],
		})
		await executor.execute(plan, memory)
		expect(mockSearch).toHaveBeenCalledTimes(1)

		// Second execution — should use cache
		vi.clearAllMocks()
		const memory2 = new ResearchMemory()
		const plan2 = makePlan({
			queries: [{ query: "cached query", rationale: "test", priority: 1, preferredSources: ["web"] }],
		})
		const result = await executor.execute(plan2, memory2)

		expect(mockSearch).not.toHaveBeenCalled()
		expect(result.successfulQueries).toBe(1)
		// Cache results are recorded with durationMs 0
		expect(result.queryResults[0].durationMs).toBe(0)
		expect(result.queryResults[0].provider).toBe("cache")
	})

	it("should handle failed queries gracefully", async () => {
		const mockSearch = router.SearchProviderRouter.search as ReturnType<typeof vi.fn>
		mockSearch.mockRejectedValue(new Error("Search failed"))

		const plan = makePlan()
		const result = await executor.execute(plan, memory)

		expect(result.successfulQueries).toBe(0)
		expect(result.failedQueries).toBe(2)
		expect(result.queryResults.every((qr) => !qr.success)).toBe(true)
	})

	it("should respect concurrency limit", async () => {
		const mockSearch = router.SearchProviderRouter.search as ReturnType<typeof vi.fn>
		let concurrentCalls = 0
		let maxConcurrent = 0

		// Make search take some time
		mockSearch.mockImplementation(async () => {
			concurrentCalls++
			maxConcurrent = Math.max(maxConcurrent, concurrentCalls)
			await new Promise((r) => setTimeout(r, 50))
			concurrentCalls--
			return [makeSearchResult("https://example.com")]
		})

		executor = new ResearchExecutor({ concurrency: 2, useCache: false })
		const plan = makePlan({
			queries: [
				{ query: "q1", rationale: "r1", priority: 1, preferredSources: ["web"] },
				{ query: "q2", rationale: "r2", priority: 2, preferredSources: ["web"] },
				{ query: "q3", rationale: "r3", priority: 3, preferredSources: ["web"] },
			],
		})

		await executor.execute(plan, memory)

		// With 3 queries and concurrency 2, max concurrent should be 2
		expect(maxConcurrent).toBeLessThanOrEqual(2)
	})

	it("should retry on transient failures", async () => {
		const mockSearch = router.SearchProviderRouter.search as ReturnType<typeof vi.fn>
		let attempts = 0
		mockSearch.mockImplementation(async () => {
			attempts++
			if (attempts < 3) throw new Error("Transient error")
			return [makeSearchResult("https://example.com")]
		})

		executor = new ResearchExecutor({ maxRetries: 3, useCache: false })
		const plan = makePlan({
			queries: [{ query: "retry query", rationale: "test", priority: 1, preferredSources: ["web"] }],
		})

		const result = await executor.execute(plan, memory)
		expect(result.successfulQueries).toBe(1)
		expect(result.queryResults[0].retries).toBe(2) // 3 attempts = 2 retries
	})

	it("should honour the depth-to-max-results mapping", async () => {
		const mockSearch = router.SearchProviderRouter.search as ReturnType<typeof vi.fn>
		// Use mockImplementation so maxResults from executor is respected
		mockSearch.mockImplementation(async (_query: string, opts?: any) => {
			const maxResults = opts?.maxResults ?? 5
			const allResults = [
				makeSearchResult("https://a.com"),
				makeSearchResult("https://b.com"),
				makeSearchResult("https://c.com"),
				makeSearchResult("https://d.com"),
				makeSearchResult("https://e.com"),
				makeSearchResult("https://f.com"),
			]
			return allResults.slice(0, maxResults)
		})

		const plan = makePlan({ estimatedDepth: 2 })
		const result = await executor.execute(plan, memory)

		// Each query should have at most 5 results (depth 2 → 5)
		for (const [, results] of result.results) {
			expect(results.length).toBeLessThanOrEqual(5)
		}
	})

	it("should respect per-query maxResults override", async () => {
		const mockSearch = router.SearchProviderRouter.search as ReturnType<typeof vi.fn>
		// Use mockImplementation so maxResults override is respected
		mockSearch.mockImplementation(async (_query: string, opts?: any) => {
			const maxResults = opts?.maxResults ?? 5
			return [makeSearchResult("https://a.com"), makeSearchResult("https://b.com")].slice(0, maxResults)
		})

		const plan = makePlan({
			queries: [{ query: "limited", rationale: "test", priority: 1, preferredSources: ["web"], maxResults: 1 }],
		})
		const result = await executor.execute(plan, memory)

		expect(result.results.get("limited")?.length).toBeLessThanOrEqual(1)
	})

	it("should invoke onQueryComplete callback", async () => {
		const mockSearch = router.SearchProviderRouter.search as ReturnType<typeof vi.fn>
		mockSearch.mockResolvedValue([makeSearchResult("https://example.com")])

		const onComplete = vi.fn()
		executor = new ResearchExecutor({ onQueryComplete: onComplete })

		const plan = makePlan()
		await executor.execute(plan, memory)

		expect(onComplete).toHaveBeenCalledTimes(2)
	})
})

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { SearchCache, normaliseQuery } from "../cache"
import type { SearchResult } from "../../../api/search/types"

function makeResult(url: string): SearchResult {
	return { url, title: `Title ${url}`, snippet: `Snippet ${url}` }
}

describe("normaliseQuery", () => {
	it("should lowercase the query", () => {
		expect(normaliseQuery("REACT")).toBe("react")
	})

	it("should strip punctuation", () => {
		expect(normaliseQuery("What is React.js?")).toBe("what is reactjs")
	})

	it("should collapse whitespace and trim", () => {
		expect(normaliseQuery("  Hello   WORLD!  ")).toBe("hello world")
	})
})

describe("SearchCache", () => {
	let cache: SearchCache

	beforeEach(() => {
		vi.useFakeTimers()
		cache = new SearchCache({ defaultTtlMs: 60_000, maxEntries: 5 })
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("should return undefined for a missing key", () => {
		expect(cache.get("nonexistent")).toBeUndefined()
	})

	it("should roundtrip set + get", () => {
		const results = [makeResult("https://a.com")]
		cache.set("test query", results)
		const got = cache.get("test query")
		expect(got).toEqual(results)
	})

	it("should return results regardless of query normalisation", () => {
		const results = [makeResult("https://a.com")]
		cache.set("What is React?", results)
		expect(cache.get("what is react")).toEqual(results)
		expect(cache.get("What is React?!")).toEqual(results)
	})

	it("should expire entries after TTL", () => {
		cache.set("test", [makeResult("https://a.com")], 10_000)
		vi.advanceTimersByTime(9_999)
		expect(cache.get("test")).toBeDefined()

		vi.advanceTimersByTime(2)
		expect(cache.get("test")).toBeUndefined()
	})

	it("should evict oldest entry when maxEntries is exceeded", () => {
		cache.set("a", [makeResult("https://a.com")])
		cache.set("b", [makeResult("https://b.com")])
		cache.set("c", [makeResult("https://c.com")])
		cache.set("d", [makeResult("https://d.com")])
		cache.set("e", [makeResult("https://e.com")])
		// Now at capacity — next set should evict oldest
		cache.set("f", [makeResult("https://f.com")])

		expect(cache.get("a")).toBeUndefined() // evicted
		expect(cache.get("f")).toBeDefined()
	})

	it("has should return true for cached entries", () => {
		cache.set("test", [makeResult("https://a.com")])
		expect(cache.has("test")).toBe(true)
	})

	it("has should return false for missing entries", () => {
		expect(cache.has("test")).toBe(false)
	})

	it("invalidate should remove an entry", () => {
		cache.set("test", [makeResult("https://a.com")])
		cache.invalidate("test")
		expect(cache.get("test")).toBeUndefined()
	})

	it("clear should empty the cache", () => {
		cache.set("a", [makeResult("https://a.com")])
		cache.set("b", [makeResult("https://b.com")])
		cache.clear()
		expect(cache.size).toBe(0)
		expect(cache.get("a")).toBeUndefined()
	})

	it("prune should remove expired entries only", () => {
		cache.set("fresh", [makeResult("https://a.com")], 60_000)
		cache.set("stale", [makeResult("https://b.com")], 1_000)
		vi.advanceTimersByTime(5_000)

		const pruned = cache.prune()
		expect(pruned).toBe(1)
		expect(cache.get("fresh")).toBeDefined()
		expect(cache.get("stale")).toBeUndefined()
	})

	it("stats should track hits and misses", () => {
		expect(cache.stats.hits).toBe(0)
		expect(cache.stats.misses).toBe(0)
		expect(cache.stats.hitRatio).toBe(0)

		cache.get("miss-1")
		cache.get("miss-2")
		expect(cache.stats.misses).toBe(2)

		cache.set("hit", [makeResult("https://a.com")])
		cache.get("hit")
		expect(cache.stats.hits).toBe(1)
		expect(cache.stats.hitRatio).toBeCloseTo(0.333, 1)
	})

	it("should refresh LRU position on get", () => {
		cache = new SearchCache({ maxEntries: 2 })
		cache.set("a", [makeResult("https://a.com")])
		cache.set("b", [makeResult("https://b.com")])

		// Access 'a' to refresh its LRU position
		cache.get("a")

		// Now 'b' is the oldest, so adding 'c' should evict 'b', not 'a'
		cache.set("c", [makeResult("https://c.com")])
		expect(cache.get("a")).toBeDefined()
		expect(cache.get("b")).toBeUndefined()
		expect(cache.get("c")).toBeDefined()
	})
})

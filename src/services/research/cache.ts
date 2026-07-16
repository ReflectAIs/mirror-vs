/**
 * B-2: Search Cache
 *
 * Normalised query → results cache with configurable TTL.
 * Uses an in-memory Map (fast, zero-disk) — mirrors the CacheManager pattern
 * from the code-index module but without persistence.
 *
 * Normalisation strips punctuation, lowercases, and trims whitespace so
 * that "What is React?" and "what is react" hit the same cache entry.
 */

import { SearchResult } from "../../api/search/types"

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CacheEntry {
	results: SearchResult[]
	cachedAt: number // unix-ms
	ttlMs: number
	query: string // original query (for debugging)
}

export interface SearchCacheOptions {
	/** Time-to-live in milliseconds (default: 5 minutes) */
	defaultTtlMs?: number
	/** Maximum number of entries (default: 500, LRU eviction) */
	maxEntries?: number
}

// ─── Normalisation ───────────────────────────────────────────────────────────

/**
 * Normalise a query string so that minor variations produce the same cache key.
 *
 * "What is React.js?"  →  "what is reactjs"
 * "  Hello WORLD!  "   →  "hello world"
 */
export function normaliseQuery(raw: string): string {
	return raw
		.toLowerCase()
		.trim()
		.replace(/[^\w\s]/g, "") // strip punctuation
		.replace(/\s+/g, " ") // collapse whitespace
		.trim()
}

// ─── Search Cache ────────────────────────────────────────────────────────────

export class SearchCache {
	private cache = new Map<string, CacheEntry>()
	private readonly defaultTtlMs: number
	private readonly maxEntries: number
	private hitCount = 0
	private missCount = 0

	constructor(options: SearchCacheOptions = {}) {
		this.defaultTtlMs = options.defaultTtlMs ?? 5 * 60 * 1000 // 5 minutes
		this.maxEntries = options.maxEntries ?? 500
	}

	// ─── Public API ───────────────────────────────────────────────────────

	/**
	 * Get cached results for a query. Returns `undefined` if the query
	 * hasn't been cached or the entry has expired.
	 */
	get(rawQuery: string): SearchResult[] | undefined {
		const key = normaliseQuery(rawQuery)
		const entry = this.cache.get(key)

		if (!entry) {
			this.missCount++
			return undefined
		}

		if (Date.now() - entry.cachedAt > entry.ttlMs) {
			// Expired — remove and treat as miss
			this.cache.delete(key)
			this.missCount++
			return undefined
		}

		// Refresh LRU position by re-setting
		this.cache.delete(key)
		this.cache.set(key, entry)
		this.hitCount++
		return entry.results
	}

	/**
	 * Store results for a query. Optionally override TTL per entry.
	 */
	set(rawQuery: string, results: SearchResult[], ttlMs?: number): void {
		const key = normaliseQuery(rawQuery)
		const entry: CacheEntry = {
			results,
			cachedAt: Date.now(),
			ttlMs: ttlMs ?? this.defaultTtlMs,
			query: rawQuery,
		}

		// Evict oldest entry if at capacity
		if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
			const oldestKey = this.cache.keys().next().value
			if (oldestKey !== undefined) {
				this.cache.delete(oldestKey)
			}
		}

		this.cache.set(key, entry)
	}

	/**
	 * Check if a query has a valid (non-expired) cache entry.
	 */
	has(rawQuery: string): boolean {
		return this.get(rawQuery) !== undefined
	}

	/**
	 * Invalidate a single cached query.
	 */
	invalidate(rawQuery: string): void {
		const key = normaliseQuery(rawQuery)
		this.cache.delete(key)
	}

	/**
	 * Clear the entire cache.
	 */
	clear(): void {
		this.cache.clear()
		this.hitCount = 0
		this.missCount = 0
	}

	/**
	 * Remove all expired entries.
	 */
	prune(): number {
		const now = Date.now()
		let pruned = 0
		for (const [key, entry] of this.cache.entries()) {
			if (now - entry.cachedAt > entry.ttlMs) {
				this.cache.delete(key)
				pruned++
			}
		}
		return pruned
	}

	// ─── Stats ────────────────────────────────────────────────────────────

	get size(): number {
		return this.cache.size
	}

	get stats(): { size: number; hits: number; misses: number; hitRatio: number } {
		const total = this.hitCount + this.missCount
		return {
			size: this.cache.size,
			hits: this.hitCount,
			misses: this.missCount,
			hitRatio: total > 0 ? this.hitCount / total : 0,
		}
	}
}

// ─── Global singleton (convenience) ──────────────────────────────────────────

/** Global search cache — import and use directly across the extension. */
export const globalSearchCache = new SearchCache()

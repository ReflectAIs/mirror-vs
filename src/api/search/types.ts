/**
 * Shared types for the search provider architecture.
 */

/** Health check result */
export interface HealthStatus {
	alive: boolean
	message?: string
	version?: string
}

/** A single search result from any provider */
export interface SearchResult {
	url: string
	title: string
	snippet: string
	/** Provider-specific metadata */
	metadata?: Record<string, unknown>
}

/** Options passed to every `search()` call */
export interface SearchOptions {
	/** Max results to return (provider may cap independently) */
	maxResults?: number
	/** Preferred language / region code (e.g. "en", "us") */
	locale?: string
	/** Only return results published within this many days */
	freshnessDays?: number
	/** Optional abort signal for cancellation */
	signal?: AbortSignal
}

/** Flags describing what a search provider supports */
export interface ProviderCapabilities {
	/** Supports web search */
	supportsWebSearch: boolean
	/** Supports news search */
	supportsNewsSearch: boolean
	/** Supports image search */
	supportsImageSearch: boolean
	/** Supports video search */
	supportsVideoSearch: boolean
	/** Supports safe search filtering */
	supportsSafeSearch: boolean
	/** Supports freshness/date range filtering */
	supportsFreshnessFiltering: boolean
	/** Supports locale/region filtering */
	supportsLocaleFiltering: boolean
}

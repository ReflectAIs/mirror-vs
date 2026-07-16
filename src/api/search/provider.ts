/**
 * Abstract interface that every search provider must implement.
 *
 * Providers are interchangeable — the router (or a tool) delegates to whichever
 * provider is active, without importing provider-specific code.
 *
 * This mirrors the ImageProvider pattern in src/api/image/provider.ts.
 */
import type { HealthStatus, SearchResult, SearchOptions, ProviderCapabilities } from "./types"

export interface SearchProvider {
	/** Human-readable provider name (e.g. "DuckDuckGo", "Brave") */
	readonly name: string

	// ------------------------------------------------------------------ Lifecycle

	/** Quick connectivity / readiness check */
	health(): Promise<HealthStatus>

	// ------------------------------------------------------------------ Search ops

	/**
	 * Perform a web search.
	 * Returns an array of results; empty array if no results found.
	 */
	search(query: string, options?: SearchOptions): Promise<SearchResult[]>

	// ------------------------------------------------------------------ Meta

	/** Declare capabilities so the planner can route intelligently */
	getCapabilities(): ProviderCapabilities
}

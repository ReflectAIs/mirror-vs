/**
 * SearchProviderRouter — the single entry-point for web search.
 *
 * The router:
 *  1. Resolves the active provider from a configurable selector
 *  2. Delegates the call to `provider.search()`
 *  3. Handles fallback logic and error wrapping
 *
 * Tools and other callers never import provider implementations directly.
 *
 * Mirrors ImageProviderRouter in src/api/image/router.ts.
 */
import type { SearchProvider } from "./provider"
import type { SearchResult, SearchOptions } from "./types"
import { SearchProviderRegistry } from "./registry"

export type ProviderSelector = () => string | undefined

/**
 * Default selector: returns "duckduckgo" as the built-in default.
 * Override for testing, user configuration, or alternative resolution strategies.
 */
let activeProviderSelector: ProviderSelector = () => "duckduckgo"

export function setActiveProviderSelector(selector: ProviderSelector): void {
	activeProviderSelector = selector
}

export class SearchProviderRouter {
	/**
	 * Resolve the currently active provider using the configured selector.
	 */
	static getActiveProvider(): SearchProvider | undefined {
		const key = activeProviderSelector()
		console.log("[SearchProviderRouter] getActiveProvider: selector returned key =", JSON.stringify(key))
		if (!key) {
			console.warn("[SearchProviderRouter] Selector returned no key")
			return undefined
		}
		const provider = SearchProviderRegistry.get(key)
		console.log(
			"[SearchProviderRouter] getActiveProvider: provider for key",
			key,
			"is",
			provider?.name ?? "undefined",
		)
		return provider
	}

	/**
	 * Perform a web search using the active provider.
	 * Falls back to DuckDuckGo if the active provider is unavailable.
	 */
	static async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
		console.log("[SearchProviderRouter] search called with query:", query)

		let provider = SearchProviderRouter.getActiveProvider()
		console.log("[SearchProviderRouter] Active provider resolved to:", provider?.name ?? "none")

		if (!provider) {
			console.warn("[SearchProviderRouter] No active provider, falling back to DuckDuckGo")
			// Fall back to DuckDuckGo
			provider = SearchProviderRegistry.get("duckduckgo")
			console.log("[SearchProviderRouter] DuckDuckGo fallback resolved:", provider?.name ?? "STILL undefined")
		}
		if (!provider) {
			console.error("[SearchProviderRouter] No search provider available at all")
			throw new Error("No search provider is configured or available.")
		}

		console.log("[SearchProviderRouter] Delegating search to provider:", provider.name)
		try {
			const results = await provider.search(query, options)
			console.log("[SearchProviderRouter] Provider returned", results.length, "results")
			return results
		} catch (err) {
			console.error("[SearchProviderRouter] Provider.search threw:", err)
			throw err
		}
	}

	/**
	 * Get the health status of the active provider.
	 */
	static async health(): Promise<{ alive: boolean; message?: string }> {
		const provider = SearchProviderRouter.getActiveProvider()
		if (!provider) {
			return { alive: false, message: "No search provider configured" }
		}
		return provider.health()
	}

	/**
	 * Get capabilities of the active provider.
	 */
	static getCapabilities() {
		const provider = SearchProviderRouter.getActiveProvider()
		if (!provider) {
			return null
		}
		return provider.getCapabilities()
	}
}

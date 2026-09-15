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
		if (!key) return undefined
		return SearchProviderRegistry.get(key)
	}

	/**
	 * Perform a web search using the active provider.
	 * Falls back to DuckDuckGo if the active provider is unavailable.
	 */
	static async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
		let provider = SearchProviderRouter.getActiveProvider()

		if (!provider) {
			// Fall back to DuckDuckGo
			provider = SearchProviderRegistry.get("duckduckgo")
		}
		if (!provider) {
			throw new Error("No search provider is configured or available.")
		}

		return provider.search(query, options)
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

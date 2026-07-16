/**
 * Search provider initialization.
 *
 * Called once at extension startup (or when settings change) to register
 * all available search providers and connect the provider selector to
 * the user's settings.
 *
 * Mirrors the image provider initialization pattern in
 * src/services/image-runtime/auto-setup.ts.
 */
import { SearchProviderRegistry, SearchProviderRouter, setActiveProviderSelector } from "../../api/search"
import { DuckDuckGoProvider } from "../../api/search/providers/duckduckgo"
import { BraveSearchProvider, setBraveDefaultApiKey } from "../../api/search/providers/brave"
import { InternalSearchProvider } from "../../api/search/providers/internal"

export interface SearchProviderSettings {
	/** Built-in Brave Search API key (optional, shipped with the extension) */
	braveApiKey?: string
	/** User-configured Brave Search API key override */
	userBraveApiKey?: string
	/** Selected provider key ("duckduckgo", "brave", "internal", etc.) */
	activeProvider?: string
}

/**
 * Initialize all search providers. Called once at extension startup.
 */
export function initializeSearchProviders(settings?: SearchProviderSettings): void {
	// DuckDuckGo is always available (no API key needed)
	if (!SearchProviderRegistry.isRegistered("duckduckgo")) {
		SearchProviderRegistry.register("duckduckgo", new DuckDuckGoProvider())
	}

	// Internal workspace search
	if (!SearchProviderRegistry.isRegistered("internal")) {
		SearchProviderRegistry.register("internal", new InternalSearchProvider())
	}

	// Brave Search — requires an API key
	const braveKey = settings?.userBraveApiKey || settings?.braveApiKey
	if (braveKey && !SearchProviderRegistry.isRegistered("brave")) {
		const braveProvider = new BraveSearchProvider({ apiKey: braveKey })
		SearchProviderRegistry.register("brave", braveProvider)
	}

	// If Brave's default key was provided (from env/built-in), store it
	if (settings?.braveApiKey) {
		setBraveDefaultApiKey(settings.braveApiKey)
	}
}

/**
 * Connect the search provider selector to the user's settings.
 * Call this after settings are loaded to ensure the router always
 * resolves to the user's preferred provider.
 */
export function connectSearchProviderSelector(settingsProvider: () => { activeProvider?: string }): void {
	setActiveProviderSelector(() => {
		const settings = settingsProvider()
		return settings.activeProvider ?? "duckduckgo"
	})
}

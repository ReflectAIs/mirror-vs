import { describe, it, expect, beforeEach, vi } from "vitest"
import { SearchProviderRouter, setActiveProviderSelector } from "../router"
import { SearchProviderRegistry } from "../registry"
import type { SearchResult, SearchOptions, ProviderCapabilities } from "../types"

function makeMockProvider(
	name: string,
	searchImpl?: (query: string, options?: SearchOptions) => Promise<SearchResult[]>,
) {
	return {
		name,
		health: vi.fn(async () => ({ alive: true })),
		search: vi.fn(searchImpl ?? (async (_query: string, _options?: SearchOptions): Promise<SearchResult[]> => [])),
		getCapabilities: vi.fn(
			(): ProviderCapabilities => ({
				supportsWebSearch: true,
				supportsNewsSearch: false,
				supportsImageSearch: false,
				supportsVideoSearch: false,
				supportsSafeSearch: false,
				supportsFreshnessFiltering: false,
				supportsLocaleFiltering: false,
			}),
		),
	}
}

describe("SearchProviderRouter", () => {
	const mockProvider = makeMockProvider("Mock")

	beforeEach(() => {
		vi.clearAllMocks()
		SearchProviderRegistry.clear()
		// Reset selector to default
		setActiveProviderSelector(() => "duckduckgo")
	})

	describe("getActiveProvider", () => {
		it("should return undefined when no provider matches the selector", () => {
			expect(SearchProviderRouter.getActiveProvider()).toBeUndefined()
		})

		it("should return the provider registered under the selector's key", () => {
			SearchProviderRegistry.register("duckduckgo", mockProvider)
			expect(SearchProviderRouter.getActiveProvider()).toBe(mockProvider)
		})

		it("should return undefined when the selector returns undefined", () => {
			setActiveProviderSelector(() => undefined)
			expect(SearchProviderRouter.getActiveProvider()).toBeUndefined()
		})
	})

	describe("search", () => {
		it("should use the active provider when available", async () => {
			const provider = makeMockProvider("My", async () => [
				{ url: "https://a.com", title: "A", snippet: "Desc A" },
			])
			SearchProviderRegistry.register("duckduckgo", provider)

			const results = await SearchProviderRouter.search("hello")
			expect(results).toHaveLength(1)
			expect(results[0].url).toBe("https://a.com")
		})

		it("should fall back to DuckDuckGo when the active provider is unavailable", async () => {
			const fallback = makeMockProvider("DuckDuckGo", async () => [
				{ url: "https://fallback.com", title: "F", snippet: "Fallback" },
			])
			SearchProviderRegistry.register("duckduckgo", fallback)

			// selector returns a key that isn't registered
			setActiveProviderSelector(() => "brave")

			const results = await SearchProviderRouter.search("test")
			expect(results).toHaveLength(1)
			expect(results[0].url).toBe("https://fallback.com")
		})

		it("should throw when no provider is available at all", async () => {
			SearchProviderRegistry.clear()

			await expect(SearchProviderRouter.search("query")).rejects.toThrow(
				"No search provider is configured or available.",
			)
		})

		it("should pass options to the provider", async () => {
			const provider = makeMockProvider("Opts")
			SearchProviderRegistry.register("duckduckgo", provider)

			await SearchProviderRouter.search("q", { maxResults: 10, locale: "us" })

			expect(provider.search).toHaveBeenCalledWith("q", { maxResults: 10, locale: "us" })
		})
	})

	describe("health", () => {
		it("should return alive=false when no provider is configured", async () => {
			setActiveProviderSelector(() => undefined)
			const result = await SearchProviderRouter.health()
			expect(result.alive).toBe(false)
			expect(result.message).toBe("No search provider configured")
		})

		it("should delegate to the active provider", async () => {
			const provider = makeMockProvider("Healthy")
			provider.health = vi.fn(async () => ({ alive: true, message: "OK" }))
			SearchProviderRegistry.register("duckduckgo", provider)

			const result = await SearchProviderRouter.health()
			expect(result.alive).toBe(true)
			expect(result.message).toBe("OK")
		})
	})

	describe("getCapabilities", () => {
		it("should return null when no provider is active", () => {
			setActiveProviderSelector(() => undefined)
			expect(SearchProviderRouter.getCapabilities()).toBeNull()
		})

		it("should return the active provider's capabilities", () => {
			const provider = makeMockProvider("Caps")
			SearchProviderRegistry.register("duckduckgo", provider)

			const caps = SearchProviderRouter.getCapabilities()
			expect(caps).not.toBeNull()
			expect(caps!.supportsWebSearch).toBe(true)
		})
	})

	describe("setActiveProviderSelector", () => {
		it("should allow overriding the provider resolution strategy", () => {
			const custom = makeMockProvider("Custom")
			SearchProviderRegistry.register("custom", custom)
			setActiveProviderSelector(() => "custom")

			expect(SearchProviderRouter.getActiveProvider()).toBe(custom)
		})
	})
})

import { describe, it, expect, beforeEach } from "vitest"
import { SearchProviderRegistry } from "../registry"
import type { SearchProvider } from "../provider"

function makeMockProvider(name: string): SearchProvider {
	return {
		name,
		health: async () => ({ alive: true }),
		search: async () => [],
		getCapabilities: () => ({
			supportsWebSearch: true,
			supportsNewsSearch: false,
			supportsImageSearch: false,
			supportsVideoSearch: false,
			supportsSafeSearch: false,
			supportsFreshnessFiltering: false,
			supportsLocaleFiltering: false,
		}),
	}
}

describe("SearchProviderRegistry", () => {
	beforeEach(() => {
		SearchProviderRegistry.clear()
	})

	describe("register", () => {
		it("should register a provider under a stable key", () => {
			SearchProviderRegistry.register("test", makeMockProvider("Test"))
			expect(SearchProviderRegistry.isRegistered("test")).toBe(true)
		})

		it("should throw when registering a duplicate key", () => {
			SearchProviderRegistry.register("dup", makeMockProvider("First"))
			expect(() => SearchProviderRegistry.register("dup", makeMockProvider("Second"))).toThrow(
				'SearchProvider "dup" is already registered',
			)
		})
	})

	describe("get", () => {
		it("should return the registered provider", () => {
			const provider = makeMockProvider("MyProvider")
			SearchProviderRegistry.register("my", provider)
			expect(SearchProviderRegistry.get("my")).toBe(provider)
		})

		it("should return undefined for an unregistered key", () => {
			expect(SearchProviderRegistry.get("nonexistent")).toBeUndefined()
		})
	})

	describe("getAvailable", () => {
		it("should return an empty array when nothing is registered", () => {
			expect(SearchProviderRegistry.getAvailable()).toEqual([])
		})

		it("should return all registered keys", () => {
			SearchProviderRegistry.register("a", makeMockProvider("A"))
			SearchProviderRegistry.register("b", makeMockProvider("B"))
			const keys = SearchProviderRegistry.getAvailable()
			expect(keys).toContain("a")
			expect(keys).toContain("b")
			expect(keys).toHaveLength(2)
		})
	})

	describe("isRegistered", () => {
		it("should return true for registered keys", () => {
			SearchProviderRegistry.register("exists", makeMockProvider("X"))
			expect(SearchProviderRegistry.isRegistered("exists")).toBe(true)
		})

		it("should return false for unregistered keys", () => {
			expect(SearchProviderRegistry.isRegistered("missing")).toBe(false)
		})
	})

	describe("unregister", () => {
		it("should remove a provider from the registry", () => {
			SearchProviderRegistry.register("removable", makeMockProvider("R"))
			expect(SearchProviderRegistry.isRegistered("removable")).toBe(true)
			SearchProviderRegistry.unregister("removable")
			expect(SearchProviderRegistry.isRegistered("removable")).toBe(false)
		})

		it("should not throw when unregistering a non-existent key", () => {
			expect(() => SearchProviderRegistry.unregister("ghost")).not.toThrow()
		})
	})

	describe("clear", () => {
		it("should remove all providers", () => {
			SearchProviderRegistry.register("x", makeMockProvider("X"))
			SearchProviderRegistry.register("y", makeMockProvider("Y"))
			SearchProviderRegistry.clear()
			expect(SearchProviderRegistry.getAvailable()).toEqual([])
		})
	})
})

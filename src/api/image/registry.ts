/**
 * Static registry for image providers.
 *
 * Providers self-register at import time (or are registered during startup).
 * The router uses the registry to look up the active provider by name.
 */
import type { ImageProvider } from "./provider"

const providers = new Map<string, ImageProvider>()

export class ImageProviderRegistry {
	/**
	 * Register a provider under a stable key (e.g. `"comfyui"`, `"openrouter"`).
	 * Throws if a provider with the same key is already registered.
	 */
	static register(key: string, provider: ImageProvider): void {
		if (providers.has(key)) {
			throw new Error(`ImageProvider "${key}" is already registered`)
		}
		providers.set(key, provider)
	}

	/**
	 * Retrieve a provider by key. Returns `undefined` if not registered.
	 */
	static get(key: string): ImageProvider | undefined {
		return providers.get(key)
	}

	/**
	 * Return an array of all registered provider keys.
	 */
	static getAvailable(): string[] {
		return Array.from(providers.keys())
	}

	/**
	 * Check whether a provider key has been registered.
	 */
	static isRegistered(key: string): boolean {
		return providers.has(key)
	}

	/**
	 * Remove a provider from the registry (useful in tests / teardown).
	 */
	static unregister(key: string): void {
		providers.delete(key)
	}

	/**
	 * Clear all registered providers (useful in tests).
	 */
	static clear(): void {
		providers.clear()
	}
}

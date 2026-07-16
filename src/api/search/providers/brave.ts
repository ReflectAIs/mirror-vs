/**
 * Brave Search provider.
 *
 * Requires a Brave Search API key. Uses the Brave Search API
 * (https://api.search.brave.com/app/).
 *
 * The API key is configured via extension settings and can be overridden
 * by the user. A built-in default key may be provided as fallback.
 */
import type { HealthStatus, SearchResult, SearchOptions, ProviderCapabilities } from "../types"
import type { SearchProvider } from "../provider"

export interface BraveConfig {
	apiKey: string
}

export class BraveSearchProvider implements SearchProvider {
	readonly name = "Brave Search"

	private readonly baseUrl = "https://api.search.brave.com/res/v1/web/search"

	constructor(private config: BraveConfig) {}

	setApiKey(apiKey: string): void {
		this.config = { ...this.config, apiKey }
	}

	async health(): Promise<HealthStatus> {
		try {
			// Lightweight check: try a minimal search to verify the key works
			const res = await fetch(this.baseUrl + "?q=test&count=1", {
				headers: {
					Accept: "application/json",
					"Accept-Encoding": "gzip",
					"X-Subscription-Token": this.config.apiKey,
				},
				signal: AbortSignal.timeout(5000),
			})
			return {
				alive: res.ok,
				message: res.ok ? "Healthy" : `HTTP ${res.status}`,
			}
		} catch (e) {
			return { alive: false, message: e instanceof Error ? e.message : String(e) }
		}
	}

	async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
		const maxResults = options?.maxResults ?? 5
		const encoded = encodeURIComponent(query)

		const params = new URLSearchParams({ q: encoded, count: String(maxResults) })

		if (options?.locale) {
			params.set("country", options.locale)
		}

		if (options?.freshnessDays !== undefined) {
			// Brave supports: pd (past day), pw (past week), pm (past month), py (past year)
			if (options.freshnessDays <= 1) {
				params.set("freshness", "pd")
			} else if (options.freshnessDays <= 7) {
				params.set("freshness", "pw")
			} else if (options.freshnessDays <= 30) {
				params.set("freshness", "pm")
			} else {
				params.set("freshness", "py")
			}
		}

		const res = await fetch(`${this.baseUrl}?${params.toString()}`, {
			headers: {
				Accept: "application/json",
				"Accept-Encoding": "gzip",
				"X-Subscription-Token": this.config.apiKey,
			},
			signal: options?.signal,
		})

		if (!res.ok) {
			const body = await res.text().catch(() => "")
			throw new Error(
				`Brave Search failed: HTTP ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 200)}` : ""}`,
			)
		}

		const json = await res.json()
		return this.parseResults(json, maxResults)
	}

	getCapabilities(): ProviderCapabilities {
		return {
			supportsWebSearch: true,
			supportsNewsSearch: true,
			supportsImageSearch: true,
			supportsVideoSearch: false,
			supportsSafeSearch: true,
			supportsFreshnessFiltering: true,
			supportsLocaleFiltering: true,
		}
	}

	// ------------------------------------------------------------------ Private

	private parseResults(json: any, maxResults: number): SearchResult[] {
		const webResults = json.web?.results ?? []
		return webResults.slice(0, maxResults).map((r: any) => ({
			url: r.url ?? "",
			title: r.title ?? "",
			snippet: r.description ?? "",
			metadata: {
				age: r.age,
				language: r.language,
				family_friendly: r.family_friendly,
			},
		}))
	}
}

// Default instance — users can override the API key via settings later
let defaultBraveApiKey: string | undefined

export function setBraveDefaultApiKey(key: string): void {
	defaultBraveApiKey = key
}

export function getBraveDefaultApiKey(): string | undefined {
	return defaultBraveApiKey
}

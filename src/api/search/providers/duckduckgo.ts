/**
 * DuckDuckGo search provider.
 *
 * Uses DuckDuckGo's HTML search endpoint (no API key required).
 * This is the default provider, matching the existing web_search behavior.
 */
import type { HealthStatus, SearchResult, SearchOptions, ProviderCapabilities } from "../types"
import type { SearchProvider } from "../provider"

export class DuckDuckGoProvider implements SearchProvider {
	readonly name = "DuckDuckGo"

	private readonly baseUrl = "https://html.duckduckgo.com/html/"
	private readonly userAgent =
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

	async health(): Promise<HealthStatus> {
		try {
			console.log("[DuckDuckGo] health check to:", this.baseUrl)
			const res = await fetch(this.baseUrl, {
				method: "HEAD",
				signal: AbortSignal.timeout(5000),
				headers: { "User-Agent": this.userAgent },
			})
			console.log("[DuckDuckGo] health response:", res.status)
			return { alive: res.ok, message: `HTTP ${res.status}` }
		} catch (e) {
			console.error("[DuckDuckGo] health error:", e)
			return { alive: false, message: e instanceof Error ? e.message : String(e) }
		}
	}

	async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
		const maxResults = options?.maxResults ?? 5
		console.log("[DuckDuckGo] search query:", query)

		// Use POST with form data to avoid DuckDuckGo bot detection on GET requests.
		// The /html/ endpoint requires a 'q' field in the POST body.
		const body = new URLSearchParams({ q: query })

		const res = await fetch(this.baseUrl, {
			method: "POST",
			headers: {
				"User-Agent": this.userAgent,
				Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				"Accept-Language": "en-US,en;q=0.5",
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: body.toString(),
			signal: options?.signal,
		})

		console.log("[DuckDuckGo] fetch response status:", res.status, res.statusText)

		// DuckDuckGo may return 200 (success) or 202 (accepted/challenge).
		// Treat anything other than 200 as a failure to avoid parsing challenge pages.
		if (res.status !== 200) {
			throw new Error(
				`DuckDuckGo search failed: HTTP ${res.status} ${res.statusText}${res.status === 202 ? " (bot challenge page)" : ""}`,
			)
		}

		const text = await res.text()
		console.log("[DuckDuckGo] response body length:", text.length)

		// Check for bot-detection indicators
		if (text.includes("challenge") || text.includes("verify") || text.includes("canonical")) {
			console.warn("[DuckDuckGo] Possible bot challenge page detected")
		}

		const results = this.parseResults(text, maxResults)
		console.log("[DuckDuckGo] parsed results:", results.length)
		return results
	}

	getCapabilities(): ProviderCapabilities {
		return {
			supportsWebSearch: true,
			supportsNewsSearch: false,
			supportsImageSearch: false,
			supportsVideoSearch: false,
			supportsSafeSearch: false,
			supportsFreshnessFiltering: false,
			supportsLocaleFiltering: false,
		}
	}

	// ------------------------------------------------------------------ Private

	private parseResults(html: string, maxResults: number): SearchResult[] {
		const results: SearchResult[] = []
		const regex = /<a class="result__snippet[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gs
		let match: RegExpExecArray | null

		while ((match = regex.exec(html)) !== null) {
			if (results.length >= maxResults) break

			let url = match[1]
			if (url.startsWith("//duckduckgo.com/l/?uddg=")) {
				url = decodeURIComponent(url.split("uddg=")[1].split("&")[0])
			}
			const snippet = match[2].replace(/<b>/g, "").replace(/<\/b>/g, "").trim()

			results.push({
				url,
				title: "",
				snippet,
			})
		}

		return results
	}
}

export const duckDuckGoProvider = new DuckDuckGoProvider()

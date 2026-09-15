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
			const res = await fetch(this.baseUrl, {
				method: "HEAD",
				signal: AbortSignal.timeout(5000),
				headers: { "User-Agent": this.userAgent },
			})
			return { alive: res.ok, message: `HTTP ${res.status}` }
		} catch (e) {
			return { alive: false, message: e instanceof Error ? e.message : String(e) }
		}
	}

	async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
		const maxResults = options?.maxResults ?? 5

		// Use POST with form data to avoid DuckDuckGo bot detection on GET requests.
		const body = new URLSearchParams({ q: query })

		let res: Response
		try {
			res = await fetch(this.baseUrl, {
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
		} catch (e) {
			throw new Error(`DuckDuckGo request failed: ${e instanceof Error ? e.message : String(e)}`)
		}

		// DuckDuckGo may return 200 (success) or 202 (accepted/challenge).
		if (res.status !== 200) {
			throw new Error(
				`DuckDuckGo search failed: HTTP ${res.status} ${res.statusText}${res.status === 202 ? " (bot challenge page)" : ""}`,
			)
		}

		const text = await res.text()
		const results = this.parseResults(text, maxResults)
		console.log(`[DuckDuckGo] "${query}" → ${results.length} results`)
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

	/**
	 * Parse DuckDuckGo HTML response into structured results.
	 *
	 * DuckDuckGo HTML structure (simplified):
	 *   <div class="result results_links ...">
	 *     <h2 class="result__title">
	 *       <a class="result__a" href="//duckduckgo.com/l/?uddg=ENCODED_URL&...">Title text</a>
	 *     </h2>
	 *     <a class="result__snippet" href="...">Snippet text with <b>highlights</b></a>
	 *   </div>
	 *
	 * Strategy: split on result blocks, then extract title+URL+snippet per block.
	 * If no blocks are matched (e.g. simplified HTML), fall back to snippet anchors.
	 */
	private parseResults(html: string, maxResults: number): SearchResult[] {
		const results: SearchResult[] = []

		// Split into result blocks at each result div
		const blocks = html.split(/<div[^>]+class="[^"]*result[^"]*results_links[^"]*"[^>]*>/i)

		for (let i = 1; i < blocks.length && results.length < maxResults; i++) {
			const block = blocks[i]

			// Extract title + URL from <a class="result__a" href="...">TITLE</a>
			const titleMatch = block.match(
				/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i,
			)
			if (!titleMatch) continue

			const url = this.cleanUrl(titleMatch[1])
			if (!url.startsWith("http")) continue

			const title = this.stripHtml(titleMatch[2]).trim()

			// Extract snippet from <a class="result__snippet" ...>SNIPPET</a>
			const snippetMatch = block.match(/<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i)
			const snippet = snippetMatch ? this.stripHtml(snippetMatch[1]).trim() : ""

			if (!title && !snippet) continue

			results.push({ url, title: title || url, snippet })
		}

		// Fallback: parse standalone <a class="result__snippet" ...> if block parsing yielded no results
		if (results.length === 0) {
			const regex = /<a[^>]+class="[^"]*result__snippet[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
			let match: RegExpExecArray | null
			while ((match = regex.exec(html)) !== null && results.length < maxResults) {
				const url = this.cleanUrl(match[1])
				if (!url.startsWith("http")) continue

				const snippet = this.stripHtml(match[2]).trim()
				results.push({
					url,
					title: url,
					snippet,
				})
			}
		}

		return results
	}

	private cleanUrl(rawUrl: string): string {
		let url = rawUrl
		if (url.startsWith("//duckduckgo.com/l/?") || url.includes("duckduckgo.com/l/?")) {
			const uddg = url.match(/[?&]uddg=([^&]+)/)
			if (uddg) {
				url = decodeURIComponent(uddg[1])
			}
		}
		if (url.startsWith("//")) {
			url = "https:" + url
		}
		return url
	}

	/** Strip HTML tags and decode common HTML entities */
	private stripHtml(html: string): string {
		return html
			.replace(/<[^>]+>/g, " ")
			.replace(/&amp;/g, "&")
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'")
			.replace(/&nbsp;/g, " ")
			.replace(/\s+/g, " ")
			.trim()
	}
}

export const duckDuckGoProvider = new DuckDuckGoProvider()

/**
 * C-1: URL Fetcher (Hybrid HTTP → Puppeteer)
 *
 * Fetches web pages by URL. Uses a hybrid approach:
 * 1. HTTP fetch first (fast, low overhead) via `undici` or global `fetch`
 * 2. If content looks JS-dependent or HTTP fetch fails, falls back to Puppeteer (BrowserService)
 *
 * Supports HTML, Markdown, PDF, JSON, plain text.
 */

import { BrowserService } from "../browser-service"
import { FetchedPage } from "./memory"

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FetchOptions {
	/** Timeout in ms (default: 15_000) */
	timeoutMs?: number
	/** Max content size in bytes (default: 5MB) */
	maxSizeBytes?: number
	/** Whether to follow redirects (default: true) */
	followRedirects?: boolean
	/** User-Agent string */
	userAgent?: string
	/** Force browser-based fetch (skip HTTP attempt) */
	forceBrowser?: boolean
	/** Abort signal */
	signal?: AbortSignal
}

export interface FetchResult {
	url: string
	finalUrl: string // after redirects
	content: string
	contentType: string
	title: string
	statusCode: number
	durationMs: number
	usedBrowser: boolean // whether Puppeteer fallback was used
	error?: string
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const HTML_UA = "Mozilla/5.0 (compatible; MirrorVS/1.0; +https://github.com/ReflectAIs/mirror-vs)"

const MAX_SIZE = 5 * 1024 * 1024 // 5 MB

// Content types that might need JS rendering
const JS_DEPENDENT_HINTS = [
	"react",
	"vue",
	"angular",
	"spa",
	"javascript",
	"application/json", // SPA data endpoints
]

// ─── URL Fetcher ─────────────────────────────────────────────────────────────

export class UrlFetcher {
	private options: Required<FetchOptions>

	constructor(options: FetchOptions = {}) {
		this.options = {
			timeoutMs: options.timeoutMs ?? 15_000,
			maxSizeBytes: options.maxSizeBytes ?? MAX_SIZE,
			followRedirects: options.followRedirects ?? true,
			userAgent: options.userAgent ?? HTML_UA,
			forceBrowser: options.forceBrowser ?? false,
			signal: options.signal ?? new AbortController().signal,
		}
	}

	/**
	 * Fetch a URL, returning the content and metadata.
	 * Uses HTTP first, falls back to Puppeteer if needed.
	 */
	async fetch(url: string): Promise<FetchResult> {
		const startTime = Date.now()

		if (this.options.forceBrowser) {
			return this.fetchWithBrowser(url, startTime)
		}

		// Attempt HTTP fetch first
		try {
			const result = await this.fetchWithHttp(url, startTime)

			// If content looks JS-dependent, re-fetch with browser
			if (this.looksJsDependent(result.contentType, result.content)) {
				console.log(`[UrlFetcher] Content looks JS-dependent, falling back to browser: ${url}`)
				return this.fetchWithBrowser(url, startTime)
			}

			return result
		} catch (httpError) {
			console.log(`[UrlFetcher] HTTP fetch failed, falling back to browser: ${url}`, httpError)
			return this.fetchWithBrowser(url, startTime, httpError)
		}
	}

	/**
	 * Fetch a URL and convert to FetchedPage (for ResearchMemory).
	 */
	async fetchToPage(url: string): Promise<FetchedPage> {
		const result = await this.fetch(url)

		return {
			url: result.finalUrl,
			title: result.title,
			rawContent: result.content,
			cleanContent: result.content, // caller should pipe through PageParser
			contentType: result.contentType,
			fetchedAt: new Date().toISOString(),
			durationMs: result.durationMs,
			success: result.statusCode < 400 && !result.error,
			error: result.error,
		}
	}

	// ─── HTTP Fetch ───────────────────────────────────────────────────────

	private async fetchWithHttp(url: string, startTime: number): Promise<FetchResult> {
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), this.options.timeoutMs)

		// Link external signal
		const onAbort = () => controller.abort()
		this.options.signal.addEventListener("abort", onAbort, { once: true })

		try {
			const response = await fetch(url, {
				signal: controller.signal,
				redirect: this.options.followRedirects ? "follow" : "manual",
				headers: {
					"User-Agent": this.options.userAgent,
					Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
					"Accept-Language": "en-US,en;q=0.5",
				},
			})

			const contentType = response.headers.get("content-type") ?? "text/html"
			const contentLength = response.headers.get("content-length")
			const finalUrl = response.url

			// Check size before reading
			if (contentLength && parseInt(contentLength) > this.options.maxSizeBytes) {
				throw new Error(`Content too large: ${contentLength} bytes`)
			}

			// Read with size limit
			const reader = response.body?.getReader()
			if (!reader) {
				throw new Error("No response body")
			}

			const chunks: Uint8Array[] = []
			let totalSize = 0

			while (true) {
				const { done, value } = await reader.read()
				if (done) break
				totalSize += value.length
				if (totalSize > this.options.maxSizeBytes) {
					reader.cancel()
					throw new Error(`Response exceeded max size of ${this.options.maxSizeBytes} bytes`)
				}
				chunks.push(value)
			}

			const decoder = new TextDecoder()
			const content = chunks.map((c) => decoder.decode(c, { stream: true })).join("")

			// Extract title from HTML
			const title = this.extractTitle(content, finalUrl)

			return {
				url,
				finalUrl,
				content,
				contentType,
				title,
				statusCode: response.status,
				durationMs: Date.now() - startTime,
				usedBrowser: false,
			}
		} finally {
			clearTimeout(timeoutId)
			this.options.signal.removeEventListener("abort", onAbort)
		}
	}

	// ─── Browser (Puppeteer) Fetch ────────────────────────────────────────

	private async fetchWithBrowser(url: string, startTime: number, previousError?: unknown): Promise<FetchResult> {
		try {
			const browser = BrowserService.getInstance()
			const pageResult = await browser.navigate(url)

			const durationMs = Date.now() - startTime

			return {
				url,
				finalUrl: url, // BrowserService doesn't expose final URL
				content: pageResult.textContent,
				contentType: "text/html",
				title: pageResult.title,
				statusCode: 200,
				durationMs,
				usedBrowser: true,
				error: previousError ? `HTTP fetch failed (${previousError}), fetched via browser` : undefined,
			}
		} catch (browserError) {
			const durationMs = Date.now() - startTime
			return {
				url,
				finalUrl: url,
				content: "",
				contentType: "text/plain",
				title: "",
				statusCode: 0,
				durationMs,
				usedBrowser: true,
				error: `Both HTTP and browser fetch failed: ${browserError}`,
			}
		}
	}

	// ─── Helpers ──────────────────────────────────────────────────────────

	/**
	 * Heuristic: does the content look like it needs JS rendering?
	 */
	private looksJsDependent(contentType: string, content: string): boolean {
		// Check content-type header
		const ct = contentType.toLowerCase()
		if (ct.includes("json") || ct.includes("javascript") || ct.includes("text/plain")) {
			return false
		}

		// Quick scan of first 2KB for JS-dependent patterns
		const head = content.slice(0, 2048).toLowerCase()
		return JS_DEPENDENT_HINTS.some((hint) => head.includes(hint))
	}

	/**
	 * Crude HTML title extraction for the HTTP path.
	 */
	private extractTitle(content: string, fallbackUrl: string): string {
		const match = content.match(/<title[^>]*>([^<]*)<\/title>/i)
		if (match && match[1].trim()) {
			return match[1].trim()
		}

		// Fall back to URL path
		try {
			const parsed = new URL(fallbackUrl)
			return parsed.pathname.split("/").filter(Boolean).pop() ?? parsed.hostname
		} catch {
			return fallbackUrl
		}
	}
}

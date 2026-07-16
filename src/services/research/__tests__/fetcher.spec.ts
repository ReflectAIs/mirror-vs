import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { UrlFetcher } from "../fetcher"

// Mock BrowserService
vi.mock("../../../services/browser-service", () => ({
	BrowserService: {
		getInstance: vi.fn(),
	},
}))

import { BrowserService } from "../../../services/browser-service"

describe("UrlFetcher", () => {
	let fetcher: UrlFetcher

	beforeEach(() => {
		vi.clearAllMocks()
		fetcher = new UrlFetcher({ timeoutMs: 5_000 })
		global.fetch = vi.fn()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	// ─── HTTP Fetch Path ───────────────────────────────────────────────────

	describe("HTTP fetch", () => {
		it("should fetch a URL and return FetchResult", async () => {
			const html = "<html><head><title>Test Page</title></head><body>Hello</body></html>"
			;(global.fetch as any).mockResolvedValue({
				ok: true,
				status: 200,
				url: "https://example.com",
				headers: new Map([["content-type", "text/html"]]),
				body: new ReadableStream({
					start(controller: any) {
						controller.enqueue(new TextEncoder().encode(html))
						controller.close()
					},
				}),
			})

			const result = await fetcher.fetch("https://example.com")

			expect(result.url).toBe("https://example.com")
			expect(result.finalUrl).toBe("https://example.com")
			expect(result.title).toBe("Test Page")
			expect(result.content).toContain("Hello")
			expect(result.statusCode).toBe(200)
			expect(result.usedBrowser).toBe(false)
			expect(result.durationMs).toBeGreaterThanOrEqual(0)
		})

		it("should handle non-OK HTTP responses", async () => {
			;(global.fetch as any).mockResolvedValue({
				ok: false,
				status: 404,
				url: "https://example.com/404",
				headers: new Map([["content-type", "text/html"]]),
				body: new ReadableStream({
					start(controller: any) {
						controller.enqueue(new TextEncoder().encode("Not Found"))
						controller.close()
					},
				}),
			})

			const result = await fetcher.fetch("https://example.com/404")
			expect(result.statusCode).toBe(404)
		})

		it("should fall back to browser on fetch failure", async () => {
			;(global.fetch as any).mockRejectedValue(new Error("Network error"))

			const mockBrowser = {
				navigate: vi.fn().mockResolvedValue({
					title: "Browser Fallback",
					textContent: "Fetched via browser",
				}),
			}
			;(BrowserService.getInstance as any).mockReturnValue(mockBrowser)

			const result = await fetcher.fetch("https://example.com")

			expect(result.usedBrowser).toBe(true)
			expect(result.title).toBe("Browser Fallback")
			expect(result.content).toBe("Fetched via browser")
		})
	})

	// ─── fetchToPage ───────────────────────────────────────────────────────

	describe("fetchToPage", () => {
		it("should convert FetchResult to FetchedPage", async () => {
			const html = "<html><head><title>Test</title></head><body>Content</body></html>"
			;(global.fetch as any).mockResolvedValue({
				ok: true,
				status: 200,
				url: "https://example.com",
				headers: new Map([["content-type", "text/html"]]),
				body: new ReadableStream({
					start(controller: any) {
						controller.enqueue(new TextEncoder().encode(html))
						controller.close()
					},
				}),
			})

			const page = await fetcher.fetchToPage("https://example.com")

			expect(page.url).toBe("https://example.com")
			expect(page.title).toBe("Test")
			expect(page.success).toBe(true)
			expect(page.contentType).toBe("text/html")
			expect(page.fetchedAt).toBeTruthy()
			expect(page.durationMs).toBeGreaterThanOrEqual(0)
		})

		it("should set success=false for failed fetches", async () => {
			;(global.fetch as any).mockRejectedValue(new Error("Failed"))

			const mockBrowser = {
				navigate: vi.fn().mockRejectedValue(new Error("Browser also failed")),
			}
			;(BrowserService.getInstance as any).mockReturnValue(mockBrowser)

			const page = await fetcher.fetchToPage("https://example.com")

			expect(page.success).toBe(false)
			expect(page.error).toBeTruthy()
		})
	})

	// ─── JS-dependent detection ────────────────────────────────────────────

	describe("JS-dependent detection", () => {
		it("should fall back to browser for content with JS-dependent hints", async () => {
			const html = "<html><body>React app loading...</body></html>"
			;(global.fetch as any).mockResolvedValue({
				ok: true,
				status: 200,
				url: "https://spa.example.com",
				headers: new Map([["content-type", "text/html"]]),
				body: new ReadableStream({
					start(controller: any) {
						controller.enqueue(new TextEncoder().encode(html))
						controller.close()
					},
				}),
			})

			const mockBrowser = {
				navigate: vi.fn().mockResolvedValue({
					title: "SPA Page",
					textContent: "Rendered SPA content",
				}),
			}
			;(BrowserService.getInstance as any).mockReturnValue(mockBrowser)

			const result = await fetcher.fetch("https://spa.example.com")

			// Should have used browser fallback
			expect(result.usedBrowser).toBe(true)
			expect(mockBrowser.navigate).toHaveBeenCalled()
		})
	})

	// ─── Force Browser ─────────────────────────────────────────────────────

	describe("forceBrowser", () => {
		it("should skip HTTP fetch when forceBrowser is true", async () => {
			const mockBrowser = {
				navigate: vi.fn().mockResolvedValue({
					title: "Direct Browser",
					textContent: "Browser content",
				}),
			}
			;(BrowserService.getInstance as any).mockReturnValue(mockBrowser)

			const browserFetcher = new UrlFetcher({ forceBrowser: true })
			const result = await browserFetcher.fetch("https://example.com")

			expect(result.usedBrowser).toBe(true)
			expect(global.fetch).not.toHaveBeenCalled()
		})
	})
})

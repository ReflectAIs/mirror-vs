import { describe, it, expect, vi, beforeEach } from "vitest"
import { DuckDuckGoProvider } from "../providers/duckduckgo"

const mockHtmlResults = `<!DOCTYPE html>
<html>
<body>
<div class="results">
<a class="result__snippet" href="https://example.com/result1">Example <b>Result</b> 1</a>
<a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fgithub.com%2Ftest&rut=abc">GitHub <b>Test</b> Result</a>
<a class="result__snippet" href="https://example.com/result3">Example Result 3</a>
</div>
</body>
</html>`

describe("DuckDuckGoProvider", () => {
	let provider: DuckDuckGoProvider

	beforeEach(() => {
		provider = new DuckDuckGoProvider()
		vi.clearAllMocks()
		global.fetch = vi.fn()
	})

	describe("health", () => {
		it("should return alive=true on success", async () => {
			;(global.fetch as any).mockResolvedValue({
				ok: true,
				status: 200,
			})

			const result = await provider.health()
			expect(result.alive).toBe(true)
			expect(result.message).toBe("HTTP 200")
		})

		it("should return alive=false on HTTP error", async () => {
			;(global.fetch as any).mockResolvedValue({
				ok: false,
				status: 503,
			})

			const result = await provider.health()
			expect(result.alive).toBe(false)
			expect(result.message).toBe("HTTP 503")
		})

		it("should return alive=false on network error", async () => {
			;(global.fetch as any).mockRejectedValue(new Error("Network unreachable"))

			const result = await provider.health()
			expect(result.alive).toBe(false)
			expect(result.message).toBe("Network unreachable")
		})
	})

	describe("search", () => {
		it("should fetch from the HTML endpoint and parse results", async () => {
			;(global.fetch as any).mockResolvedValue({
				ok: true,
				status: 200,
				text: vi.fn().mockResolvedValue(mockHtmlResults),
			})

			const results = await provider.search("test query")

			expect(global.fetch).toHaveBeenCalledWith(
				"https://html.duckduckgo.com/html/",
				expect.objectContaining({
					method: "POST",
					headers: expect.objectContaining({
						"User-Agent": expect.stringContaining("Mozilla"),
						"Content-Type": "application/x-www-form-urlencoded",
					}),
					body: "q=test+query",
				}),
			)
			expect(results).toHaveLength(3)
			expect(results[0].url).toBe("https://example.com/result1")
			expect(results[0].snippet).toBe("Example Result 1")
		})

		it("should decode DuckDuckGo redirect URLs", async () => {
			;(global.fetch as any).mockResolvedValue({
				ok: true,
				status: 200,
				text: vi.fn().mockResolvedValue(mockHtmlResults),
			})

			const results = await provider.search("test")
			expect(results[1].url).toBe("https://github.com/test")
			expect(results[1].snippet).toBe("GitHub Test Result")
		})

		it("should respect maxResults option", async () => {
			const manyResultsHtml = Array.from(
				{ length: 10 },
				(_, i) => `<a class="result__snippet" href="https://example.com/${i}">Result ${i}</a>`,
			).join("\n")

			;(global.fetch as any).mockResolvedValue({
				ok: true,
				status: 200,
				text: vi.fn().mockResolvedValue(`<html><body>${manyResultsHtml}</body></html>`),
			})

			const results = await provider.search("test", { maxResults: 3 })
			expect(results).toHaveLength(3)
		})

		it("should default to 5 results when maxResults is not specified", async () => {
			const manyResultsHtml = Array.from(
				{ length: 10 },
				(_, i) => `<a class="result__snippet" href="https://example.com/${i}">Result ${i}</a>`,
			).join("\n")

			;(global.fetch as any).mockResolvedValue({
				ok: true,
				status: 200,
				text: vi.fn().mockResolvedValue(`<html><body>${manyResultsHtml}</body></html>`),
			})

			const results = await provider.search("test")
			expect(results).toHaveLength(5)
		})

		it("should return an empty array when no results are found", async () => {
			;(global.fetch as any).mockResolvedValue({
				ok: true,
				status: 200,
				text: vi.fn().mockResolvedValue("<html><body>No results</body></html>"),
			})

			const results = await provider.search("xyznonexistent123")
			expect(results).toEqual([])
		})

		it("should throw on HTTP error", async () => {
			;(global.fetch as any).mockResolvedValue({
				ok: false,
				status: 503,
				statusText: "Service Unavailable",
			})

			await expect(provider.search("test")).rejects.toThrow(
				"DuckDuckGo search failed: HTTP 503 Service Unavailable",
			)
		})

		it("should throw on 202 challenge response", async () => {
			;(global.fetch as any).mockResolvedValue({
				ok: true,
				status: 202,
				statusText: "Accepted",
				text: vi.fn().mockResolvedValue("<html><body>challenge</body></html>"),
			})

			await expect(provider.search("test")).rejects.toThrow("bot challenge page")
		})

		it("should propagate the signal option", async () => {
			const signal = AbortSignal.timeout(5000)
			;(global.fetch as any).mockResolvedValue({
				ok: true,
				status: 200,
				text: vi.fn().mockResolvedValue(mockHtmlResults),
			})

			await provider.search("test", { signal })

			const fetchCall = (global.fetch as any).mock.calls[0]
			expect(fetchCall[1].signal).toBe(signal)
		})
	})

	describe("getCapabilities", () => {
		it("should return the DuckDuckGo capabilities", () => {
			const caps = provider.getCapabilities()
			expect(caps.supportsWebSearch).toBe(true)
			expect(caps.supportsNewsSearch).toBe(false)
			expect(caps.supportsImageSearch).toBe(false)
			expect(caps.supportsVideoSearch).toBe(false)
			expect(caps.supportsSafeSearch).toBe(false)
			expect(caps.supportsFreshnessFiltering).toBe(false)
			expect(caps.supportsLocaleFiltering).toBe(false)
		})
	})

	describe("name", () => {
		it("should have the correct name", () => {
			expect(provider.name).toBe("DuckDuckGo")
		})
	})
})

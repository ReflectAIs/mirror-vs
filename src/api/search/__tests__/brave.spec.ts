import { describe, it, expect, vi, beforeEach } from "vitest"
import { BraveSearchProvider, setBraveDefaultApiKey, getBraveDefaultApiKey } from "../providers/brave"

describe("BraveSearchProvider", () => {
	let provider: BraveSearchProvider

	beforeEach(() => {
		provider = new BraveSearchProvider({ apiKey: "test-key-123" })
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
			expect(result.message).toBe("Healthy")
		})

		it("should return alive=false on HTTP error", async () => {
			;(global.fetch as any).mockResolvedValue({
				ok: false,
				status: 401,
			})

			const result = await provider.health()
			expect(result.alive).toBe(false)
			expect(result.message).toBe("HTTP 401")
		})

		it("should return alive=false on network error", async () => {
			;(global.fetch as any).mockRejectedValue(new Error("DNS resolution failed"))

			const result = await provider.health()
			expect(result.alive).toBe(false)
			expect(result.message).toBe("DNS resolution failed")
		})

		it("should include the API key header", async () => {
			;(global.fetch as any).mockResolvedValue({
				ok: true,
				status: 200,
			})

			await provider.health()

			expect(global.fetch).toHaveBeenCalledWith(
				expect.stringContaining("https://api.search.brave.com"),
				expect.objectContaining({
					headers: expect.objectContaining({
						"X-Subscription-Token": "test-key-123",
					}),
				}),
			)
		})
	})

	describe("search", () => {
		const mockJsonResponse = {
			web: {
				results: [
					{
						url: "https://example.com/1",
						title: "Result 1",
						description: "First result",
						age: "2024-01-01",
						language: "en",
						family_friendly: true,
					},
					{
						url: "https://example.com/2",
						title: "Result 2",
						description: "Second result",
						age: "2024-06-15",
						language: "en",
						family_friendly: true,
					},
					{ url: "https://example.com/3", title: "Result 3", description: "Third result" },
				],
			},
		}

		it("should fetch from the Brave API and parse JSON results", async () => {
			;(global.fetch as any).mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue(mockJsonResponse),
			})

			const results = await provider.search("test query")

			// URLSearchParams re-encodes encodeURIComponent output, so %20 becomes %2520
			expect(global.fetch).toHaveBeenCalledWith(
				expect.stringContaining("q=test%2520query"),
				expect.objectContaining({
					headers: expect.objectContaining({
						"X-Subscription-Token": "test-key-123",
					}),
				}),
			)
			expect(results).toHaveLength(3)
			expect(results[0].url).toBe("https://example.com/1")
			expect(results[0].title).toBe("Result 1")
			expect(results[0].snippet).toBe("First result")
			expect(results[0].metadata?.age).toBe("2024-01-01")
		})

		it("should respect maxResults option", async () => {
			const manyResults = Array.from({ length: 10 }, (_, i) => ({
				url: `https://example.com/${i}`,
				title: `Result ${i}`,
				description: `Description ${i}`,
			}))

			;(global.fetch as any).mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue({ web: { results: manyResults } }),
			})

			const results = await provider.search("test", { maxResults: 3 })
			expect(results).toHaveLength(3)
		})

		it("should pass count parameter to the API", async () => {
			;(global.fetch as any).mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue(mockJsonResponse),
			})

			await provider.search("test", { maxResults: 7 })

			const url = (global.fetch as any).mock.calls[0][0] as string
			expect(url).toContain("count=7")
		})

		it("should apply freshness filter for past day", async () => {
			;(global.fetch as any).mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue(mockJsonResponse),
			})

			await provider.search("test", { freshnessDays: 1 })

			const url = (global.fetch as any).mock.calls[0][0] as string
			expect(url).toContain("freshness=pd")
		})

		it("should apply freshness filter for past week", async () => {
			;(global.fetch as any).mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue(mockJsonResponse),
			})

			await provider.search("test", { freshnessDays: 7 })

			const url = (global.fetch as any).mock.calls[0][0] as string
			expect(url).toContain("freshness=pw")
		})

		it("should apply freshness filter for past month", async () => {
			;(global.fetch as any).mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue(mockJsonResponse),
			})

			await provider.search("test", { freshnessDays: 30 })

			const url = (global.fetch as any).mock.calls[0][0] as string
			expect(url).toContain("freshness=pm")
		})

		it("should apply freshness filter for past year", async () => {
			;(global.fetch as any).mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue(mockJsonResponse),
			})

			await provider.search("test", { freshnessDays: 365 })

			const url = (global.fetch as any).mock.calls[0][0] as string
			expect(url).toContain("freshness=py")
		})

		it("should pass locale as country parameter", async () => {
			;(global.fetch as any).mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue(mockJsonResponse),
			})

			await provider.search("test", { locale: "fr" })

			const url = (global.fetch as any).mock.calls[0][0] as string
			expect(url).toContain("country=fr")
		})

		it("should return an empty array when web results are missing", async () => {
			;(global.fetch as any).mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue({}),
			})

			const results = await provider.search("test")
			expect(results).toEqual([])
		})

		it("should throw on HTTP error with response body", async () => {
			;(global.fetch as any).mockResolvedValue({
				ok: false,
				status: 401,
				statusText: "Unauthorized",
				text: vi.fn().mockResolvedValue('{"error":"invalid_token"}'),
			})

			await expect(provider.search("test")).rejects.toThrow("Brave Search failed: HTTP 401 Unauthorized")
		})

		it("should propagate the signal option", async () => {
			const signal = AbortSignal.timeout(5000)
			;(global.fetch as any).mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue(mockJsonResponse),
			})

			await provider.search("test", { signal })

			const fetchCall = (global.fetch as any).mock.calls[0]
			expect(fetchCall[1].signal).toBe(signal)
		})

		it("should default to 5 results when maxResults is not specified", async () => {
			const manyResults = Array.from({ length: 10 }, (_, i) => ({
				url: `https://example.com/${i}`,
				title: `Result ${i}`,
				description: `Description ${i}`,
			}))

			;(global.fetch as any).mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue({ web: { results: manyResults } }),
			})

			const results = await provider.search("test")
			expect(results).toHaveLength(5)
		})
	})

	describe("getCapabilities", () => {
		it("should return the Brave capabilities", () => {
			const caps = provider.getCapabilities()
			expect(caps.supportsWebSearch).toBe(true)
			expect(caps.supportsNewsSearch).toBe(true)
			expect(caps.supportsImageSearch).toBe(true)
			expect(caps.supportsVideoSearch).toBe(false)
			expect(caps.supportsSafeSearch).toBe(true)
			expect(caps.supportsFreshnessFiltering).toBe(true)
			expect(caps.supportsLocaleFiltering).toBe(true)
		})
	})

	describe("setApiKey", () => {
		it("should update the API key", async () => {
			provider.setApiKey("new-key-456")
			;(global.fetch as any).mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue({ web: { results: [] } }),
			})

			await provider.search("test")

			expect(global.fetch).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					headers: expect.objectContaining({
						"X-Subscription-Token": "new-key-456",
					}),
				}),
			)
		})
	})

	describe("name", () => {
		it("should have the correct name", () => {
			expect(provider.name).toBe("Brave Search")
		})
	})
})

describe("Brave default API key helpers", () => {
	describe("setBraveDefaultApiKey / getBraveDefaultApiKey", () => {
		it("should set and get the default key", () => {
			setBraveDefaultApiKey("default-key")
			expect(getBraveDefaultApiKey()).toBe("default-key")
		})
	})
})

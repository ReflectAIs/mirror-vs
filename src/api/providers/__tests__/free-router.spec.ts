import { describe, it, expect, beforeEach, vitest } from "vitest"

vitest.mock("vscode", () => ({}))

import {
	FreeRouterHandler,
	isExhaustionError,
	resetModelCooldown,
	isModelExhausted,
	getModelHealthMap,
} from "../free-router"
import { OpenRouterHandler } from "../openrouter"

vitest.mock("../openrouter")

describe("FreeRouterHandler", () => {
	beforeEach(() => {
		resetModelCooldown()
		vitest.clearAllMocks()
	})

	describe("isExhaustionError", () => {
		it("detects HTTP 429, 402, 404, 502, 503, 504 status codes", () => {
			expect(isExhaustionError({ status: 429 })).toBe(true)
			expect(isExhaustionError({ statusCode: 429 })).toBe(true)
			expect(isExhaustionError({ code: 429 })).toBe(true)
			expect(isExhaustionError({ status: 402 })).toBe(true)
			expect(isExhaustionError({ status: 404 })).toBe(true)
			expect(isExhaustionError({ status: 502 })).toBe(true)
			expect(isExhaustionError({ status: 503 })).toBe(true)
			expect(isExhaustionError({ status: 504 })).toBe(true)
		})

		it("detects exhaustion and endpoint unavailability keywords in error messages", () => {
			expect(isExhaustionError(new Error("Rate limit exceeded for free tier"))).toBe(true)
			expect(isExhaustionError(new Error("User quota exhausted"))).toBe(true)
			expect(isExhaustionError(new Error("Too many requests, please slow down"))).toBe(true)
			expect(isExhaustionError(new Error("Insufficient credits"))).toBe(true)
			expect(isExhaustionError(new Error("Model is overloaded, try again later"))).toBe(true)
			expect(isExhaustionError(new Error("Resource has been exhausted (e.g. check quota)"))).toBe(true)
			expect(
				isExhaustionError(
					new Error(
						"OpenRouter completion error: 404 No endpoints found for google/gemini-2.0-flash-exp:free.",
					),
				),
			).toBe(true)
			expect(isExhaustionError(new Error("no endpoint found for model"))).toBe(true)
		})

		it("returns false for non-exhaustion errors", () => {
			expect(isExhaustionError(new Error("Invalid JSON body"))).toBe(false)
			expect(isExhaustionError({ status: 401, message: "Unauthorized invalid api key" })).toBe(false)
			expect(isExhaustionError(new Error("Request aborted by user"))).toBe(false)
			expect(isExhaustionError(null)).toBe(false)
			expect(isExhaustionError(undefined)).toBe(false)
		})
	})

	describe("Cooldown and Health Tracking", () => {
		it("tracks exhausted models and allows manual reset", () => {
			const map = getModelHealthMap()
			map.set("model-a", {
				modelId: "model-a",
				isExhausted: true,
				exhaustedUntil: Date.now() + 60000,
				failureCount: 1,
			})

			expect(isModelExhausted("model-a")).toBe(true)
			expect(isModelExhausted("model-b")).toBe(false)

			resetModelCooldown("model-a")
			expect(isModelExhausted("model-a")).toBe(false)
		})

		it("auto-recovers when cooldown expires", () => {
			const map = getModelHealthMap()
			map.set("model-a", {
				modelId: "model-a",
				isExhausted: true,
				exhaustedUntil: Date.now() - 1000, // in the past
				failureCount: 1,
			})

			expect(isModelExhausted("model-a")).toBe(false)
		})
	})

	describe("Model Pool and Selection", () => {
		it("returns curated default free models pool in priority order", () => {
			const handler = new FreeRouterHandler({})
			const pool = handler.getModelPool()
			expect(pool[0]).toBe("google/gemma-4-31b-it:free")
			expect(pool.length).toBeGreaterThan(1)
		})

		it("respects custom model pool when configured", () => {
			const customPool = ["custom/model-1:free", "custom/model-2:free"]
			const handler = new FreeRouterHandler({
				freeRouterModels: customPool,
			})
			expect(handler.getModelPool()).toEqual(customPool)
		})

		it("skips exhausted models in getModel()", () => {
			const handler = new FreeRouterHandler({
				freeRouterModels: ["model-1", "model-2"],
			})

			// Mark model-1 exhausted
			getModelHealthMap().set("model-1", {
				modelId: "model-1",
				isExhausted: true,
				exhaustedUntil: Date.now() + 60000,
				failureCount: 1,
			})

			const selected = handler.getModel()
			expect(selected.id).toBe("model-2")
		})

		it("prioritizes apiModelId when specified for quick change", () => {
			const handler = new FreeRouterHandler({
				apiModelId: "qwen/qwen3.8-27b:free",
			})
			const pool = handler.getModelPool()
			expect(pool[0]).toBe("qwen/qwen3.8-27b:free")
			expect(handler.getModel().id).toBe("qwen/qwen3.8-27b:free")
		})
	})

	describe("Circuit-Breaker Failover Streaming", () => {
		it("fails over to next healthy model when primary hits 404 No endpoints found", async () => {
			const handler = new FreeRouterHandler({
				freeRouterModels: ["broken-model", "working-model"],
				freeRouterCooldownMinutes: 5,
			})

			;(OpenRouterHandler as any).mockImplementation((opts: any) => {
				return {
					createMessage: async function* () {
						if (opts.openRouterModelId === "broken-model") {
							const err: any = new Error(
								"OpenRouter completion error: 404 No endpoints found for broken-model.",
							)
							err.status = 404
							throw err
						}
						yield { type: "text", text: "Successfully recovered on working-model" }
						yield { type: "usage", inputTokens: 20, outputTokens: 10 }
					},
				}
			})

			const chunks: any[] = []
			for await (const chunk of handler.createMessage("system", [])) {
				chunks.push(chunk)
			}

			expect(chunks.length).toBe(2)
			expect(chunks[0].text).toBe("Successfully recovered on working-model")
			expect(isModelExhausted("broken-model")).toBe(true)
			expect(isModelExhausted("working-model")).toBe(false)
		})

		it("fails over to next healthy model when primary hits 429", async () => {
			const handler = new FreeRouterHandler({
				freeRouterModels: ["model-failing", "model-healthy"],
				freeRouterCooldownMinutes: 5,
			})

			// Mock OpenRouterHandler implementations
			;(OpenRouterHandler as any).mockImplementation((opts: any) => {
				return {
					createMessage: async function* () {
						if (opts.openRouterModelId === "model-failing") {
							const err: any = new Error("Rate limit exceeded")
							err.status = 429
							throw err
						}
						yield { type: "text", text: "Response from fallback model" }
						yield { type: "usage", inputTokens: 10, outputTokens: 5 }
					},
				}
			})

			const chunks: any[] = []
			for await (const chunk of handler.createMessage("system", [])) {
				chunks.push(chunk)
			}

			// Must yield successful chunks from fallback model
			expect(chunks.length).toBe(2)
			expect(chunks[0].text).toBe("Response from fallback model")

			// Failing model must be in cooldown
			expect(isModelExhausted("model-failing")).toBe(true)
			expect(isModelExhausted("model-healthy")).toBe(false)
		})

		it("throws descriptive error when all free models are exhausted", async () => {
			const handler = new FreeRouterHandler({
				freeRouterModels: ["model-1", "model-2"],
			})

			;(OpenRouterHandler as any).mockImplementation((_opts: any) => {
				return {
					createMessage: async function* () {
						const err: any = new Error("Quota exceeded")
						err.status = 429
						throw err
					},
				}
			})

			await expect(async () => {
				for await (const _chunk of handler.createMessage("system", [])) {
					// should throw
				}
			}).rejects.toThrow(/All free models in the router are currently exhausted/)

			expect(isModelExhausted("model-1")).toBe(true)
			expect(isModelExhausted("model-2")).toBe(true)
		})

		it("rethrows non-exhaustion error without cooling down", async () => {
			const handler = new FreeRouterHandler({
				freeRouterModels: ["model-1", "model-2"],
			})

			;(OpenRouterHandler as any).mockImplementation((_opts: any) => {
				return {
					createMessage: async function* () {
						throw new Error("Invalid request schema: tool_choice unexpected")
					},
				}
			})

			await expect(async () => {
				for await (const _chunk of handler.createMessage("system", [])) {
					// should throw
				}
			}).rejects.toThrow("Invalid request schema")

			expect(isModelExhausted("model-1")).toBe(false)
		})

		it("updates active model when stream begins on candidate model", async () => {
			const handler = new FreeRouterHandler({
				freeRouterModels: ["model-failing", "model-active"],
			})

			;(OpenRouterHandler as any).mockImplementation((opts: any) => {
				return {
					createMessage: async function* () {
						if (opts.openRouterModelId === "model-failing") {
							const err: any = new Error("429 Too Many Requests")
							err.status = 429
							throw err
						}
						yield { type: "text", text: "streaming..." }
					},
				}
			})

			for await (const _chunk of handler.createMessage("system", [])) {
				// consume stream
			}

			expect(handler.getModel().id).toBe("model-active")
		})
	})
})

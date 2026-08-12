import { describe, expect, it, beforeEach } from "vitest"

import { isTransientProviderError } from "../transient-error"
import { Task } from "../Task"

describe("isTransientProviderError", () => {
	it("detects HTTP 529 overloaded_error", () => {
		const err: any = new Error("The provider couldn't process the request as made.")
		err.status = 529
		err.code = "overloaded_error"
		expect(isTransientProviderError(err)).toBe(true)
	})

	it("detects HTTP 429 rate limit", () => {
		const err: any = new Error("Rate limit exceeded")
		err.status = 429
		expect(isTransientProviderError(err)).toBe(true)
	})

	it("detects HTTP 503 service unavailable", () => {
		const err: any = new Error("Service unavailable")
		err.status = 503
		expect(isTransientProviderError(err)).toBe(true)
	})

	it("falls back to error code when status is missing", () => {
		const err: any = new Error("Something went wrong")
		err.code = "overloaded_error"
		expect(isTransientProviderError(err)).toBe(true)

		const err2: any = new Error("Something went wrong")
		err2.code = "rate_limit_exceeded"
		expect(isTransientProviderError(err2)).toBe(true)
	})

	it("falls back to message text for Anthropic SDK error", () => {
		const err: any = new Error("Error 529: The provider couldn't process the request as made.")
		expect(isTransientProviderError(err)).toBe(true)
	})

	it("returns false for non-transient errors", () => {
		expect(isTransientProviderError(new Error("Invalid API key"))).toBe(false)
		const auth: any = new Error("Unauthorized")
		auth.status = 401
		expect(isTransientProviderError(auth)).toBe(false)
		expect(isTransientProviderError(null)).toBe(false)
		expect(isTransientProviderError(undefined)).toBe(false)
	})
})

describe("Task.acquireGlobalRequestGate", () => {
	beforeEach(() => {
		Task.resetGlobalRequestGate()
	})

	it("serializes concurrent acquisitions (one active at a time)", async () => {
		const order: number[] = []
		let active = 0
		let maxActive = 0

		const run = async (id: number) => {
			const release = await Task.acquireGlobalRequestGate()
			active++
			maxActive = Math.max(maxActive, active)
			order.push(id)
			await new Promise((r) => setTimeout(r, 10))
			active--
			release()
		}

		await Promise.all([run(1), run(2), run(3)])

		// Each acquisition is released before the next one starts → max 1 active.
		expect(maxActive).toBe(1)
		// All three still ran.
		expect(order.sort()).toEqual([1, 2, 3])
	})

	it("releases the gate so subsequent acquisitions proceed", async () => {
		const first = await Task.acquireGlobalRequestGate()
		let secondAcquired = false
		const second = Task.acquireGlobalRequestGate().then((release) => {
			secondAcquired = true
			release()
		})
		await new Promise((r) => setTimeout(r, 20))
		expect(secondAcquired).toBe(false)
		first()
		await second
		expect(secondAcquired).toBe(true)
	})

	it("recovers after an error path releases the gate", async () => {
		const first = await Task.acquireGlobalRequestGate()
		// Simulate a request that fails and releases in its catch block.
		first()
		const third = await Task.acquireGlobalRequestGate()
		third()
		// Gate is functional again.
		await expect(Promise.resolve()).resolves.toBeUndefined()
	})
})

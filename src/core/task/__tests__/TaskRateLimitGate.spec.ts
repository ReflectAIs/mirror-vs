import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { Task } from "../Task"

describe("Task cross-tab / multi-request rate limiting gate", () => {
	beforeEach(() => {
		Task.resetGlobalRequestGate()
		Task.resetGlobalApiRequestTime()
	})

	afterEach(() => {
		Task.resetGlobalRequestGate()
		Task.resetGlobalApiRequestTime()
	})

	it("should allow first request immediately and set lastGlobalApiRequestTime", async () => {
		expect(Task.lastGlobalApiRequestTime).toBeUndefined()
		const release = await Task.acquireGlobalRequestGate(5)
		expect(Task.lastGlobalApiRequestTime).toBeDefined()
		release()
	})

	it("should serialize consecutive requests respecting rateLimitSeconds", async () => {
		const start = performance.now()
		// Tab 1 acquires gate with 1s rate limit
		const release1 = await Task.acquireGlobalRequestGate(1)
		release1()

		// Tab 2 acquires gate immediately after
		const release2 = await Task.acquireGlobalRequestGate(1)
		const elapsed = performance.now() - start
		release2()

		// Must have waited at least ~900ms (1s rateLimit)
		expect(elapsed).toBeGreaterThanOrEqual(900)
	})

	it("should invoke onWait countdown callback during rate limit delay", async () => {
		const release1 = await Task.acquireGlobalRequestGate(2)
		release1()

		const secondsReported: number[] = []
		const release2 = await Task.acquireGlobalRequestGate(2, (sec) => {
			secondsReported.push(sec)
		})
		release2()

		expect(secondsReported.length).toBeGreaterThanOrEqual(1)
		expect(secondsReported[0]).toBeGreaterThanOrEqual(1)
	})
})

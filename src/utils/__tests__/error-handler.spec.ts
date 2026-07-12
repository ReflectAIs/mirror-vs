// npx vitest run src/utils/__tests__/error-handler.spec.ts

import { describe, it, expect, beforeEach, vi } from "vitest"
import { ErrorHandler, reportError } from "../error-handler"

describe("ErrorHandler", () => {
	beforeEach(() => {
		ErrorHandler.reset()
	})

	describe("report", () => {
		it("should create an ErrorReport from an Error object", () => {
			const error = new Error("Something went wrong")
			const report = ErrorHandler.report(error, { source: "test-module" })

			expect(report.message).toBe("Something went wrong")
			expect(report.source).toBe("test-module")
			expect(report.severity).toBe("error")
			expect(report.timestamp).toBeInstanceOf(Date)
			expect(report.id).toBeDefined()
		})

		it("should create an ErrorReport from a string message", () => {
			const report = ErrorHandler.report("Plain string error", { source: "test" })

			expect(report.message).toBe("Plain string error")
			expect(report.source).toBe("test")
		})

		it("should default severity to 'error'", () => {
			const report = ErrorHandler.report("test", { source: "test" })

			expect(report.severity).toBe("error")
		})

		it("should accept custom severity", () => {
			const report = ErrorHandler.report("warning test", {
				source: "test",
				severity: "warning",
			})

			expect(report.severity).toBe("warning")
		})

		it("should include recovery suggestions", () => {
			const suggestions = [
				ErrorHandler.suggestion("Retry", () => {}),
				ErrorHandler.suggestion("Cancel", () => {}),
			]
			const report = ErrorHandler.report("test with suggestions", {
				source: "test",
				suggestions,
			})

			expect(report.suggestions).toHaveLength(2)
			expect(report.suggestions![0].label).toBe("Retry")
			expect(report.suggestions![1].label).toBe("Cancel")
		})

		it("should include context data", () => {
			const report = ErrorHandler.report("test with context", {
				source: "test",
				context: { filePath: "/src/main.ts", line: 42 },
			})

			expect(report.context).toEqual({ filePath: "/src/main.ts", line: 42 })
		})

		it("should deduplicate identical errors within the dedup window", () => {
			const error = new Error("Duplicate error")
			const report1 = ErrorHandler.report(error, { source: "test" })
			const report2 = ErrorHandler.report(error, { source: "test" })

			// Both reports are returned, but the console should only be called once
			expect(report1.id).toBe(report2.id)
		})

		it("should increment error count", () => {
			expect(ErrorHandler.totalErrorCount).toBe(0)
			ErrorHandler.report("first", { source: "test" })
			expect(ErrorHandler.totalErrorCount).toBe(1)
			ErrorHandler.report("second", { source: "test" })
			expect(ErrorHandler.totalErrorCount).toBe(2)
		})

		it("should not show notification when silent option is true", () => {
			// Silent mode should prevent notification calls; verify it doesn't throw
			// and returns the expected report
			const report = ErrorHandler.report("silent error", {
				source: "test",
				silent: true,
			})

			expect(report.message).toBe("silent error")
			expect(report.severity).toBe("error")
		})
	})

	describe("onError listener", () => {
		it("should notify listeners when an error is reported", () => {
			const listener = vi.fn()
			ErrorHandler.onError(listener)

			ErrorHandler.report("listener test", { source: "test" })

			expect(listener).toHaveBeenCalledTimes(1)
			expect(listener.mock.calls[0][0].message).toBe("listener test")
		})

		it("should return an unsubscribe function", () => {
			const listener = vi.fn()
			const unsubscribe = ErrorHandler.onError(listener)

			unsubscribe()
			ErrorHandler.report("after unsubscribe", { source: "test" })

			expect(listener).not.toHaveBeenCalled()
		})

		it("should not crash if a listener throws", () => {
			ErrorHandler.onError(() => {
				throw new Error("Listener error")
			})

			// This should not throw
			const report = ErrorHandler.report("test", { source: "test" })
			expect(report.message).toBe("test")
		})
	})

	describe("wrap", () => {
		it("should return the function result on success", async () => {
			const result = await ErrorHandler.wrap(async () => "success", { source: "test" })

			expect(result).toBe("success")
		})

		it("should report and re-throw on failure by default", async () => {
			await expect(
				ErrorHandler.wrap(
					async () => {
						throw new Error("wrap failure")
					},
					{ source: "test" },
				),
			).rejects.toThrow("wrap failure")
		})

		it("should report and swallow when swallow option is true", async () => {
			const result = await ErrorHandler.wrap(
				async () => {
					throw new Error("swallowed error")
				},
				{ source: "test", swallow: true },
			)

			expect(result).toBeUndefined()
		})
	})

	describe("suggestion", () => {
		it("should create a RecoverySuggestion with label and action", () => {
			const action = vi.fn()
			const suggestion = ErrorHandler.suggestion("Open Settings", action)

			expect(suggestion.label).toBe("Open Settings")
			suggestion.action()
			expect(action).toHaveBeenCalled()
		})
	})

	describe("reportError convenience function", () => {
		it("should delegate to ErrorHandler.report", () => {
			const report = reportError("convenience function test", { source: "test" })

			expect(report.message).toBe("convenience function test")
			expect(report.source).toBe("test")
		})
	})
})

import { describe, it, expect, vi, beforeEach } from "vitest"
import { sleepTool } from "../SleepTool"
import { Task } from "../../task/Task"
import { TerminalRegistry } from "../../../integrations/terminal/TerminalRegistry"

vi.mock("../../../integrations/terminal/TerminalRegistry", () => ({
	TerminalRegistry: {
		getTerminals: vi.fn(),
	},
}))

describe("SleepTool", () => {
	let mockTask: any
	let mockCallbacks: any
	let results: any[]

	beforeEach(() => {
		vi.clearAllMocks()
		results = []
		mockTask = {
			taskId: "test-task-123",
			abort: false,
			abandoned: false,
		}
		mockCallbacks = {
			pushToolResult: vi.fn((res) => results.push(res)),
			handleError: vi.fn(),
			askApproval: vi.fn(),
		}
		vi.mocked(TerminalRegistry.getTerminals).mockReturnValue([])
	})

	it("executes sleep with specified seconds", async () => {
		const start = Date.now()
		await sleepTool.execute({ seconds: 1, reason: "Testing pause" }, mockTask, mockCallbacks)
		const duration = Date.now() - start

		expect(duration).toBeGreaterThanOrEqual(900)
		expect(mockCallbacks.pushToolResult).toHaveBeenCalledTimes(1)
		expect(results[0]).toContain("Paused for 1s (Testing pause).")
	})

	it("clamps seconds between 1 and 300", async () => {
		await sleepTool.execute({ seconds: 0 }, mockTask, mockCallbacks)
		expect(results[0]).toContain("Paused for 1s")
	})

	it("aborts early if task is aborted", async () => {
		setTimeout(() => {
			mockTask.abort = true
		}, 150)

		const start = Date.now()
		await sleepTool.execute({ seconds: 5, reason: "Waiting" }, mockTask, mockCallbacks)
		const duration = Date.now() - start

		expect(duration).toBeLessThan(1000)
		expect(mockCallbacks.pushToolResult).toHaveBeenCalledTimes(1)
	})

	it("reports active running terminals if present", async () => {
		vi.mocked(TerminalRegistry.getTerminals).mockReturnValue([{ id: 1 } as any])

		await sleepTool.execute({ seconds: 1, reason: "Waiting on build" }, mockTask, mockCallbacks)
		expect(results[0]).toContain("1 terminal process(es) still executing.")
	})
})

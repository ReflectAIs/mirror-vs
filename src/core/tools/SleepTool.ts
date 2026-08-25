import { Task } from "../task/Task"
import type { ToolUse } from "../../shared/tools"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import { TerminalRegistry } from "../../integrations/terminal/TerminalRegistry"

interface SleepParams {
	seconds?: number | null
	reason?: string | null
}

export class SleepTool extends BaseTool<"sleep"> {
	readonly name = "sleep" as const

	async execute(params: SleepParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { pushToolResult } = callbacks
		const rawSeconds = typeof params.seconds === "number" && !isNaN(params.seconds) ? params.seconds : 5
		const seconds = Math.max(1, Math.min(Math.round(rawSeconds), 300))
		const reason = params.reason?.trim() || "Waiting for background processes"

		const start = Date.now()
		const targetMs = seconds * 1000
		const initialBusyTerminals = TerminalRegistry.getTerminals(true, task.taskId).length

		// Sleep in short intervals (100ms) to allow prompt abort or early wake when background commands complete
		while (Date.now() - start < targetMs) {
			if (task.abort || task.abandoned) {
				break
			}

			// If we were waiting on terminals and all of them finished, we can wake up early
			if (initialBusyTerminals > 0 && Date.now() - start >= 1000) {
				const currentBusy = TerminalRegistry.getTerminals(true, task.taskId).length
				if (currentBusy === 0) {
					break
				}
			}

			const remainingMs = targetMs - (Date.now() - start)
			await new Promise((resolve) => setTimeout(resolve, Math.min(remainingMs, 200)))
		}

		const elapsedSeconds = Math.max(1, Math.round((Date.now() - start) / 1000))
		const currentBusy = TerminalRegistry.getTerminals(true, task.taskId).length

		let resultMsg = `Paused for ${elapsedSeconds}s (${reason}).`
		if (currentBusy > 0) {
			resultMsg += ` ${currentBusy} terminal process(es) still executing.`
		} else if (initialBusyTerminals > 0) {
			resultMsg += ` All background terminal processes for this task have finished.`
		} else {
			resultMsg += ` Ready for next step.`
		}

		pushToolResult(resultMsg)
	}

	override async handlePartial(task: Task, block: ToolUse<"sleep">): Promise<void> {
		// No partial handling needed
	}
}

export const sleepTool = new SleepTool()

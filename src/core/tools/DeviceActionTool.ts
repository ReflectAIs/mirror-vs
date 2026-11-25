import { BaseTool, ToolCallbacks } from "./BaseTool"
import type { Task } from "../task/Task"
import type { ToolUse } from "../../shared/tools"
import { formatResponse } from "../prompts/responses"
import {
	DeviceControlService,
	DeviceFailSafeError,
	DeviceSafetyError,
	redactSensitiveText,
	type DeviceExecutionMode,
	type DeviceScriptLanguage,
	type MouseButton,
} from "../../services/device-control-service"

export interface DeviceActionParams {
	action:
		| "screenshot"
		| "click"
		| "move"
		| "drag"
		| "type"
		| "hotkey"
		| "scroll"
		| "launch_app"
		| "run_script"
		| "wait"
	mode?: DeviceExecutionMode
	x?: number
	y?: number
	x2?: number
	y2?: number
	button?: MouseButton
	clicks?: 1 | 2
	text?: string
	keys?: string[]
	dx?: number
	dy?: number
	app_name?: string
	script?: string
	language?: DeviceScriptLanguage
	duration_ms?: number
}

export class DeviceActionTool extends BaseTool<"device_action"> {
	readonly name = "device_action" as const

	async execute(params: DeviceActionParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { pushToolResult, handleError, askApproval } = callbacks

		if (!params.action) {
			task.consecutiveMistakeCount++
			task.recordToolError("device_action")
			pushToolResult(await task.sayAndCreateMissingParamError("device_action", "action"))
			return
		}

		// Build human-readable approval message (redacting typed text for safety)
		const summary = this.formatActionSummary(params)
		const approvalMessage = JSON.stringify({
			tool: "device_action",
			action: params.action,
			summary,
		})

		const didApprove = await askApproval("tool", approvalMessage)
		if (!didApprove) {
			return
		}

		const service = DeviceControlService.getInstance()
		const signal = task.abort ? AbortSignal.abort() : undefined
		const execMode: DeviceExecutionMode =
			params.mode ?? ((await task.getTaskMode?.()) === "device-background" ? "background" : "live")

		if (
			execMode === "background" &&
			["click", "move", "drag", "type", "hotkey", "scroll"].includes(params.action)
		) {
			pushToolResult(
				formatResponse.toolError(
					`Action "${params.action}" requires Live Mode because it uses the physical mouse/keyboard. In Background Mode, use "run_script", "launch_app", or "screenshot", or switch to Control Device (Live) mode.`,
				),
			)
			return
		}

		try {
			switch (params.action) {
				case "screenshot": {
					const capture = await service.screenshot(signal)
					const dataUrl = `data:${capture.mimeType};base64,${capture.buffer.toString("base64")}`
					pushToolResult(
						formatResponse.toolResult(
							`Captured screen (${capture.width}x${capture.height}). Use these pixel coordinates for subsequent actions.`,
							[dataUrl],
						),
					)
					break
				}
				case "click": {
					if (params.x === undefined || params.y === undefined) {
						pushToolResult(formatResponse.toolError("Missing required 'x' and 'y' coordinates for click."))
						return
					}
					const pos = await service.click(
						params.x,
						params.y,
						params.button ?? "left",
						params.clicks ?? 1,
						signal,
					)
					pushToolResult(
						formatResponse.toolResult(
							`Clicked ${params.button ?? "left"} (${params.clicks ?? 1}x) at (${pos.x}, ${pos.y}).`,
						),
					)
					break
				}
				case "move": {
					if (params.x === undefined || params.y === undefined) {
						pushToolResult(formatResponse.toolError("Missing required 'x' and 'y' coordinates for move."))
						return
					}
					const pos = await service.move(params.x, params.y, signal)
					pushToolResult(formatResponse.toolResult(`Moved cursor to (${pos.x}, ${pos.y}).`))
					break
				}
				case "drag": {
					if (
						params.x === undefined ||
						params.y === undefined ||
						params.x2 === undefined ||
						params.y2 === undefined
					) {
						pushToolResult(
							formatResponse.toolError("Missing required 'x', 'y', 'x2', 'y2' coordinates for drag."),
						)
						return
					}
					const res = await service.drag(params.x, params.y, params.x2, params.y2, signal)
					pushToolResult(
						formatResponse.toolResult(
							`Dragged from (${res.from.x}, ${res.from.y}) to (${res.to.x}, ${res.to.y}).`,
						),
					)
					break
				}
				case "type": {
					if (!params.text) {
						pushToolResult(formatResponse.toolError("Missing required 'text' for type action."))
						return
					}
					await service.typeText(params.text, signal)
					pushToolResult(formatResponse.toolResult(`Typed text (${redactSensitiveText(params.text)}).`))
					break
				}
				case "hotkey": {
					if (!params.keys || params.keys.length === 0) {
						pushToolResult(formatResponse.toolError("Missing required 'keys' array for hotkey action."))
						return
					}
					const combo = await service.pressHotkey(params.keys, signal)
					pushToolResult(formatResponse.toolResult(`Pressed hotkey: ${combo}.`))
					break
				}
				case "scroll": {
					await service.scroll(params.dx ?? 0, params.dy ?? 0, params.x, params.y, signal)
					pushToolResult(
						formatResponse.toolResult(
							`Scrolled (dx=${params.dx ?? 0}, dy=${params.dy ?? 0})${
								params.x !== undefined && params.y !== undefined ? ` at (${params.x}, ${params.y})` : ""
							}.`,
						),
					)
					break
				}
				case "launch_app": {
					if (!params.app_name) {
						pushToolResult(formatResponse.toolError("Missing required 'app_name' for launch_app."))
						return
					}
					await service.launchApp(params.app_name, signal, execMode)
					pushToolResult(formatResponse.toolResult(`Launched/focused app (${execMode}): ${params.app_name}.`))
					break
				}
				case "run_script": {
					if (!params.script) {
						pushToolResult(formatResponse.toolError("Missing required 'script' for run_script."))
						return
					}
					const out = await service.runBackgroundScript(params.script, params.language, signal)
					pushToolResult(
						formatResponse.toolResult(
							out ? `Script completed:\n${out}` : "Background script completed successfully.",
						),
					)
					break
				}
				case "wait": {
					const ms = params.duration_ms ?? 1000
					await service.wait(ms, signal)
					pushToolResult(formatResponse.toolResult(`Waited ${ms}ms.`))
					break
				}
				default:
					pushToolResult(formatResponse.toolError(`Unsupported device_action: ${String(params.action)}`))
			}
		} catch (error) {
			if (error instanceof DeviceFailSafeError || error instanceof DeviceSafetyError) {
				pushToolResult(formatResponse.toolError(error.message))
				return
			}
			await handleError("device_action", error instanceof Error ? error : new Error(String(error)))
		}
	}

	private formatActionSummary(params: DeviceActionParams): string {
		switch (params.action) {
			case "screenshot":
				return "Capture current screen"
			case "click":
				return `${params.clicks === 2 ? "Double-click" : "Click"} ${params.button ?? "left"} at (${params.x}, ${params.y})`
			case "move":
				return `Move cursor to (${params.x}, ${params.y})`
			case "drag":
				return `Drag (${params.x}, ${params.y}) -> (${params.x2}, ${params.y2})`
			case "type":
				return `Type ${redactSensitiveText(params.text ?? "")}`
			case "hotkey":
				return `Press hotkey [${(params.keys ?? []).join(" + ")}]`
			case "scroll":
				return `Scroll (dx=${params.dx ?? 0}, dy=${params.dy ?? 0})`
			case "launch_app":
				return `Launch app "${params.app_name}"`
			case "wait":
				return `Wait ${params.duration_ms ?? 1000}ms`
			default:
				return String(params.action)
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"device_action">): Promise<void> {
		const action = block.params.action || "..."
		await task.ask("tool", JSON.stringify({ tool: "device_action", action }), block.partial).catch(() => {})
	}
}

export const deviceActionTool = new DeviceActionTool()

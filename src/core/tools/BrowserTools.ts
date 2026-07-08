import { BrowserService } from "../../services/browser-service"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import { Task } from "../task/Task"
import type { ToolUse } from "../../shared/tools"

export class BrowserNavigateTool extends BaseTool<"browser_navigate"> {
	readonly name = "browser_navigate" as const

	async execute(params: { url: string }, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { url } = params
		const { askApproval, handleError, pushToolResult } = callbacks

		try {
			if (!url) {
				pushToolResult("Missing required parameter: url")
				return
			}

			const didApprove = await askApproval("tool", JSON.stringify({ tool: "browserNavigate", url }))
			if (!didApprove) return

			const browser = BrowserService.getInstance()
			const { title, textContent } = await browser.navigate(url)
			pushToolResult(`Navigated to ${url}\nPage title: ${title}\nText content (first 5000 chars):\n${textContent.substring(0, 5000)}`)
		} catch (error) {
			await handleError("navigating browser", error)
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"browser_navigate">): Promise<void> {
		const url = block.params.url || ""
		await task.ask("tool", JSON.stringify({ tool: "browserNavigate", url }), block.partial).catch(() => {})
	}
}

export class BrowserClickTool extends BaseTool<"browser_click"> {
	readonly name = "browser_click" as const

	async execute(params: { selector: string }, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { selector } = params
		const { askApproval, handleError, pushToolResult } = callbacks

		try {
			if (!selector) {
				pushToolResult("Missing required parameter: selector")
				return
			}

			const didApprove = await askApproval("tool", JSON.stringify({ tool: "browserClick", selector }))
			if (!didApprove) return

			const browser = BrowserService.getInstance()
			const result = await browser.click(selector)
			pushToolResult(result)
		} catch (error) {
			await handleError("clicking browser element", error)
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"browser_click">): Promise<void> {
		const selector = block.params.selector || ""
		await task.ask("tool", JSON.stringify({ tool: "browserClick", selector }), block.partial).catch(() => {})
	}
}

export class BrowserTypeTool extends BaseTool<"browser_type"> {
	readonly name = "browser_type" as const

	async execute(params: { selector: string; text?: string; content?: string }, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { selector, text, content } = params
		const { askApproval, handleError, pushToolResult } = callbacks
		const typeText = text || content || ""

		try {
			if (!selector) {
				pushToolResult("Missing required parameter: selector")
				return
			}

			const didApprove = await askApproval("tool", JSON.stringify({ tool: "browserType", selector, text: typeText }))
			if (!didApprove) return

			const browser = BrowserService.getInstance()
			const result = await browser.type(selector, typeText)
			pushToolResult(result)
		} catch (error) {
			await handleError("typing in browser", error)
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"browser_type">): Promise<void> {
		const selector = block.params.selector || ""
		const text = block.params.text || block.params.content || ""
		await task.ask("tool", JSON.stringify({ tool: "browserType", selector, text }), block.partial).catch(() => {})
	}
}

export class BrowserScreenshotTool extends BaseTool<"browser_screenshot"> {
	readonly name = "browser_screenshot" as const

	async execute(params: {}, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { askApproval, handleError, pushToolResult } = callbacks

		try {
			const didApprove = await askApproval("tool", JSON.stringify({ tool: "browserScreenshot" }))
			if (!didApprove) return

			const browser = BrowserService.getInstance()
			const screenshot = await browser.screenshot()
			if (!screenshot) {
				pushToolResult("Screenshot failed: no page loaded. Use browser_navigate first.")
				return
			}
			pushToolResult(`Screenshot taken successfully.\n(Base64 data hidden from output but sent to vision model: ${screenshot.base64})`)
		} catch (error) {
			await handleError("taking browser screenshot", error)
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"browser_screenshot">): Promise<void> {
		await task.ask("tool", JSON.stringify({ tool: "browserScreenshot" }), block.partial).catch(() => {})
	}
}

export class BrowserEvaluateScriptTool extends BaseTool<"browser_evaluate_script"> {
	readonly name = "browser_evaluate_script" as const

	async execute(params: { script: string }, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { script } = params
		const { askApproval, handleError, pushToolResult } = callbacks

		try {
			if (!script) {
				pushToolResult("Missing required parameter: script")
				return
			}

			const didApprove = await askApproval("tool", JSON.stringify({ tool: "browserEvaluate", script }))
			if (!didApprove) return

			const browser = BrowserService.getInstance()
			const result = await browser.evaluate(script)
			pushToolResult(result)
		} catch (error) {
			await handleError("evaluating browser script", error)
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"browser_evaluate_script">): Promise<void> {
		const script = block.params.script || ""
		await task.ask("tool", JSON.stringify({ tool: "browserEvaluate", script }), block.partial).catch(() => {})
	}
}

export class RenderPreviewTool extends BaseTool<"render_preview"> {
	readonly name = "render_preview" as const

	async execute(params: { url: string; width?: number; height?: number }, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { url, width, height } = params
		const { askApproval, handleError, pushToolResult } = callbacks

		try {
			if (!url) {
				pushToolResult("Missing required parameter: url")
				return
			}

			const didApprove = await askApproval("tool", JSON.stringify({ tool: "renderPreview", url, width, height }))
			if (!didApprove) return

			const browser = BrowserService.getInstance()
			if (width && height) {
				await browser.setViewport(width, height)
			}
			const { title } = await browser.navigate(url)
			const screenshot = await browser.screenshot()
			if (!screenshot) {
				pushToolResult("Preview rendering failed: no page loaded.")
				return
			}
			pushToolResult(`Preview rendered successfully for ${url} (title: ${title})\n(Base64 data hidden from output but sent to vision model: ${screenshot.base64})`)
		} catch (error) {
			await handleError("rendering web preview", error)
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"render_preview">): Promise<void> {
		const url = block.params.url || ""
		await task.ask("tool", JSON.stringify({ tool: "renderPreview", url }), block.partial).catch(() => {})
	}
}

export const browserNavigateTool = new BrowserNavigateTool()
export const browserClickTool = new BrowserClickTool()
export const browserTypeTool = new BrowserTypeTool()
export const browserScreenshotTool = new BrowserScreenshotTool()
export const browserEvaluateScriptTool = new BrowserEvaluateScriptTool()
export const renderPreviewTool = new RenderPreviewTool()

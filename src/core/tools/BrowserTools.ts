import * as fs from "fs"
import * as path from "path"
import * as vscode from "vscode"
import { BrowserService } from "../../services/browser-service"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import { Task } from "../task/Task"
import type { ToolUse } from "../../shared/tools"

/**
 * Describes a single layout change detected between page renders.
 */
export interface LayoutDelta {
	type: "added" | "removed" | "moved" | "resized"
	selector: string
	description: string
}

/**
 * Computes layout deltas by comparing two snapshots of element bounding rects.
 */
function computeLayoutDeltas(
	before: Array<{ selector: string; rect: DOMRect }>,
	after: Array<{ selector: string; rect: DOMRect }>,
): LayoutDelta[] {
	const deltas: LayoutDelta[] = []
	const beforeMap = new Map(before.map((e) => [e.selector, e]))
	const afterMap = new Map(after.map((e) => [e.selector, e]))

	// Detect removed and moved/resized elements
	for (const [sel, b] of beforeMap) {
		const a = afterMap.get(sel)
		if (!a) {
			deltas.push({ type: "removed", selector: sel, description: `Element "${sel}" was removed from the DOM` })
		} else if (b.rect.x !== a.rect.x || b.rect.y !== a.rect.y) {
			deltas.push({
				type: "moved",
				selector: sel,
				description: `Element "${sel}" moved from (${b.rect.x.toFixed(0)}, ${b.rect.y.toFixed(0)}) to (${a.rect.x.toFixed(0)}, ${a.rect.y.toFixed(0)})`,
			})
		} else if (b.rect.width !== a.rect.width || b.rect.height !== a.rect.height) {
			deltas.push({
				type: "resized",
				selector: sel,
				description: `Element "${sel}" resized from ${b.rect.width.toFixed(0)}x${b.rect.height.toFixed(0)} to ${a.rect.width.toFixed(0)}x${a.rect.height.toFixed(0)}`,
			})
		}
	}

	// Detect added elements
	for (const [sel, a] of afterMap) {
		if (!beforeMap.has(sel)) {
			deltas.push({ type: "added", selector: sel, description: `New element "${sel}" appeared in the DOM` })
		}
	}

	return deltas
}

/**
 * Takes a snapshot of visible interactive element bounding rects for delta tracking.
 */
async function captureLayoutSnapshot(browser: BrowserService): Promise<Array<{ selector: string; rect: DOMRect }>> {
	try {
		const result = await browser.evaluate(`(() => {
			const elements = document.querySelectorAll('input, button, select, textarea, a, h1, h2, h3, [role="button"], [role="link"], img, video, [tabindex]:not([tabindex="-1"])');
			return Array.from(elements).map(el => {
				const rect = el.getBoundingClientRect();
				const isVisible = rect.width > 0 && rect.height > 0;
				if (!isVisible) return null;
				let selector = el.tagName.toLowerCase();
				if (el.id) selector += '#' + el.id;
				else if (el.className && typeof el.className === 'string') {
					const firstClass = el.className.trim().split(/\\s+/)[0];
					if (firstClass) selector += '.' + firstClass;
				}
				return { selector, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.top } };
			}).filter(Boolean);
		})()`)
		return JSON.parse(result.replace("Script executed. Result: ", ""))
	} catch {
		return []
	}
}

/** Base path for saving browser screenshots within the workspace. */
function getScreenshotDir(): string | null {
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
	if (!workspaceFolder) return null
	const dir = path.join(workspaceFolder, ".mirror-vs", "screenshots")
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true })
	}
	return dir
}

/** Saves a base64-encoded PNG screenshot to the .mirror-vs/screenshots/ directory. */
function saveScreenshot(base64: string): string | null {
	const dir = getScreenshotDir()
	if (!dir) return null
	const filename = `preview-${Date.now()}.png`
	const filePath = path.join(dir, filename)
	fs.writeFileSync(filePath, Buffer.from(base64, "base64"))
	return filePath
}

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
			pushToolResult(
				`Navigated to ${url}\nPage title: ${title}\nText content (first 5000 chars):\n${textContent.substring(0, 5000)}`,
			)
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

	async execute(
		params: { selector: string; text?: string; content?: string },
		task: Task,
		callbacks: ToolCallbacks,
	): Promise<void> {
		const { selector, text, content } = params
		const { askApproval, handleError, pushToolResult } = callbacks
		const typeText = text || content || ""

		try {
			if (!selector) {
				pushToolResult("Missing required parameter: selector")
				return
			}

			const didApprove = await askApproval(
				"tool",
				JSON.stringify({ tool: "browserType", selector, text: typeText }),
			)
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
			const pageText = screenshot.textContent?.trim()
				? `\n\n--- Page Text Content ---\n${screenshot.textContent}`
				: ""
			pushToolResult([
				{ type: "text", text: `Browser screenshot taken.${pageText}` },
				{
					type: "image",
					source: { type: "base64", media_type: "image/png", data: screenshot.base64 },
				},
			])
		} catch (error) {
			await handleError("taking browser screenshot", error)
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"browser_screenshot">): Promise<void> {
		await task.ask("tool", JSON.stringify({ tool: "browserScreenshot" }), block.partial).catch(() => {})
	}
}

export class BrowserScrollTool extends BaseTool<"browser_scroll"> {
	readonly name = "browser_scroll" as const

	async execute(params: { direction: string; amount?: number }, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { direction, amount } = params
		const { askApproval, handleError, pushToolResult } = callbacks

		try {
			if (!direction || !["up", "down", "left", "right"].includes(direction)) {
				pushToolResult(
					"Missing or invalid required parameter: direction (must be 'up', 'down', 'left', or 'right')",
				)
				return
			}

			const didApprove = await askApproval("tool", JSON.stringify({ tool: "browserScroll", direction, amount }))
			if (!didApprove) return

			const browser = BrowserService.getInstance()
			const result = await browser.scroll(direction, amount ?? 300)
			pushToolResult(result)
		} catch (error) {
			await handleError("scrolling browser page", error)
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"browser_scroll">): Promise<void> {
		const direction = block.params.direction || ""
		const scrollAmount = block.params.scroll_amount || ""
		await task
			.ask("tool", JSON.stringify({ tool: "browserScroll", direction, amount: scrollAmount }), block.partial)
			.catch(() => {})
	}
}

export class BrowserSelectTool extends BaseTool<"browser_select"> {
	readonly name = "browser_select" as const

	async execute(params: { selector: string; value: string }, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { selector, value } = params
		const { askApproval, handleError, pushToolResult } = callbacks

		try {
			if (!selector) {
				pushToolResult("Missing required parameter: selector")
				return
			}

			if (!value) {
				pushToolResult("Missing required parameter: value")
				return
			}

			const didApprove = await askApproval("tool", JSON.stringify({ tool: "browserSelect", selector, value }))
			if (!didApprove) return

			const browser = BrowserService.getInstance()
			const result = await browser.selectOption(selector, value)
			pushToolResult(result)
		} catch (error) {
			await handleError("selecting browser option", error)
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"browser_select">): Promise<void> {
		const selector = block.params.selector || ""
		const value = block.params.value || ""
		await task
			.ask("tool", JSON.stringify({ tool: "browserSelect", selector, value }), block.partial)
			.catch(() => {})
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

	async execute(
		params: { url: string; width?: number; height?: number },
		task: Task,
		callbacks: ToolCallbacks,
	): Promise<void> {
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

			// Capture layout snapshot before navigation (if a page is already loaded)
			const layoutBefore = await captureLayoutSnapshot(browser)

			if (width && height) {
				await browser.setViewport(width, height)
			}
			const { title } = await browser.navigate(url)

			// Capture layout snapshot after navigation
			const layoutAfter = await captureLayoutSnapshot(browser)
			const deltas = computeLayoutDeltas(layoutBefore, layoutAfter)

			const screenshot = await browser.screenshot()
			if (!screenshot) {
				pushToolResult("Preview rendering failed: no page loaded.")
				return
			}

			// Save screenshot to disk
			const savedPath = saveScreenshot(screenshot.base64)
			const savedMsg = savedPath ? `\nScreenshot saved to: ${savedPath}` : ""

			// Build layout delta report
			const deltaMsg =
				deltas.length > 0
					? `\nLayout changes detected (${deltas.length}):\n${deltas.map((d) => `  - ${d.description}`).join("\n")}`
					: ""

			const pageText = screenshot.textContent?.trim()
				? `\n\n--- Page Text Content ---\n${screenshot.textContent}`
				: ""

			pushToolResult([
				{
					type: "text",
					text: `Preview rendered successfully for ${url} (title: ${title})${savedMsg}${deltaMsg}${pageText}`,
				},
				{
					type: "image",
					source: { type: "base64", media_type: "image/png", data: screenshot.base64 },
				},
			])
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
export const browserScrollTool = new BrowserScrollTool()
export const browserSelectTool = new BrowserSelectTool()
export const browserEvaluateScriptTool = new BrowserEvaluateScriptTool()
export const renderPreviewTool = new RenderPreviewTool()

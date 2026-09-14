import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App"
import "../node_modules/@vscode/codicons/dist/codicon.css"

import { getHighlighter } from "./utils/highlighter"
import { vscode } from "./utils/vscode"

declare global {
	interface Window {
		__mirrorReload?: () => void
	}
}

window.__mirrorReload = () => {
	try {
		vscode.postMessage({ type: "reloadWebview" })
	} catch {}
}

function ensureFallbackUI(msg: string) {
	const root = document.getElementById("root")
	const spinner = document.getElementById("loading-spinner")
	if (root && (!root.firstElementChild || spinner || root.innerHTML.trim() === "")) {
		root.innerHTML = `
			<div style="padding: 24px; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; text-align: center; font-family: var(--vscode-font-family, sans-serif); color: var(--vscode-foreground, #ccc); background-color: var(--vscode-editor-background, #1e1e1e); box-sizing: border-box;">
				<div style="font-size: 14px; font-weight: 600; margin-bottom: 8px;">Mirror VS Webview Encountered an Error</div>
				<div style="font-size: 12px; color: var(--vscode-descriptionForeground, #888); margin-bottom: 16px; max-width: 320px; word-break: break-word;">${msg}</div>
				<div style="display: flex; gap: 8px;">
					<button onclick="window.__mirrorReload()" style="padding: 6px 14px; font-size: 12px; border-radius: 4px; border: none; background: var(--vscode-button-background, #0e639c); color: var(--vscode-button-foreground, #fff); cursor: pointer;">Reload Webview</button>
				</div>
			</div>
		`
	}
}

// Forward uncaught errors and unhandled rejections to extension host output channel
window.addEventListener("error", (event) => {
	const message = event.message || "Uncaught error in webview"
	ensureFallbackUI(message)
	try {
		vscode.postMessage({
			type: "webviewError",
			error: {
				message,
				stack: event.error?.stack || `${event.filename}:${event.lineno}:${event.colno}`,
			},
		})
	} catch {
		// Ignore if postMessage fails
	}
})

window.addEventListener("unhandledrejection", (event) => {
	const reason = event.reason
	const message = reason instanceof Error ? reason.message : String(reason)
	ensureFallbackUI(message)
	try {
		const stack = reason instanceof Error ? reason.stack : undefined
		vscode.postMessage({
			type: "webviewError",
			error: {
				message: `Unhandled rejection: ${message}`,
				stack,
			},
		})
	} catch {
		// Ignore if postMessage fails
	}
})

// Initialize Shiki early to hide initialization latency (async)
getHighlighter().catch((error: Error) => console.error("Failed to initialize Shiki highlighter:", error))

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App />
	</StrictMode>,
)

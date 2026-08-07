import { useEffect, useCallback } from "react"

import { vscode } from "../utils/vscode"

/**
 * Webview-level keyboard shortcuts.
 *
 * VS Code's `when`-clause keybindings do NOT reliably fire when focus is inside
 * a webview iframe (microsoft/vscode#61762). To make the shortcuts work while
 * Mirror VS is focused, we listen for `keydown` inside the webview, call
 * `preventDefault()` so the native VS Code shortcut never runs, and post the
 * equivalent WebviewMessage to the extension host.
 *
 * Shortcuts:
 *   - Cmd/Ctrl+N or Cmd/Ctrl+T → new tab  (newTask with empty text)
 *   - Cmd/Ctrl+Shift+N    → new session (clearTask)
 *   - Cmd/Ctrl+W          → close active tab (closeTaskTab)
 *
 * @param activeTabId - The currently active task's id, used to close a tab.
 */
export function useShortcutKeys(activeTabId: string) {
	const handleKeyDown = useCallback(
		(event: KeyboardEvent) => {
			// Only intercept when a modifier is pressed (Cmd on mac, Ctrl elsewhere)
			const isModifier = event.metaKey || event.ctrlKey

			if (!isModifier) {
				return
			}

			const key = event.key.toLowerCase()

			// Cmd/Ctrl+Shift+N — new session
			if (event.shiftKey && key === "n") {
				event.preventDefault()
				event.stopPropagation()
				vscode.postMessage({ type: "clearTask" })
				return
			}

			// Cmd/Ctrl+N or Cmd/Ctrl+T — new tab
			// (T mirrors the browser-style "new tab" shortcut; without this,
			// Cmd+T falls through to VS Code's native "Go to Symbol in Workspace")
			if (key === "n" || key === "t") {
				event.preventDefault()
				event.stopPropagation()
				vscode.postMessage({ type: "newTask", text: "", images: [] })
				return
			}

			// Cmd/Ctrl+W — close active tab
			if (key === "w") {
				event.preventDefault()
				event.stopPropagation()
				if (activeTabId) {
					vscode.postMessage({ type: "closeTaskTab", taskId: activeTabId })
				}
			}
		},
		[activeTabId],
	)

	useEffect(() => {
		window.addEventListener("keydown", handleKeyDown, true)

		return () => {
			window.removeEventListener("keydown", handleKeyDown, true)
		}
	}, [handleKeyDown])
}

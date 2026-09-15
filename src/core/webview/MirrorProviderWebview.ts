import * as vscode from "vscode"
import axios from "axios"

import { type ExtensionMessage } from "@mirror-vs/types"

import { getTheme } from "../../integrations/theme/getTheme"
import { t } from "../../i18n"
import { Package } from "../../shared/package"

import type { MirrorProvider } from "./MirrorProvider"
import { webviewMessageHandler } from "./webviewMessageHandler"
import { getNonce } from "./getNonce"
import { getUri } from "./getUri"

/**
 * Manages webview lifecycle, HTML content generation, message posting, and
 * resource cleanup for MirrorProvider.
 *
 * Extracted from MirrorProvider.ts to reduce the monolithic class.
 */
export class WebviewManager {
	private hasHydrated = false
	private isUsingHMR = false
	private hmrWatchdogTimer: NodeJS.Timeout | null = null

	constructor(private provider: MirrorProvider) {}

	// ── Message posting ──────────────────────────────────────────────────────

	/**
	 * Posts a message to the webview. Silently drops if the provider is disposed
	 * or the view is unavailable.
	 */
	public async postMessageToWebview(message: ExtensionMessage): Promise<void> {
		if (this.provider.isDisposed()) {
			return
		}

		try {
			await this.provider.getView()?.webview.postMessage(message)
		} catch {
			// View disposed, drop message silently
		}
	}

	/**
	 * Marks the webview as successfully launched/hydrated, disarming any pending HMR watchdog.
	 */
	public markHydrated(): void {
		this.hasHydrated = true
		this.disarmHMRWatchdog()
	}

	private armHMRWatchdog(): void {
		this.disarmHMRWatchdog()
		this.hmrWatchdogTimer = setTimeout(async () => {
			if (!this.hasHydrated && this.isUsingHMR) {
				this.provider.log(
					"[WebviewManager] Development HMR did not hydrate within 3500ms; auto-reloading with production bundle",
				)
				await this.reloadWebview(true)
			}
		}, 3500)
	}

	private disarmHMRWatchdog(): void {
		if (this.hmrWatchdogTimer) {
			clearTimeout(this.hmrWatchdogTimer)
			this.hmrWatchdogTimer = null
		}
	}

	/**
	 * Loads initial HTML during resolveWebviewView, automatically setting up HMR watchdog if in dev mode.
	 */
	public async loadInitialHtml(webview: vscode.Webview): Promise<string> {
		this.hasHydrated = false
		try {
			const html = await this.getHMRHtmlContent(webview)
			this.isUsingHMR = true
			this.armHMRWatchdog()
			return html
		} catch (devError) {
			this.provider.log(`[WebviewManager] Dev server unavailable, using production bundle: ${devError}`)
			this.isUsingHMR = false
			this.disarmHMRWatchdog()
			return this.getHtmlContent(webview)
		}
	}

	// ── HTML content generation ──────────────────────────────────────────────

	/**
	 * Generates HTML for development mode, connecting to the Vite HMR server.
	 */
	public async getHMRHtmlContent(webview: vscode.Webview): Promise<string> {
		let localPort = "3456"

		try {
			const fs = require("fs")
			const path = require("path")
			const portFilePath = path.resolve(__dirname, "../../.vite-port")

			if (fs.existsSync(portFilePath)) {
				localPort = fs.readFileSync(portFilePath, "utf8").trim()
				console.log(`[MirrorProvider:Vite] Using Vite server port from ${portFilePath}: ${localPort}`)
			} else {
				console.log(
					`[MirrorProvider:Vite] Port file not found at ${portFilePath}, using default port: ${localPort}`,
				)
			}
		} catch (err) {
			console.error("[MirrorProvider:Vite] Failed to read Vite port file:", err)
		}

		const localServerUrl = `localhost:${localPort}`

		// Check if local dev server is running with a timeout.
		try {
			await axios.get(`http://${localServerUrl}`, { timeout: 1500 })
		} catch (error) {
			vscode.window.showErrorMessage(t("common:errors.hmr_not_running"))
			return this.getHtmlContent(webview)
		}

		const nonce = getNonce()

		// Get the OpenRouter base URL from configuration
		const { apiConfiguration } = await this.provider.getState()
		const openRouterBaseUrl = apiConfiguration?.openRouterBaseUrl || "https://openrouter.ai"
		// Extract the domain for CSP
		const openRouterDomain = openRouterBaseUrl.match(/^(https?:\/\/[^\/]+)/)?.[1] || "https://openrouter.ai"

		const stylesUri = getUri(webview, this.provider.contextProxy.extensionUri, [
			"webview-ui",
			"build",
			"assets",
			"index.css",
		])

		const codiconsUri = getUri(webview, this.provider.contextProxy.extensionUri, [
			"assets",
			"codicons",
			"codicon.css",
		])
		const materialIconsUri = getUri(webview, this.provider.contextProxy.extensionUri, [
			"assets",
			"vscode-material-icons",
			"icons",
		])
		const imagesUri = getUri(webview, this.provider.contextProxy.extensionUri, ["assets", "images"])
		const audioUri = getUri(webview, this.provider.contextProxy.extensionUri, ["webview-ui", "audio"])

		const file = "src/index.tsx"
		const scriptUri = `http://${localServerUrl}/${file}`

		const reactRefresh = /*html*/ `
			<script nonce="${nonce}" type="module">
				import RefreshRuntime from "http://${localServerUrl}/@react-refresh"
				RefreshRuntime.injectIntoGlobalHook(window)
				window.$RefreshReg$ = () => {}
				window.$RefreshSig$ = () => (type) => type
				window.__vite_plugin_react_preamble_installed__ = true
			</script>
		`

		const csp = [
			"default-src 'none'",
			`font-src ${webview.cspSource} data:`,
			`style-src ${webview.cspSource} 'unsafe-inline' https://* http://${localServerUrl} http://localhost:${localPort} http://127.0.0.1:${localPort} http://0.0.0.0:${localPort}`,
			`img-src ${webview.cspSource} https://storage.googleapis.com https://img.clerk.com data:`,
			`media-src ${webview.cspSource}`,
			`script-src 'unsafe-eval' ${webview.cspSource} https://* http://${localServerUrl} http://localhost:${localPort} http://127.0.0.1:${localPort} http://0.0.0.0:${localPort} 'nonce-${nonce}'`,
			`connect-src ${webview.cspSource} ${openRouterDomain} https://api.requesty.ai https://* ws://${localServerUrl} ws://localhost:${localPort} ws://127.0.0.1:${localPort} ws://0.0.0.0:${localPort} http://${localServerUrl} http://localhost:${localPort} http://127.0.0.1:${localPort} http://0.0.0.0:${localPort}`,
			`worker-src ${webview.cspSource} blob: http://${localServerUrl} http://localhost:${localPort} http://127.0.0.1:${localPort}`,
			`child-src ${webview.cspSource} blob: http://${localServerUrl} http://localhost:${localPort} http://127.0.0.1:${localPort}`,
		]

		return /*html*/ `
			<!DOCTYPE html>
			<html lang="en">
				<head>
					<meta charset="utf-8">
					<meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
					<base href="http://${localServerUrl}/">
					<meta http-equiv="Content-Security-Policy" content="${csp.join("; ")}">
					<link rel="stylesheet" type="text/css" href="http://${localServerUrl}/src/index.css">
					<link href="${codiconsUri}" rel="stylesheet" />
					<script nonce="${nonce}">
						window.IMAGES_BASE_URI = "${imagesUri}"
						window.AUDIO_BASE_URI = "${audioUri}"
						window.MATERIAL_ICONS_BASE_URI = "${materialIconsUri}"
					</script>
					<title>Mirror VS</title>
				</head>
				<body>
					<div id="root">
						<div id="loading-spinner" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:var(--vscode-font-family,sans-serif);color:var(--vscode-foreground,#ccc);background-color:var(--vscode-editor-background,#1e1e1e);text-align:center;">
							<div style="width:24px;height:24px;border:2px solid var(--vscode-progressBar-background,#0078d4);border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite;margin-bottom:12px;"></div>
							<div style="font-size:13px;font-weight:500;">Loading Mirror VS...</div>
						</div>
					</div>
					<style>
						@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
					</style>
					<script nonce="${nonce}" type="module" src="http://${localServerUrl}/@vite/client"></script>
					${reactRefresh}
					<script nonce="${nonce}" type="module" src="${scriptUri}"></script>
				</body>
			</html>
		`
	}

	/**
	 * Defines and returns the HTML that should be rendered within the webview panel.
	 *
	 * @remarks This is also the place where references to the React webview build files
	 * are created and inserted into the webview HTML.
	 */
	public async getHtmlContent(webview: vscode.Webview): Promise<string> {
		// The CSS file from the React build output
		const stylesUri = getUri(webview, this.provider.contextProxy.extensionUri, [
			"webview-ui",
			"build",
			"assets",
			"index.css",
		])

		const scriptUri = getUri(webview, this.provider.contextProxy.extensionUri, [
			"webview-ui",
			"build",
			"assets",
			"index.js",
		])
		const codiconsUri = getUri(webview, this.provider.contextProxy.extensionUri, [
			"assets",
			"codicons",
			"codicon.css",
		])
		const materialIconsUri = getUri(webview, this.provider.contextProxy.extensionUri, [
			"assets",
			"vscode-material-icons",
			"icons",
		])
		const imagesUri = getUri(webview, this.provider.contextProxy.extensionUri, ["assets", "images"])
		const audioUri = getUri(webview, this.provider.contextProxy.extensionUri, ["webview-ui", "audio"])

		// Use a nonce to only allow a specific script to be run.
		const nonce = getNonce()

		// Safely get the OpenRouter base URL from configuration
		let openRouterDomain = "https://openrouter.ai"
		try {
			const { apiConfiguration } = await this.provider.getState()
			const openRouterBaseUrl = apiConfiguration?.openRouterBaseUrl || "https://openrouter.ai"
			openRouterDomain = openRouterBaseUrl.match(/^(https?:\/\/[^\/]+)/)?.[1] || "https://openrouter.ai"
		} catch {
			// Fallback domain
		}

		return /*html*/ `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
            <meta name="theme-color" content="#000000">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} https://* data: blob:; media-src ${webview.cspSource}; script-src ${webview.cspSource} 'wasm-unsafe-eval' 'unsafe-eval' 'nonce-${nonce}'; connect-src ${webview.cspSource} ${openRouterDomain} https://api.requesty.ai https://* http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*; worker-src ${webview.cspSource} blob:;">
            <link rel="stylesheet" type="text/css" href="${stylesUri}">
			<link href="${codiconsUri}" rel="stylesheet" />
			<script nonce="${nonce}">
				window.IMAGES_BASE_URI = "${imagesUri}"
				window.AUDIO_BASE_URI = "${audioUri}"
				window.MATERIAL_ICONS_BASE_URI = "${materialIconsUri}"
			</script>
            <title>Mirror VS</title>
          </head>
          <body>
            <noscript>You need to enable JavaScript to run this app.</noscript>
            <div id="root">
				<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:var(--vscode-font-family,sans-serif);color:var(--vscode-foreground,#ccc);background-color:var(--vscode-editor-background,#1e1e1e);text-align:center;">
					<div style="width:24px;height:24px;border:2px solid var(--vscode-progressBar-background,#0078d4);border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite;margin-bottom:12px;"></div>
					<div style="font-size:13px;font-weight:500;">Loading Mirror VS...</div>
				</div>
			</div>
			<style>
				@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
			</style>
            <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
          </body>
        </html>
      `
	}

	/**
	 * Returns a self-contained fallback page when both HMR and production builds fail to load.
	 */
	public getFallbackHtmlContent(webview: vscode.Webview, errorMessage: string): string {
		const nonce = getNonce()
		return /*html*/ `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width,initial-scale=1">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
            <title>Mirror VS</title>
          </head>
          <body style="margin:0;padding:24px;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:system-ui,-apple-system,sans-serif;color:#ccc;background:#1e1e1e;box-sizing:border-box;text-align:center;">
            <div style="font-size:16px;font-weight:600;margin-bottom:8px;color:#fff;">Unable to load Mirror VS</div>
            <div style="font-size:12px;color:#888;margin-bottom:20px;max-width:340px;word-break:break-word;">${errorMessage || "Webview assets could not be loaded."}</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
              <button id="retryBtn" style="padding:8px 16px;font-size:13px;border-radius:4px;border:none;background:#0e639c;color:#fff;cursor:pointer;font-weight:500;">Reload Webview</button>
              <button id="prodBtn" style="padding:8px 16px;font-size:13px;border-radius:4px;border:none;background:#3a3d41;color:#fff;cursor:pointer;font-weight:500;">Use Production Build</button>
            </div>
            <script nonce="${nonce}">
              const vscode = acquireVsCodeApi();
              document.getElementById('retryBtn').addEventListener('click', () => {
                vscode.postMessage({ type: 'reloadWebview' });
              });
              document.getElementById('prodBtn').addEventListener('click', () => {
                vscode.postMessage({ type: 'reloadWebview', forceProduction: true });
              });
            </script>
          </body>
        </html>
      `
	}

	// ── Message listener ─────────────────────────────────────────────────────

	/**
	 * Sets up an event listener to listen for messages passed from the webview context and
	 * executes code based on the message that is received.
	 */
	public setWebviewMessageListener(webview: vscode.Webview): void {
		const onReceiveMessage = async (message: any) => {
			this.markHydrated()
			return webviewMessageHandler(this.provider, message)
		}

		const messageDisposable = webview.onDidReceiveMessage(onReceiveMessage)
		this.provider.getWebviewDisposables().push(messageDisposable)
	}

	/**
	 * Reloads the webview content without disrupting active tasks or state in the extension host.
	 */
	public async reloadWebview(forceProduction?: boolean): Promise<void> {
		let view = this.provider.getView()
		if (!view) {
			await vscode.commands.executeCommand("mirror-vs.SidebarProvider.focus")
			await new Promise((r) => setTimeout(r, 150))
			view = this.provider.getView()
		}

		if (!view) {
			this.provider.log("Cannot reload webview: view is not available")
			return
		}

		// If previous HMR session never hydrated, automatically force production build
		if (!forceProduction && this.isUsingHMR && !this.hasHydrated) {
			this.provider.log(
				"[WebviewManager] Previous HMR session was unhydrated; forcing production bundle on reload",
			)
			forceProduction = true
		}

		try {
			let html = ""
			if (!forceProduction && this.provider.contextProxy.extensionMode === vscode.ExtensionMode.Development) {
				try {
					html = await this.getHMRHtmlContent(view.webview)
					this.isUsingHMR = true
					this.hasHydrated = false
					this.armHMRWatchdog()
				} catch (devError) {
					this.provider.log(`Development HTML load failed, falling back to production HTML: ${devError}`)
					html = await this.getHtmlContent(view.webview)
					this.isUsingHMR = false
					this.disarmHMRWatchdog()
				}
			} else {
				html = await this.getHtmlContent(view.webview)
				this.isUsingHMR = false
				this.disarmHMRWatchdog()
			}

			view.webview.html = html

			// Multi-burst state posting to ensure state reaches the webview whichever frame it mounts
			const postIntervals = [100, 300, 700, 1500]
			for (const ms of postIntervals) {
				setTimeout(() => {
					if (!this.provider.isDisposed()) {
						this.provider.postStateToWebview()
					}
				}, ms)
			}
		} catch (error) {
			const errMsg = error instanceof Error ? error.message : String(error)
			this.provider.log(`Failed to reload webview: ${errMsg}`)
			view.webview.html = this.getFallbackHtmlContent(view.webview, errMsg)
		}
	}

	// ── Resource cleanup ─────────────────────────────────────────────────────

	/**
	 * Cleans up all webview-related disposables.
	 */
	public clearWebviewResources(): void {
		this.disarmHMRWatchdog()
		const disposables = this.provider.getWebviewDisposables()
		while (disposables.length) {
			const x = disposables.pop()
			if (x) {
				x.dispose()
			}
		}
	}
}

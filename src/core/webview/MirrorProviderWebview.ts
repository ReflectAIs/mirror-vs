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

		// Check if local dev server is running.
		try {
			await axios.get(`http://${localServerUrl}`)
		} catch (error) {
			vscode.window.showErrorMessage(t("common:errors.hmr_not_running"))
			return this.getHtmlContent(webview)
		}

		const nonce = getNonce()

		// Get the OpenRouter base URL from configuration
		const { apiConfiguration } = await this.provider.getState()
		const openRouterBaseUrl = apiConfiguration.openRouterBaseUrl || "https://openrouter.ai"
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
				import RefreshRuntime from "http://localhost:${localPort}/@react-refresh"
				RefreshRuntime.injectIntoGlobalHook(window)
				window.$RefreshReg$ = () => {}
				window.$RefreshSig$ = () => (type) => type
				window.__vite_plugin_react_preamble_installed__ = true
			</script>
		`

		const csp = [
			"default-src 'none'",
			`font-src ${webview.cspSource} data:`,
			`style-src ${webview.cspSource} 'unsafe-inline' https://* http://${localServerUrl} http://0.0.0.0:${localPort}`,
			`img-src ${webview.cspSource} https://storage.googleapis.com https://img.clerk.com data:`,
			`media-src ${webview.cspSource}`,
			`script-src 'unsafe-eval' ${webview.cspSource} https://* http://${localServerUrl} http://0.0.0.0:${localPort} 'nonce-${nonce}'`,
			`connect-src ${webview.cspSource} ${openRouterDomain} https://* ws://${localServerUrl} ws://0.0.0.0:${localPort} http://${localServerUrl} http://0.0.0.0:${localPort}`,
		]

		return /*html*/ `
			<!DOCTYPE html>
			<html lang="en">
				<head>
					<meta charset="utf-8">
					<meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
					<meta http-equiv="Content-Security-Policy" content="${csp.join("; ")}">
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
					<div id="root"></div>
					${reactRefresh}
					<script type="module" src="${scriptUri}"></script>
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

		// Get the OpenRouter base URL from configuration
		const { apiConfiguration } = await this.provider.getState()
		const openRouterBaseUrl = apiConfiguration.openRouterBaseUrl || "https://openrouter.ai"
		// Extract the domain for CSP
		const openRouterDomain = openRouterBaseUrl.match(/^(https?:\/\/[^\/]+)/)?.[1] || "https://openrouter.ai"

		return /*html*/ `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
            <meta name="theme-color" content="#000000">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} https://storage.googleapis.com https://img.clerk.com data:; media-src ${webview.cspSource}; script-src ${webview.cspSource} 'wasm-unsafe-eval' 'nonce-${nonce}' 'strict-dynamic'; connect-src ${webview.cspSource} ${openRouterDomain} https://api.requesty.ai;">
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
            <div id="root"></div>
            <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
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
		const onReceiveMessage = async (message: any) => webviewMessageHandler(this.provider, message)

		const messageDisposable = webview.onDidReceiveMessage(onReceiveMessage)
		this.provider.getWebviewDisposables().push(messageDisposable)
	}

	// ── Resource cleanup ─────────────────────────────────────────────────────

	/**
	 * Cleans up all webview-related disposables.
	 */
	public clearWebviewResources(): void {
		const disposables = this.provider.getWebviewDisposables()
		while (disposables.length) {
			const x = disposables.pop()
			if (x) {
				x.dispose()
			}
		}
	}
}

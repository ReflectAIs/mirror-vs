import * as fs from "fs"
import * as path from "path"
import * as vscode from "vscode"
import { execSync } from "child_process"

type PuppeteerBrowser = any
type PuppeteerPage = any

export class BrowserService {
	private static instance: BrowserService
	private browser: PuppeteerBrowser | null = null
	private page: PuppeteerPage | null = null

	private constructor() {}

	public static getInstance(): BrowserService {
		if (!BrowserService.instance) {
			BrowserService.instance = new BrowserService()
		}
		return BrowserService.instance
	}

	private logError(operation: string, error: any) {
		try {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
			if (workspaceFolder) {
				const logDir = path.join(workspaceFolder, ".mirror-vs")
				if (!fs.existsSync(logDir)) {
					fs.mkdirSync(logDir, { recursive: true })
				}
				const logFile = path.join(logDir, "debug.log")
				const timestamp = new Date().toISOString()
				const errorMessage = error instanceof Error ? error.stack || error.message : String(error)
				fs.appendFileSync(logFile, `[${timestamp}] [BrowserService] ${operation} failed: ${errorMessage}\n\n`)
			}
		} catch (e) {
			console.error("Failed to write debug log", e)
		}
	}

	/**
	 * Finds a browser executable path using dynamic discovery.
	 * Checks (in order):
	 * 1. $CHROME_PATH / $BROWSER_PATH environment variable
	 * 2. `which`/`where` command for known browser binaries
	 * 3. Common installation paths (fallback)
	 * 4. macOS .app bundle pattern matching
	 */
	private async findBrowserPath(): Promise<string | null> {
		// 1. Environment variable override
		const envPath = process.env.CHROME_PATH || process.env.BROWSER_PATH
		if (envPath && fs.existsSync(envPath)) {
			return envPath
		}

		const isWindows = process.platform === "win32"
		const whichCmd = isWindows ? "where" : "which"

		// 2. Known browser binary names to search via `which`/`where`
		const browserNames = [
			"google-chrome",
			"google-chrome-stable",
			"chromium",
			"chromium-browser",
			"brave-browser",
			"microsoft-edge",
			"microsoft-edge-stable",
			"vivaldi",
			"opera",
		]

		for (const name of browserNames) {
			try {
				const resolvedPath = execSync(`${whichCmd} ${name}`, {
					encoding: "utf8",
					timeout: 2000,
				})
					.split("\n")[0]
					.trim()
				if (resolvedPath && fs.existsSync(resolvedPath)) {
					return resolvedPath
				}
			} catch {
				// Command not found or binary not on PATH — continue
			}
		}

		// 3. Common fallback paths
		const commonPaths = [
			// macOS
			"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
			"/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
			"/Applications/Chromium.app/Contents/MacOS/Chromium",
			"/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
			"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
			"/Applications/Vivaldi.app/Contents/MacOS/Vivaldi",
			// Windows
			"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
			"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
			"C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
			"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
			// Linux
			"/usr/bin/google-chrome",
			"/usr/bin/google-chrome-stable",
			"/usr/bin/chromium",
			"/usr/bin/chromium-browser",
			"/snap/bin/chromium",
		]

		for (const p of commonPaths) {
			if (fs.existsSync(p)) {
				return p
			}
		}

		// 4. macOS: pattern-match .app bundles in /Applications
		if (process.platform === "darwin") {
			try {
				const apps = fs.readdirSync("/Applications")
				const browserKeywords = ["chrome", "chromium", "brave", "edge", "vivaldi", "opera"]
				for (const app of apps) {
					const lowerApp = app.toLowerCase()
					if (lowerApp.endsWith(".app") && browserKeywords.some((kw) => lowerApp.includes(kw))) {
						const appPath = `/Applications/${app}/Contents/MacOS`
						if (fs.existsSync(appPath)) {
							const binContents = fs.readdirSync(appPath)
							// Use the first executable that matches the app name
							const binName = app.replace(".app", "")
							const candidate = path.join(appPath, binName)
							if (fs.existsSync(candidate)) {
								return candidate
							}
							// Fall back to first file in MacOS directory
							if (binContents.length > 0) {
								return path.join(appPath, binContents[0])
							}
						}
					}
				}
			} catch {
				// /Applications might not be readable — ignore
			}
		}

		return null
	}

	/**
	 * Attempts to launch a browser using Playwright as a fallback.
	 * Playwright downloads its own browser binaries, so this works
	 * even when no system browser is installed.
	 */
	private async launchWithPlaywright(): Promise<{ browser: PuppeteerBrowser; page: PuppeteerPage } | null> {
		try {
			// @ts-ignore — playwright is an optional fallback dependency
			const { chromium } = await import("playwright")
			const browser = await chromium.launch({
				headless: false,
				args: ["--no-first-run", "--no-default-browser-check"],
			})
			const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
			const page = await context.newPage()
			return { browser, page }
		} catch {
			// Playwright not installed — return null
			return null
		}
	}

	private async getChromePath(): Promise<string> {
		// Try dynamic browser discovery first
		const discovered = await this.findBrowserPath()
		if (discovered) {
			return discovered
		}

		// Fallback: try to check if puppeteer-core can find Chrome itself
		try {
			const puppeteer = await import("puppeteer-core")
			const puppeteerPath = puppeteer.executablePath ? puppeteer.executablePath() : null
			if (puppeteerPath && fs.existsSync(puppeteerPath)) {
				return puppeteerPath
			}
		} catch {
			// puppeteer-core not available — continue
		}

		throw new Error(
			"Could not find a browser installation. Please ensure Google Chrome, Chromium, Brave, or Edge is installed. " +
				"You can set the CHROME_PATH environment variable to specify the browser executable location.",
		)
	}

	public async getPage(): Promise<PuppeteerPage> {
		try {
			if (!this.browser) {
				// Try finding a system browser first
				try {
					const executablePath = await this.getChromePath()
					// Use dynamic import for ESM-only puppeteer-core
					const puppeteer = await import("puppeteer-core")
					this.browser = await puppeteer.launch({
						executablePath,
						headless: false,
						defaultViewport: { width: 1280, height: 800 },
						args: ["--no-first-run", "--no-default-browser-check", "--disable-extensions"],
					})
				} catch (browserError) {
					// Fallback: try Playwright if system browser not found
					const playwrightResult = await this.launchWithPlaywright()
					if (playwrightResult) {
						this.browser = playwrightResult.browser
						this.page = playwrightResult.page
					} else {
						throw browserError
					}
				}

				if (this.browser) {
					this.browser.on("disconnected", () => {
						this.browser = null
						this.page = null
					})
				}
			}

			if (!this.page || this.page.isClosed()) {
				const pages = await this.browser.pages()
				this.page = pages.length > 0 ? pages[0] : await this.browser.newPage()
			}

			return this.page
		} catch (error) {
			this.logError("getPage/launch", error)
			throw error
		}
	}

	public async navigate(url: string): Promise<{ title: string; textContent: string }> {
		try {
			const page = await this.getPage()
			// Use 'domcontentloaded' — 'networkidle2' hangs indefinitely on dev servers
			// that maintain persistent connections (e.g. python http.server, vite HMR).
			await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 })
			// Wait 10 seconds for JS-heavy pages, SPAs, and dev servers to finish rendering.
			await new Promise((r) => setTimeout(r, 10000))
			const title: string = await page.title()
			const textContent: string = await page.evaluate(() => (document.body?.innerText || "").trim())
			return { title, textContent }
		} catch (error) {
			this.logError(`navigate(${url})`, error)
			throw error
		}
	}

	public async click(selector: string): Promise<string> {
		try {
			const page = await this.getPage()
			await page.click(selector)
			return `Clicked on ${selector}`
		} catch (error) {
			this.logError(`click(${selector})`, error)
			throw error
		}
	}

	public async type(selector: string, text: string): Promise<string> {
		try {
			const page = await this.getPage()
			await page.type(selector, text)
			return `Typed "${text}" into ${selector}`
		} catch (error) {
			this.logError(`type(${selector})`, error)
			throw error
		}
	}

	public async evaluate(script: string): Promise<string> {
		try {
			const page = await this.getPage()
			const result = await page.evaluate(script)
			return `Script executed. Result: ${JSON.stringify(result) || "undefined"}`
		} catch (error) {
			this.logError("evaluate", error)
			throw error
		}
	}

	public async getPageSummary(): Promise<{
		title: string
		url: string
		contentText: string
		interactiveElements: string[]
	}> {
		try {
			const page = await this.getPage()
			const title = await page.title()
			const url = page.url()

			const summary = await page.evaluate(() => {
				const elements: string[] = []
				const interactive = document.querySelectorAll(
					'input, button, select, textarea, a, h1, h2, h3, [role="button"], [role="link"]',
				)

				interactive.forEach((el) => {
					const rect = el.getBoundingClientRect()
					const isVisible = rect.width > 0 && rect.height > 0
					if (!isVisible) return

					let desc = el.tagName.toLowerCase()
					if (el.id) {
						desc += `#${el.id}`
					} else if (el.className) {
						const firstClass = el.className.trim().split(/\s+/)[0]
						if (firstClass) desc += `.${firstClass}`
					}

					if (el instanceof HTMLInputElement) {
						desc += ` [type="${el.type || "text"}"]`
						if (el.placeholder) desc += ` [placeholder="${el.placeholder}"]`
					} else if (
						el instanceof HTMLButtonElement ||
						el instanceof HTMLAnchorElement ||
						el.getAttribute("role") === "button"
					) {
						const text = (el.textContent || "").trim().substring(0, 30)
						if (text) desc += ` (text: "${text}")`
					}
					elements.push(desc)
				})

				const pageText = (document.body?.innerText || "").trim()
				return {
					elements: elements.slice(0, 30),
					bodyText: pageText.substring(0, 400),
				}
			})

			return {
				title,
				url,
				contentText: summary.bodyText,
				interactiveElements: summary.elements,
			}
		} catch (error: any) {
			return {
				title: "Error retrieving page status",
				url: "",
				contentText: `Browser page is not fully loaded or unreachable. Details: ${error.message}`,
				interactiveElements: [],
			}
		}
	}

	public async setViewport(width: number, height: number): Promise<void> {
		try {
			const page = await this.getPage()
			await page.setViewport({ width, height })
		} catch (error) {
			this.logError("setViewport", error)
			throw error
		}
	}

	public async screenshot(): Promise<{ base64: string; textContent: string }> {
		try {
			const page = await this.getPage()
			// Return base64 encoded image
			const buffer = await page.screenshot({ type: "png", encoding: "base64" })
			let textContent = ""
			try {
				textContent = await page.evaluate(() => (document.body?.innerText || "").trim())
			} catch (e) {
				// Ignore if page is not ready or evaluate fails
			}
			return {
				base64: buffer as string,
				textContent,
			}
		} catch (error) {
			this.logError("screenshot", error)
			throw error
		}
	}

	public async close(): Promise<string> {
		if (this.browser) {
			await this.browser.close()
			this.browser = null
			this.page = null
		}
		return "Browser closed."
	}
}

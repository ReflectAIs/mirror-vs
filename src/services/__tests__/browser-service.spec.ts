// npx vitest run src/services/__tests__/browser-service.spec.ts

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"

vi.mock("vscode", () => ({
	workspace: {
		workspaceFolders: [{ uri: { fsPath: "/test/workspace" } }],
	},
}))

let processPlatform = "darwin"

async function getBrowserService() {
	vi.resetModules()

	const fsMock = {
		existsSync: vi.fn(),
		readdirSync: vi.fn(),
		mkdirSync: vi.fn(),
		appendFileSync: vi.fn(),
	}

	vi.doMock("fs", () => fsMock)

	const childProcessMock = {
		execSync: vi.fn(),
	}

	vi.doMock("child_process", () => childProcessMock)

	Object.defineProperty(process, "platform", {
		value: processPlatform,
		configurable: true,
	})

	const { BrowserService } = await import("../browser-service")
	return { BrowserService, fsMock, childProcessMock }
}

describe("BrowserService", () => {
	beforeEach(() => {
		processPlatform = "darwin"
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe("getInstance", () => {
		it("should return the same instance (singleton)", async () => {
			const { BrowserService } = await getBrowserService()
			const instance1 = BrowserService.getInstance()
			const instance2 = BrowserService.getInstance()
			expect(instance1).toBe(instance2)
		})
	})

	describe("findBrowserPath", () => {
		it("should return CHROME_PATH env var if set and exists", async () => {
			process.env.CHROME_PATH = "/custom/chrome/path"
			const { BrowserService, fsMock } = await getBrowserService()
			fsMock.existsSync.mockReturnValue(true)

			const instance = BrowserService.getInstance()
			const path = await (instance as any).findBrowserPath()

			expect(path).toBe("/custom/chrome/path")
			delete process.env.CHROME_PATH
		})

		it("should try BROWSER_PATH as fallback env var", async () => {
			delete process.env.CHROME_PATH
			process.env.BROWSER_PATH = "/custom/browser/path"

			const { BrowserService, fsMock } = await getBrowserService()
			fsMock.existsSync.mockReturnValue(true)

			const instance = BrowserService.getInstance()
			const path = await (instance as any).findBrowserPath()

			expect(path).toBe("/custom/browser/path")
			delete process.env.BROWSER_PATH
		})

		it("should try which command for known browser names", async () => {
			delete process.env.CHROME_PATH
			delete process.env.BROWSER_PATH

			const { BrowserService, fsMock, childProcessMock } = await getBrowserService()

			childProcessMock.execSync
				.mockImplementationOnce(() => {
					throw new Error("not found")
				})
				.mockImplementationOnce(() => {
					throw new Error("not found")
				})
				.mockImplementationOnce(() => "/usr/bin/chromium\n")

			fsMock.existsSync.mockReturnValue(true)

			const instance = BrowserService.getInstance()
			const path = await (instance as any).findBrowserPath()

			expect(path).toBe("/usr/bin/chromium")
		})

		it("should fall back to common paths when which fails", async () => {
			delete process.env.CHROME_PATH
			delete process.env.BROWSER_PATH

			const { BrowserService, fsMock, childProcessMock } = await getBrowserService()
			childProcessMock.execSync.mockImplementation(() => {
				throw new Error("not found")
			})

			fsMock.existsSync.mockImplementation((p: string) => {
				return p === "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
			})

			const instance = BrowserService.getInstance()
			const path = await (instance as any).findBrowserPath()

			expect(path).toBe("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
		})

		it("should try macOS .app bundle discovery as last resort", async () => {
			delete process.env.CHROME_PATH
			delete process.env.BROWSER_PATH

			const { BrowserService, fsMock, childProcessMock } = await getBrowserService()
			childProcessMock.execSync.mockImplementation(() => {
				throw new Error("not found")
			})
			fsMock.existsSync.mockReturnValue(false)

			fsMock.readdirSync.mockReturnValue(["Brave Browser.app", "SomeOtherApp.app"])

			fsMock.existsSync.mockImplementation((p: string) => {
				return p === "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
			})

			const instance = BrowserService.getInstance()
			const path = await (instance as any).findBrowserPath()

			expect(path).toBe("/Applications/Brave Browser.app/Contents/MacOS/Brave Browser")
		})

		it("should return null when no browser is found", async () => {
			delete process.env.CHROME_PATH
			delete process.env.BROWSER_PATH

			const { BrowserService, fsMock, childProcessMock } = await getBrowserService()
			childProcessMock.execSync.mockImplementation(() => {
				throw new Error("not found")
			})
			fsMock.existsSync.mockReturnValue(false)
			fsMock.readdirSync.mockReturnValue([])

			const instance = BrowserService.getInstance()
			const path = await (instance as any).findBrowserPath()

			expect(path).toBeNull()
		})

		it("should use where command on Windows", async () => {
			processPlatform = "win32"
			delete process.env.CHROME_PATH
			delete process.env.BROWSER_PATH

			const { BrowserService, fsMock, childProcessMock } = await getBrowserService()
			childProcessMock.execSync.mockImplementationOnce(
				() => "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe\n",
			)
			fsMock.existsSync.mockReturnValue(true)

			const instance = BrowserService.getInstance()
			const path = await (instance as any).findBrowserPath()

			expect(path).toBe("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe")
		})

		it("should handle Windows browser names and fallback paths", async () => {
			processPlatform = "win32"
			delete process.env.CHROME_PATH
			delete process.env.BROWSER_PATH

			const { BrowserService, fsMock, childProcessMock } = await getBrowserService()
			childProcessMock.execSync.mockImplementation(() => {
				throw new Error("not found")
			})

			fsMock.existsSync.mockImplementation((p: string) => {
				return p === "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe"
			})

			const instance = BrowserService.getInstance()
			const path = await (instance as any).findBrowserPath()

			expect(path).toBe("C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe")
		})
	})
})

// npx vitest run src/services/image-runtime/__tests__/comfyui-manager.spec.ts

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

/**
 * Helper that mocks `child_process`, `fs`, and `process.platform` before
 * importing ComfyUIManager.  Returns the class reference alongside the
 * mock objects so tests can verify or override behaviour.
 */
async function getComfyUIManager(platform: "darwin" | "win32" = "darwin") {
	vi.resetModules()

	// --- stub `fetch` globally so healthCheck() doesn't make real HTTP calls
	const fetchMock = vi.fn<typeof fetch>()
	vi.stubGlobal("fetch", fetchMock)

	// --- mock `fs/promises` (used by install, uninstall)
	const fsMock = {
		mkdir: vi.fn(),
		rm: vi.fn(),
	}
	vi.doMock("fs/promises", () => fsMock)

	// --- mock `fs` (used by existsSync checks)
	const fsMod = {
		existsSync: vi.fn(),
	}
	vi.doMock("fs", () => ({ ...fsMod, default: fsMod }))

	// --- mock `child_process` (used by install steps)
	const childProcessMock = {
		execSync: vi.fn(),
	}
	vi.doMock("child_process", () => childProcessMock)

	// --- mock platform helpers
	vi.doMock("../platform", () => ({
		getDefaultComfyUIPath: () => "/tmp/comfyui",
		findCompatiblePython: () => Promise.resolve("/opt/homebrew/bin/python3.12"),
		getComfyUIDownloadUrl: () => "https://example.com/comfyui.7z",
	}))

	// --- mock download-manager (EventEmitter)
	const downloadManagerMock = {
		once: vi.fn(),
		enqueue: vi.fn(),
	}
	vi.doMock("../download-manager", () => ({
		downloadManager: downloadManagerMock,
	}))

	Object.defineProperty(process, "platform", {
		value: platform,
		configurable: true,
	})

	const { ComfyUIManager } = await import("../comfyui-manager")
	return { ComfyUIManager, fetchMock, fsMock, fsMod, childProcessMock, downloadManagerMock }
}

describe("ComfyUIManager", () => {
	beforeEach(() => {
		vi.restoreAllMocks()
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	describe("healthCheck", () => {
		it("should return true when /system_stats responds 200", async () => {
			const { ComfyUIManager, fetchMock } = await getComfyUIManager()

			fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))

			const manager = new ComfyUIManager()
			const result = await manager.healthCheck()

			expect(result).toBe(true)
			expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8188/system_stats")
		})

		it("should fall back to /object_info when /system_stats returns 404", async () => {
			const { ComfyUIManager, fetchMock } = await getComfyUIManager()

			// First call → /system_stats → 404
			fetchMock
				.mockResolvedValueOnce(new Response("Not Found", { status: 404 }))
				// Second call → /object_info → 200
				.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))

			const manager = new ComfyUIManager()
			const result = await manager.healthCheck()

			expect(result).toBe(true)
			expect(fetchMock).toHaveBeenNthCalledWith(1, "http://127.0.0.1:8188/system_stats")
			expect(fetchMock).toHaveBeenNthCalledWith(2, "http://127.0.0.1:8188/object_info")
		})

		it("should return false when both endpoints fail with non-404 errors", async () => {
			const { ComfyUIManager, fetchMock } = await getComfyUIManager()

			// /system_stats returns 500
			fetchMock.mockResolvedValueOnce(new Response("Server Error", { status: 500 }))

			const manager = new ComfyUIManager()
			const result = await manager.healthCheck()

			expect(result).toBe(false)
			// Should NOT try /object_info because the server is alive (500) — only 404 triggers fallback
			expect(fetchMock).toHaveBeenCalledTimes(1)
		})

		it("should return false when /system_stats is 404 and /object_info also fails", async () => {
			const { ComfyUIManager, fetchMock } = await getComfyUIManager()

			fetchMock
				.mockResolvedValueOnce(new Response("Not Found", { status: 404 }))
				.mockResolvedValueOnce(new Response("Not Found", { status: 404 }))

			const manager = new ComfyUIManager()
			const result = await manager.healthCheck()

			expect(result).toBe(false)
			expect(fetchMock).toHaveBeenCalledTimes(2)
		})

		it("should return false when fetch throws (server unreachable)", async () => {
			const { ComfyUIManager, fetchMock } = await getComfyUIManager()

			fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"))

			const manager = new ComfyUIManager()
			const result = await manager.healthCheck()

			expect(result).toBe(false)
		})

		it("should use the configured port", async () => {
			const { ComfyUIManager, fetchMock } = await getComfyUIManager()

			fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))

			const manager = new ComfyUIManager(undefined, 9999)
			await manager.healthCheck()

			expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:9999/system_stats")
		})
	})
})

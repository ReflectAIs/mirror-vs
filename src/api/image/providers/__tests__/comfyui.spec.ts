// npx vitest run src/api/image/providers/__tests__/comfyui.spec.ts

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

/**
 * Helper that stubs `global.fetch` and returns the ComfyUIProvider class
 * alongside the mock so tests can control HTTP responses.
 */
async function getComfyUIProvider() {
	vi.resetModules()

	const fetchMock = vi.fn<typeof fetch>()
	vi.stubGlobal("fetch", fetchMock)

	const { ComfyUIProvider } = await import("../comfyui")
	return { ComfyUIProvider, fetchMock }
}

describe("ComfyUIProvider", () => {
	beforeEach(() => {
		vi.restoreAllMocks()
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	describe("health", () => {
		it("should return alive:true with version when /system_stats responds 200", async () => {
			const { ComfyUIProvider, fetchMock } = await getComfyUIProvider()

			fetchMock.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						system: { comfyui_version: "0.3.5", uptime: 42 },
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				),
			)

			const provider = new ComfyUIProvider()
			const result = await provider.health()

			expect(result).toEqual({ alive: true, version: "0.3.5", uptime: 42 })
			expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8188/system_stats")
		})

		it("should fall back to /object_info when /system_stats returns 404", async () => {
			const { ComfyUIProvider, fetchMock } = await getComfyUIProvider()

			fetchMock
				.mockResolvedValueOnce(new Response("Not Found", { status: 404 }))
				.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))

			const provider = new ComfyUIProvider()
			const result = await provider.health()

			expect(result).toEqual({ alive: true, version: "unknown", uptime: 0 })
			expect(fetchMock).toHaveBeenNthCalledWith(1, "http://127.0.0.1:8188/system_stats")
			expect(fetchMock).toHaveBeenNthCalledWith(2, "http://127.0.0.1:8188/object_info")
		})

		it("should return alive:false when /system_stats is 404 and /object_info also fails", async () => {
			const { ComfyUIProvider, fetchMock } = await getComfyUIProvider()

			fetchMock
				.mockResolvedValueOnce(new Response("Not Found", { status: 404 }))
				.mockResolvedValueOnce(new Response("Forbidden", { status: 403 }))

			const provider = new ComfyUIProvider()
			const result = await provider.health()

			expect(result).toEqual({ alive: false, message: "HTTP 403" })
			expect(fetchMock).toHaveBeenCalledTimes(2)
		})

		it("should NOT fall back when /system_stats returns a non-404 error (e.g. 500)", async () => {
			const { ComfyUIProvider, fetchMock } = await getComfyUIProvider()

			fetchMock.mockResolvedValueOnce(new Response("Server Error", { status: 500 }))

			const provider = new ComfyUIProvider()
			const result = await provider.health()

			expect(result).toEqual({ alive: false, message: "HTTP 500" })
			// Only one call — no fallback attempt
			expect(fetchMock).toHaveBeenCalledTimes(1)
		})

		it("should return alive:false and error message when fetch throws", async () => {
			const { ComfyUIProvider, fetchMock } = await getComfyUIProvider()

			fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"))

			const provider = new ComfyUIProvider()
			const result = await provider.health()

			expect(result).toEqual({ alive: false, message: "ECONNREFUSED" })
		})

		it("should use the configured baseURL", async () => {
			const { ComfyUIProvider, fetchMock } = await getComfyUIProvider()

			fetchMock.mockResolvedValueOnce(
				new Response(JSON.stringify({ system: { comfyui_version: "0.2.0" } }), { status: 200 }),
			)

			const provider = new ComfyUIProvider("http://localhost:9999")
			await provider.health()

			expect(fetchMock).toHaveBeenCalledWith("http://localhost:9999/system_stats")
		})

		it("should strip trailing slashes from baseURL", async () => {
			const { ComfyUIProvider, fetchMock } = await getComfyUIProvider()

			fetchMock.mockResolvedValueOnce(
				new Response(JSON.stringify({ system: { comfyui_version: "0.2.0" } }), { status: 200 }),
			)

			const provider = new ComfyUIProvider("http://localhost:8188/")
			await provider.health()

			expect(fetchMock).toHaveBeenCalledWith("http://localhost:8188/system_stats")
		})
	})
})

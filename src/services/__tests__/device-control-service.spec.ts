import { describe, it, expect, vi, beforeEach } from "vitest"
import {
	DeviceControlService,
	DeviceFailSafeError,
	DeviceSafetyError,
	clampCoordinates,
	normalizeHotkey,
	redactSensitiveText,
	type DeviceDriver,
} from "../device-control-service"

function createMockDriver(overrides: Partial<DeviceDriver> = {}): DeviceDriver {
	return {
		getScreenSize: vi.fn().mockResolvedValue({ width: 1920, height: 1080 }),
		getCursorPosition: vi.fn().mockResolvedValue({ x: 500, y: 500 }),
		captureScreen: vi.fn().mockResolvedValue({
			buffer: Buffer.from("fake-jpeg"),
			mimeType: "image/jpeg",
			width: 1920,
			height: 1080,
		}),
		moveMouse: vi.fn().mockResolvedValue(undefined),
		click: vi.fn().mockResolvedValue(undefined),
		drag: vi.fn().mockResolvedValue(undefined),
		typeText: vi.fn().mockResolvedValue(undefined),
		pressHotkey: vi.fn().mockResolvedValue(undefined),
		scroll: vi.fn().mockResolvedValue(undefined),
		launchApp: vi.fn().mockResolvedValue(undefined),
		...overrides,
	}
}

describe("DeviceControlService", () => {
	let driver: DeviceDriver
	let service: DeviceControlService

	beforeEach(() => {
		driver = createMockDriver()
		service = new DeviceControlService(driver, { minActionIntervalMs: 0 })
	})

	it("clamps coordinates to screen bounds", () => {
		expect(clampCoordinates(-50, 2000, { width: 1920, height: 1080 })).toEqual({ x: 0, y: 1079 })
		expect(clampCoordinates(500.4, 300.6, { width: 1920, height: 1080 })).toEqual({ x: 500, y: 301 })
	})

	it("normalizes hotkeys consistently", () => {
		expect(normalizeHotkey(["Command", "Q"])).toBe("cmd+q")
		expect(normalizeHotkey(["Control", "Alt", "Delete"])).toBe("ctrl+alt+del")
	})

	it("redacts sensitive text for logs", () => {
		expect(redactSensitiveText("abc")).toBe("****")
		expect(redactSensitiveText("my-secret-password")).toBe("my***(18 chars)")
	})

	it("triggers emergency fail-safe when cursor is in top-left corner (0,0)", async () => {
		driver = createMockDriver({
			getCursorPosition: vi.fn().mockResolvedValue({ x: 2, y: 3 }),
		})
		service = new DeviceControlService(driver, { minActionIntervalMs: 0 })

		await expect(service.click(500, 500)).rejects.toThrow(DeviceFailSafeError)
		expect(driver.click).not.toHaveBeenCalled()
	})

	it("blocks dangerous system hotkeys", async () => {
		await expect(service.pressHotkey(["Command", "Q"])).rejects.toThrow(DeviceSafetyError)
		await expect(service.pressHotkey(["Alt", "F4"])).rejects.toThrow(DeviceSafetyError)
		await expect(service.pressHotkey(["Ctrl", "Alt", "Delete"])).rejects.toThrow(DeviceSafetyError)
		expect(driver.pressHotkey).not.toHaveBeenCalled()
	})

	it("allows safe hotkeys", async () => {
		const combo = await service.pressHotkey(["cmd", "c"])
		expect(combo).toBe("cmd+c")
		expect(driver.pressHotkey).toHaveBeenCalledWith(["cmd", "c"])
	})

	it("enforces session action cap", async () => {
		service = new DeviceControlService(driver, { minActionIntervalMs: 0, maxActionsPerSession: 2 })
		await service.click(100, 100)
		await service.click(200, 200)
		await expect(service.click(300, 300)).rejects.toThrow(DeviceSafetyError)

		service.resetSession()
		await expect(service.click(300, 300)).resolves.toEqual({ x: 300, y: 300 })
	})

	it("respects AbortSignal", async () => {
		const controller = new AbortController()
		controller.abort()
		await expect(service.click(100, 100, "left", 1, controller.signal)).rejects.toThrow(DeviceFailSafeError)
	})
})

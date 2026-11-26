import { describe, it, expect, vi } from "vitest"
import {
	DeviceControlService,
	DeviceFailSafeError,
	DeviceSafetyError,
	type DeviceDriver,
} from "../../services/device-control-service"
import { pruneHistoricalToolResults } from "../../core/task/pruneHistoricalToolResults"
import { validateGitNoVerify, validateGitForcePush } from "../../core/tools/ExecuteCommandTool"

function createRetinaMockDriver(): DeviceDriver {
	return {
		getScreenSize: vi.fn().mockResolvedValue({ width: 1800, height: 1169 }),
		getCursorPosition: vi.fn().mockResolvedValue({ x: 500, y: 500 }),
		captureScreen: vi.fn().mockResolvedValue({
			buffer: Buffer.alloc(150_000),
			mimeType: "image/jpeg",
			width: 1280,
			height: 831,
			actualWidth: 1800,
			actualHeight: 1169,
		}),
		moveMouse: vi.fn().mockResolvedValue(undefined),
		click: vi.fn().mockResolvedValue(undefined),
		drag: vi.fn().mockResolvedValue(undefined),
		typeText: vi.fn().mockResolvedValue(undefined),
		pressHotkey: vi.fn().mockResolvedValue(undefined),
		scroll: vi.fn().mockResolvedValue(undefined),
		launchApp: vi.fn().mockResolvedValue(undefined),
	}
}

describe("Sandboxed Before/After: Device Control, Vision Pruning & Git Guardrails", () => {
	it("BEFORE vs AFTER: downscaled screenshot + coordinate scaling maps 1280x831 -> 1800x1169 accurately", async () => {
		const driver = createRetinaMockDriver()
		const service = new DeviceControlService(driver, { minActionIntervalMs: 0 })

		const cap = await service.screenshot()
		expect(cap.width).toBe(1280)
		expect(cap.actualWidth).toBe(1800)

		// Click center of downscaled image (640, 415) -> should map to ~ (900, 584) on Retina display
		const clicked = await service.click(640, 415)
		expect(clicked.x).toBe(900)
		expect(clicked.y).toBe(584)
		expect(driver.click).toHaveBeenCalledWith(900, 584, "left", 1)
	})

	it("BEFORE vs AFTER: caps active screenshots to 2 (saves >80% vision payload in 10-step GUI loop)", () => {
		const fakeImg = "A".repeat(120_000) // ~120KB base64 per screenshot
		const messages: any[] = []
		for (let i = 0; i < 10; i++) {
			messages.push({
				role: "assistant",
				content: [{ type: "tool_use", id: `t${i}`, name: "device_action", input: { action: "screenshot" } }],
			})
			messages.push({
				role: "user",
				content: [
					{
						type: "tool_result",
						tool_use_id: `t${i}`,
						content: [
							{ type: "text", text: `Captured screen #${i}` },
							{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: fakeImg } },
						],
					},
				],
			})
		}

		const beforeBytes = JSON.stringify(messages).length
		const pruned = pruneHistoricalToolResults(messages, { keepRecentTurns: 12, maxRecentScreenshots: 2 })
		const afterBytes = JSON.stringify(pruned).length

		const remainingImages = pruned.reduce((acc, m) => {
			if (!Array.isArray(m.content)) return acc
			return (
				acc +
				m.content.filter(
					(b: any) =>
						b.type === "tool_result" &&
						Array.isArray(b.content) &&
						b.content.some((p: any) => p.type === "image"),
				).length
			)
		}, 0)

		expect(remainingImages).toBe(2)
		expect(afterBytes).toBeLessThan(beforeBytes * 0.25)
		console.log(
			`[Benchmark] 10-step Device Screenshot History: BEFORE=${(beforeBytes / 1024).toFixed(1)}KB -> AFTER=${(afterBytes / 1024).toFixed(1)}KB (${Math.round((1 - afterBytes / beforeBytes) * 100)}% reduction)`,
		)
	})

	it("validates git --no-verify and git force-push guardrails without false positives", () => {
		// Blocked
		expect(validateGitNoVerify("git push --force --no-verify origin main")).toBeTruthy()
		expect(validateGitNoVerify("git commit -nm 'quick'")).toBeTruthy()
		expect(validateGitForcePush("git push --force origin main")).toBeTruthy()
		expect(validateGitForcePush("git push -f origin master")).toBeTruthy()

		// Allowed
		expect(validateGitNoVerify("git commit -m 'normal'")).toBeNull()
		expect(validateGitForcePush("git push --force origin feat/my-branch")).toBeNull()
		expect(validateGitForcePush("git push origin main")).toBeNull()
	})

	it("triggers corner fail-safe (0,0) and blocks destructive OS hotkeys", async () => {
		const driver = createRetinaMockDriver()
		;(driver.getCursorPosition as any).mockResolvedValueOnce({ x: 0, y: 0 })
		const service = new DeviceControlService(driver, { minActionIntervalMs: 0 })

		await expect(service.click(100, 100)).rejects.toThrow(DeviceFailSafeError)
		await expect(service.pressHotkey(["cmd", "q"])).rejects.toThrow(DeviceSafetyError)
	})
})

/**
 * Cross-platform OS-level Device Control Service ("Control Device" mode).
 *
 * Supports macOS (darwin), Windows (win32), and Linux (linux) with zero
 * fragile native Node C++ addons, plus built-in safety guardrails:
 *   1. Emergency corner fail-safe: moving cursor to (0,0) (<= 5px) aborts immediately.
 *   2. Blocked destructive hotkeys: cmd+q, alt+f4, ctrl+alt+del, etc.
 *   3. Coordinate clamping to actual screen bounds.
 *   4. Action rate limiting & per-session action cap.
 *   5. AbortSignal support.
 */

import { execFile } from "child_process"
import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"
import { promisify } from "util"

const execFileAsync = promisify(execFile)

export class DeviceFailSafeError extends Error {
	constructor(message = "Emergency stop triggered: cursor moved to top-left corner (0,0).") {
		super(message)
		this.name = "DeviceFailSafeError"
	}
}

export class DeviceSafetyError extends Error {
	constructor(message: string) {
		super(message)
		this.name = "DeviceSafetyError"
	}
}

export interface ScreenSize {
	width: number
	height: number
}

export interface CursorPosition {
	x: number
	y: number
}

export interface ScreenCaptureResult {
	buffer: Buffer
	mimeType: "image/jpeg" | "image/png"
	width: number
	height: number
}

export type MouseButton = "left" | "right" | "middle"
export type DeviceExecutionMode = "live" | "background"
export type DeviceScriptLanguage = "applescript" | "powershell" | "bash" | "python"

export interface DeviceDriver {
	getScreenSize(): Promise<ScreenSize>
	getCursorPosition(): Promise<CursorPosition>
	captureScreen(): Promise<ScreenCaptureResult>
	moveMouse(x: number, y: number): Promise<void>
	click(x: number, y: number, button: MouseButton, clicks: 1 | 2): Promise<void>
	drag(x1: number, y1: number, x2: number, y2: number): Promise<void>
	typeText(text: string): Promise<void>
	pressHotkey(keys: string[]): Promise<void>
	scroll(dx: number, dy: number, x?: number, y?: number): Promise<void>
	launchApp(appName: string): Promise<void>
}

export interface DeviceSafetyConfig {
	/** Corner fail-safe threshold in pixels from (0,0). Set 0 to disable. */
	failSafeCornerPx: number
	/** Minimum milliseconds between consecutive input actions. */
	minActionIntervalMs: number
	/** Maximum input actions allowed per session before requiring reset. */
	maxActionsPerSession: number
	/** Normalized hotkey combos that are blocked for safety. */
	blockedHotkeys: string[]
}

export const DEFAULT_SAFETY_CONFIG: DeviceSafetyConfig = {
	failSafeCornerPx: 5,
	minActionIntervalMs: 80,
	maxActionsPerSession: 200,
	blockedHotkeys: [
		"cmd+q",
		"command+q",
		"alt+f4",
		"ctrl+alt+delete",
		"ctrl+alt+del",
		"cmd+option+esc",
		"cmd+alt+esc",
		"win+l",
		"super+l",
		"ctrl+shift+q",
		"cmd+shift+q",
	],
}

export function normalizeHotkey(keys: string[]): string {
	const aliases: Record<string, string> = {
		command: "cmd",
		meta: "cmd",
		super: "cmd",
		control: "ctrl",
		option: "alt",
		escape: "esc",
		delete: "del",
	}
	return keys
		.map((k) => {
			const lower = k.trim().toLowerCase()
			return aliases[lower] ?? lower
		})
		.filter(Boolean)
		.join("+")
}

export function clampCoordinates(x: number, y: number, screen: ScreenSize): CursorPosition {
	return {
		x: Math.max(0, Math.min(Math.round(x), Math.max(0, screen.width - 1))),
		y: Math.max(0, Math.min(Math.round(y), Math.max(0, screen.height - 1))),
	}
}

export function redactSensitiveText(text: string): string {
	if (!text) return ""
	if (text.length <= 4) return "****"
	return `${text.slice(0, 2)}***(${text.length} chars)`
}

// ---------------------------------------------------------------------------
// macOS Driver (screencapture + compiled Swift CoreGraphics helper + open)
// ---------------------------------------------------------------------------

const MAC_SWIFT_HELPER = `
import Foundation
import CoreGraphics
import AppKit

let args = CommandLine.arguments
guard args.count >= 2 else { exit(1) }
let cmd = args[1]

func mainScreenSize() -> (Int, Int) {
    let rect = CGDisplayBounds(CGMainDisplayID())
    return (Int(rect.width), Int(rect.height))
}

switch cmd {
case "size":
    let (w, h) = mainScreenSize()
    print("\\(w),\\(h)")
case "pos":
    let loc = NSEvent.mouseLocation
    let (_, h) = mainScreenSize()
    let y = Double(h) - loc.y
    print("\\(Int(loc.x)),\\(Int(y))")
case "move":
    let x = Double(args[2]) ?? 0
    let y = Double(args[3]) ?? 0
    let ev = CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: CGPoint(x: x, y: y), mouseButton: .left)
    ev?.post(tap: .cghidEventTap)
case "click":
    let x = Double(args[2]) ?? 0
    let y = Double(args[3]) ?? 0
    let btnStr = args.count > 4 ? args[4] : "left"
    let clicks = Int(args.count > 5 ? args[5] : "1") ?? 1
    let pt = CGPoint(x: x, y: y)
    let (downType, upType, btn): (CGEventType, CGEventType, CGMouseButton) = {
        switch btnStr {
        case "right": return (.rightMouseDown, .rightMouseUp, .right)
        case "middle": return (.otherMouseDown, .otherMouseUp, .center)
        default: return (.leftMouseDown, .leftMouseUp, .left)
        }
    }()
    for i in 1...max(1, clicks) {
        let down = CGEvent(mouseEventSource: nil, mouseType: downType, mouseCursorPosition: pt, mouseButton: btn)
        down?.setIntegerValueField(.mouseEventClickState, value: Int64(i))
        let up = CGEvent(mouseEventSource: nil, mouseType: upType, mouseCursorPosition: pt, mouseButton: btn)
        up?.setIntegerValueField(.mouseEventClickState, value: Int64(i))
        down?.post(tap: .cghidEventTap)
        up?.post(tap: .cghidEventTap)
    }
case "drag":
    let x1 = Double(args[2]) ?? 0
    let y1 = Double(args[3]) ?? 0
    let x2 = Double(args[4]) ?? 0
    let y2 = Double(args[5]) ?? 0
    let p1 = CGPoint(x: x1, y: y1)
    let p2 = CGPoint(x: x2, y: y2)
    CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: p1, mouseButton: .left)?.post(tap: .cghidEventTap)
    usleep(50000)
    CGEvent(mouseEventSource: nil, mouseType: .leftMouseDragged, mouseCursorPosition: p2, mouseButton: .left)?.post(tap: .cghidEventTap)
    usleep(50000)
    CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: p2, mouseButton: .left)?.post(tap: .cghidEventTap)
case "scroll":
    let dx = Int32(args[2]) ?? 0
    let dy = Int32(args[3]) ?? 0
    if args.count >= 6, let x = Double(args[4]), let y = Double(args[5]) {
        CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: CGPoint(x: x, y: y), mouseButton: .left)?.post(tap: .cghidEventTap)
    }
    let ev = CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 2, wheel1: dy, wheel2: dx, wheel3: 0)
    ev?.post(tap: .cghidEventTap)
default:
    exit(1)
}
`

export class MacDeviceDriver implements DeviceDriver {
	private helperPath = path.join(os.tmpdir(), "mirror-device-helper")
	private helperCompiled = false
	private compilePromise: Promise<string> | null = null

	private async ensureHelper(): Promise<string> {
		if (this.helperCompiled) return this.helperPath
		if (this.compilePromise) return this.compilePromise
		this.compilePromise = (async () => {
			try {
				await fs.access(this.helperPath)
				this.helperCompiled = true
				return this.helperPath
			} catch {
				const swiftSrc = `${this.helperPath}.swift`
				await fs.writeFile(swiftSrc, MAC_SWIFT_HELPER, "utf8")
				await execFileAsync("swiftc", [swiftSrc, "-o", this.helperPath], { timeout: 120000 })
				this.helperCompiled = true
				return this.helperPath
			} finally {
				this.compilePromise = null
			}
		})()
		return this.compilePromise
	}

	private async runHelper(args: string[]): Promise<string> {
		const bin = await this.ensureHelper()
		const { stdout } = await execFileAsync(bin, args, { timeout: 10000 })
		return stdout.trim()
	}

	async getScreenSize(): Promise<ScreenSize> {
		if (this.helperCompiled) {
			const out = await this.runHelper(["size"])
			const [w, h] = out.split(",").map(Number)
			return { width: w || 1440, height: h || 900 }
		}
		try {
			const { stdout } = await execFileAsync(
				"osascript",
				["-e", 'tell application "Finder" to get bounds of window of desktop'],
				{ timeout: 5000 },
			)
			const parts = stdout
				.trim()
				.split(",")
				.map((s) => Number(s.trim()))
			if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
				return { width: parts[2], height: parts[3] }
			}
		} catch {
			// fall back to Swift helper
		}
		const out = await this.runHelper(["size"])
		const [w, h] = out.split(",").map(Number)
		return { width: w || 1440, height: h || 900 }
	}

	async getCursorPosition(): Promise<CursorPosition> {
		const out = await this.runHelper(["pos"])
		const [x, y] = out.split(",").map(Number)
		return { x: x ?? 100, y: y ?? 100 }
	}

	async captureScreen(): Promise<ScreenCaptureResult> {
		const tmpFile = path.join(os.tmpdir(), `mirror-screen-${Date.now()}.jpg`)
		try {
			await execFileAsync("screencapture", ["-x", "-t", "jpg", tmpFile], { timeout: 10000 })
			const buffer = await fs.readFile(tmpFile)
			const size = await this.getScreenSize()
			return { buffer, mimeType: "image/jpeg", width: size.width, height: size.height }
		} finally {
			await fs.unlink(tmpFile).catch(() => {})
		}
	}

	async moveMouse(x: number, y: number): Promise<void> {
		await this.runHelper(["move", String(x), String(y)])
	}

	async click(x: number, y: number, button: MouseButton, clicks: 1 | 2): Promise<void> {
		await this.runHelper(["click", String(x), String(y), button, String(clicks)])
	}

	async drag(x1: number, y1: number, x2: number, y2: number): Promise<void> {
		await this.runHelper(["drag", String(x1), String(y1), String(x2), String(y2)])
	}

	async typeText(text: string): Promise<void> {
		const escaped = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
		await execFileAsync("osascript", ["-e", `tell application "System Events" to keystroke "${escaped}"`], {
			timeout: 10000,
		})
	}

	async pressHotkey(keys: string[]): Promise<void> {
		const modifiers: string[] = []
		let mainKey = ""
		for (const k of keys) {
			const lower = k.trim().toLowerCase()
			if (lower === "cmd" || lower === "command" || lower === "meta") modifiers.push("command down")
			else if (lower === "ctrl" || lower === "control") modifiers.push("control down")
			else if (lower === "alt" || lower === "option") modifiers.push("option down")
			else if (lower === "shift") modifiers.push("shift down")
			else mainKey = lower
		}
		const modClause = modifiers.length > 0 ? ` using {${modifiers.join(", ")}}` : ""
		const keyMap: Record<string, number> = {
			enter: 36,
			return: 36,
			tab: 48,
			space: 49,
			backspace: 51,
			esc: 53,
			escape: 53,
			left: 123,
			right: 124,
			down: 125,
			up: 126,
		}
		const script =
			mainKey in keyMap
				? `tell application "System Events" to key code ${keyMap[mainKey]}${modClause}`
				: `tell application "System Events" to keystroke "${mainKey}"${modClause}`
		await execFileAsync("osascript", ["-e", script], { timeout: 10000 })
	}

	async scroll(dx: number, dy: number, x?: number, y?: number): Promise<void> {
		const args = ["scroll", String(Math.round(dx)), String(Math.round(dy))]
		if (x !== undefined && y !== undefined) {
			args.push(String(Math.round(x)), String(Math.round(y)))
		}
		await this.runHelper(args)
	}

	async launchApp(appName: string, background = false): Promise<void> {
		const args = background ? ["-g", "-a", appName] : ["-a", appName]
		await execFileAsync("open", args, { timeout: 10000 })
	}
}

// ---------------------------------------------------------------------------
// Windows Driver (PowerShell + System.Drawing + user32.dll)
// ---------------------------------------------------------------------------

export class WindowsDeviceDriver implements DeviceDriver {
	private async runPs(script: string): Promise<string> {
		const { stdout } = await execFileAsync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], {
			timeout: 15000,
		})
		return stdout.trim()
	}

	async getScreenSize(): Promise<ScreenSize> {
		const out = await this.runPs(
			`Add-Type -AssemblyName System.Windows.Forms; $b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; "$($b.Width),$($b.Height)"`,
		)
		const [w, h] = out.split(",").map(Number)
		return { width: w || 1920, height: h || 1080 }
	}

	async getCursorPosition(): Promise<CursorPosition> {
		const out = await this.runPs(
			`Add-Type -AssemblyName System.Windows.Forms; $p=[System.Windows.Forms.Cursor]::Position; "$($p.X),$($p.Y)"`,
		)
		const [x, y] = out.split(",").map(Number)
		return { x: x ?? 100, y: y ?? 100 }
	}

	async captureScreen(): Promise<ScreenCaptureResult> {
		const tmpFile = path.join(os.tmpdir(), `mirror-screen-${Date.now()}.jpg`)
		try {
			await this.runPs(
				`Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $bmp=New-Object System.Drawing.Bitmap($b.Width,$b.Height); $g=[System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size); $bmp.Save('${tmpFile.replace(/'/g, "''")}',[System.Drawing.Imaging.ImageFormat]::Jpeg); $g.Dispose(); $bmp.Dispose()`,
			)
			const buffer = await fs.readFile(tmpFile)
			const size = await this.getScreenSize()
			return { buffer, mimeType: "image/jpeg", width: size.width, height: size.height }
		} finally {
			await fs.unlink(tmpFile).catch(() => {})
		}
	}

	async moveMouse(x: number, y: number): Promise<void> {
		await this.runPs(
			`Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x},${y})`,
		)
	}

	async click(x: number, y: number, button: MouseButton, clicks: 1 | 2): Promise<void> {
		const [downFlag, upFlag] = button === "right" ? [0x08, 0x10] : button === "middle" ? [0x20, 0x40] : [0x02, 0x04]
		await this.runPs(
			`Add-Type -AssemblyName System.Windows.Forms; Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void mouse_event(int f, int dx, int dy, int c, int info);' -Name U32 -Namespace W; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x},${y}); for($i=0;$i -lt ${clicks};$i++){ [W.U32]::mouse_event(${downFlag},0,0,0,0); [W.U32]::mouse_event(${upFlag},0,0,0,0); }`,
		)
	}

	async drag(x1: number, y1: number, x2: number, y2: number): Promise<void> {
		await this.runPs(
			`Add-Type -AssemblyName System.Windows.Forms; Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void mouse_event(int f, int dx, int dy, int c, int info);' -Name U32 -Namespace W; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x1},${y1}); [W.U32]::mouse_event(2,0,0,0,0); Start-Sleep -Milliseconds 60; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x2},${y2}); Start-Sleep -Milliseconds 60; [W.U32]::mouse_event(4,0,0,0,0)`,
		)
	}

	async typeText(text: string): Promise<void> {
		const escaped = text.replace(/([+^%~(){}[\]])/g, "{$1}").replace(/'/g, "''")
		await this.runPs(
			`Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${escaped}')`,
		)
	}

	async pressHotkey(keys: string[]): Promise<void> {
		let prefix = ""
		let mainKey = ""
		for (const k of keys) {
			const lower = k.trim().toLowerCase()
			if (lower === "ctrl" || lower === "control") prefix += "^"
			else if (lower === "alt") prefix += "%"
			else if (lower === "shift") prefix += "+"
			else mainKey = lower.length > 1 ? `{${lower.toUpperCase()}}` : lower
		}
		await this.runPs(
			`Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${prefix}${mainKey}')`,
		)
	}

	async scroll(_dx: number, dy: number, x?: number, y?: number): Promise<void> {
		const move =
			x !== undefined && y !== undefined
				? `[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x},${y}); `
				: ""
		await this.runPs(
			`Add-Type -AssemblyName System.Windows.Forms; Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void mouse_event(int f, int dx, int dy, int c, int info);' -Name U32 -Namespace W; ${move}[W.U32]::mouse_event(0x0800,0,0,${Math.round(dy)},0)`,
		)
	}

	async launchApp(appName: string): Promise<void> {
		await this.runPs(`Start-Process '${appName.replace(/'/g, "''")}'`)
	}
}

// ---------------------------------------------------------------------------
// Linux Driver (scrot / xdotool)
// ---------------------------------------------------------------------------

export class LinuxDeviceDriver implements DeviceDriver {
	async getScreenSize(): Promise<ScreenSize> {
		const { stdout } = await execFileAsync("xdotool", ["getdisplaygeometry"], { timeout: 5000 })
		const [w, h] = stdout.trim().split(/\s+/).map(Number)
		return { width: w || 1920, height: h || 1080 }
	}

	async getCursorPosition(): Promise<CursorPosition> {
		const { stdout } = await execFileAsync("xdotool", ["getmouselocation", "--shell"], { timeout: 5000 })
		const x = Number(stdout.match(/X=(\d+)/)?.[1] ?? 100)
		const y = Number(stdout.match(/Y=(\d+)/)?.[1] ?? 100)
		return { x, y }
	}

	async captureScreen(): Promise<ScreenCaptureResult> {
		const tmpFile = path.join(os.tmpdir(), `mirror-screen-${Date.now()}.png`)
		try {
			await execFileAsync("scrot", [tmpFile], { timeout: 10000 })
			const buffer = await fs.readFile(tmpFile)
			const size = await this.getScreenSize()
			return { buffer, mimeType: "image/png", width: size.width, height: size.height }
		} finally {
			await fs.unlink(tmpFile).catch(() => {})
		}
	}

	async moveMouse(x: number, y: number): Promise<void> {
		await execFileAsync("xdotool", ["mousemove", String(x), String(y)], { timeout: 5000 })
	}

	async click(x: number, y: number, button: MouseButton, clicks: 1 | 2): Promise<void> {
		const btnNum = button === "right" ? "3" : button === "middle" ? "2" : "1"
		await execFileAsync(
			"xdotool",
			["mousemove", String(x), String(y), "click", "--repeat", String(clicks), btnNum],
			{ timeout: 5000 },
		)
	}

	async drag(x1: number, y1: number, x2: number, y2: number): Promise<void> {
		await execFileAsync(
			"xdotool",
			[
				"mousemove",
				String(x1),
				String(y1),
				"mousedown",
				"1",
				"mousemove",
				String(x2),
				String(y2),
				"mouseup",
				"1",
			],
			{ timeout: 5000 },
		)
	}

	async typeText(text: string): Promise<void> {
		await execFileAsync("xdotool", ["type", "--delay", "12", text], { timeout: 10000 })
	}

	async pressHotkey(keys: string[]): Promise<void> {
		const combo = keys.map((k) => k.trim()).join("+")
		await execFileAsync("xdotool", ["key", combo], { timeout: 5000 })
	}

	async scroll(_dx: number, dy: number, x?: number, y?: number): Promise<void> {
		if (x !== undefined && y !== undefined) {
			await this.moveMouse(x, y)
		}
		const btn = dy < 0 ? "5" : "4"
		const repeats = Math.max(1, Math.min(20, Math.round(Math.abs(dy) / 50)))
		await execFileAsync("xdotool", ["click", "--repeat", String(repeats), btn], { timeout: 5000 })
	}

	async launchApp(appName: string): Promise<void> {
		await execFileAsync("sh", ["-c", `nohup ${JSON.stringify(appName)} >/dev/null 2>&1 &`], { timeout: 5000 })
	}
}

// ---------------------------------------------------------------------------
// DeviceControlService (Singleton + Safety & Guardrails Layer)
// ---------------------------------------------------------------------------

export class DeviceControlService {
	private static instance: DeviceControlService | undefined
	private driver: DeviceDriver
	private config: DeviceSafetyConfig
	private actionCount = 0
	private lastActionAt = 0

	constructor(driver?: DeviceDriver, config: Partial<DeviceSafetyConfig> = {}) {
		this.driver = driver ?? DeviceControlService.createPlatformDriver()
		this.config = { ...DEFAULT_SAFETY_CONFIG, ...config }
	}

	public static getInstance(): DeviceControlService {
		if (!DeviceControlService.instance) {
			DeviceControlService.instance = new DeviceControlService()
		}
		return DeviceControlService.instance
	}

	public static createPlatformDriver(platform: NodeJS.Platform = process.platform): DeviceDriver {
		if (platform === "darwin") return new MacDeviceDriver()
		if (platform === "win32") return new WindowsDeviceDriver()
		if (platform === "linux") return new LinuxDeviceDriver()
		throw new Error(`Unsupported platform for device control: ${platform}`)
	}

	public resetSession(): void {
		this.actionCount = 0
		this.lastActionAt = 0
	}

	public getActionCount(): number {
		return this.actionCount
	}

	private async enforceGuardrails(signal?: AbortSignal): Promise<void> {
		if (signal?.aborted) {
			throw new DeviceFailSafeError("Device action aborted by user.")
		}

		if (this.actionCount >= this.config.maxActionsPerSession) {
			throw new DeviceSafetyError(
				`Session action limit reached (${this.config.maxActionsPerSession} actions). Reset or start a new task to continue.`,
			)
		}

		// Corner fail-safe check: cursor in top-left corner (0,0)
		if (this.config.failSafeCornerPx > 0) {
			const pos = await this.driver.getCursorPosition()
			if (pos.x <= this.config.failSafeCornerPx && pos.y <= this.config.failSafeCornerPx) {
				throw new DeviceFailSafeError(
					`Emergency stop triggered: cursor at (${pos.x}, ${pos.y}) is inside top-left fail-safe corner.`,
				)
			}
		}

		// Rate limiting
		const elapsed = Date.now() - this.lastActionAt
		if (elapsed < this.config.minActionIntervalMs) {
			await new Promise((r) => setTimeout(r, this.config.minActionIntervalMs - elapsed))
		}

		this.actionCount += 1
		this.lastActionAt = Date.now()
	}

	public async screenshot(signal?: AbortSignal): Promise<ScreenCaptureResult> {
		if (signal?.aborted) throw new DeviceFailSafeError("Screenshot aborted by user.")
		return this.driver.captureScreen()
	}

	public async click(
		x: number,
		y: number,
		button: MouseButton = "left",
		clicks: 1 | 2 = 1,
		signal?: AbortSignal,
	): Promise<CursorPosition> {
		await this.enforceGuardrails(signal)
		const screen = await this.driver.getScreenSize()
		const clamped = clampCoordinates(x, y, screen)
		await this.driver.click(clamped.x, clamped.y, button, clicks)
		return clamped
	}

	public async move(x: number, y: number, signal?: AbortSignal): Promise<CursorPosition> {
		await this.enforceGuardrails(signal)
		const screen = await this.driver.getScreenSize()
		const clamped = clampCoordinates(x, y, screen)
		await this.driver.moveMouse(clamped.x, clamped.y)
		return clamped
	}

	public async drag(
		x1: number,
		y1: number,
		x2: number,
		y2: number,
		signal?: AbortSignal,
	): Promise<{ from: CursorPosition; to: CursorPosition }> {
		await this.enforceGuardrails(signal)
		const screen = await this.driver.getScreenSize()
		const from = clampCoordinates(x1, y1, screen)
		const to = clampCoordinates(x2, y2, screen)
		await this.driver.drag(from.x, from.y, to.x, to.y)
		return { from, to }
	}

	public async typeText(text: string, signal?: AbortSignal): Promise<void> {
		await this.enforceGuardrails(signal)
		await this.driver.typeText(text)
	}

	public async pressHotkey(keys: string[], signal?: AbortSignal): Promise<string> {
		const normalized = normalizeHotkey(keys)
		if (this.config.blockedHotkeys.includes(normalized)) {
			throw new DeviceSafetyError(
				`Blocked dangerous hotkey "${normalized}" for safety. Destructive system shortcuts are disabled.`,
			)
		}
		await this.enforceGuardrails(signal)
		await this.driver.pressHotkey(keys)
		return normalized
	}

	public async scroll(dx: number, dy: number, x?: number, y?: number, signal?: AbortSignal): Promise<void> {
		await this.enforceGuardrails(signal)
		if (x !== undefined && y !== undefined) {
			const screen = await this.driver.getScreenSize()
			const clamped = clampCoordinates(x, y, screen)
			await this.driver.scroll(dx, dy, clamped.x, clamped.y)
		} else {
			await this.driver.scroll(dx, dy)
		}
	}

	public async launchApp(appName: string, signal?: AbortSignal, mode: DeviceExecutionMode = "live"): Promise<void> {
		await this.enforceGuardrails(signal)
		if (mode === "background" && this.driver instanceof MacDeviceDriver) {
			await this.driver.launchApp(appName, true)
			return
		}
		await this.driver.launchApp(appName)
	}

	public async runBackgroundScript(
		script: string,
		language: DeviceScriptLanguage = process.platform === "win32"
			? "powershell"
			: process.platform === "darwin"
				? "applescript"
				: "bash",
		signal?: AbortSignal,
	): Promise<string> {
		await this.enforceGuardrails(signal)
		if (language === "applescript") {
			const { stdout } = await execFileAsync("osascript", ["-e", script], { timeout: 60000 })
			return stdout.trim()
		}
		if (language === "powershell") {
			const { stdout } = await execFileAsync(
				"powershell",
				["-NoProfile", "-NonInteractive", "-Command", script],
				{ timeout: 60000 },
			)
			return stdout.trim()
		}
		if (language === "python") {
			const { stdout } = await execFileAsync("python3", ["-c", script], { timeout: 60000 })
			return stdout.trim()
		}
		const { stdout } = await execFileAsync("bash", ["-c", script], { timeout: 60000 })
		return stdout.trim()
	}

	public async wait(ms: number, signal?: AbortSignal): Promise<void> {
		const clampedMs = Math.max(0, Math.min(ms, 30000))
		await new Promise<void>((resolve, reject) => {
			if (signal?.aborted) return reject(new DeviceFailSafeError("Wait aborted by user."))
			const timer = setTimeout(resolve, clampedMs)
			signal?.addEventListener(
				"abort",
				() => {
					clearTimeout(timer)
					reject(new DeviceFailSafeError("Wait aborted by user."))
				},
				{ once: true },
			)
		})
	}
}

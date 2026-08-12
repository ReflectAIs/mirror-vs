/**
 * Platform-specific utilities for the image runtime.
 */
import os from "os"
import path from "path"

export type PlatformOS = "macos" | "windows" | "linux"

export function getPlatformOS(): PlatformOS {
	const platform = os.platform()
	if (platform === "darwin") return "macos"
	if (platform === "win32") return "windows"
	return "linux"
}

export function getArchitecture(): string {
	return os.arch()
}

export function getTotalRAM(): number {
	return os.totalmem()
}

export function getComfyUIDownloadUrl(os_platform?: PlatformOS): string {
	const platform = os_platform || getPlatformOS()
	if (platform === "windows") {
		return "https://github.com/comfyanonymous/ComfyUI/releases/latest/download/ComfyUI_windows_portable_nvidia.7z"
	}
	return "https://github.com/Comfy-Org/ComfyUI.git"
}

export function getDefaultComfyUIPath(): string {
	const home = os.homedir()
	const p = getPlatformOS()
	switch (p) {
		case "macos":
			return `${home}/Library/Application Support/mirror-vs/comfyui`
		case "windows":
			return `${home}\\AppData\\Roaming\\mirror-vs\\comfyui`
		case "linux":
			return `${home}/.local/share/mirror-vs/comfyui`
	}
}

/**
 * Find (and auto-install if needed) a Python binary compatible with local
 * image generation tools (requires 3.10 ≤ version < 3.13).
 *
 * Strategy:
 * 1. Try commonly-named binaries: python3.12, python3.11, python3.10, python, py
 * 2. macOS: auto-install python@3.12 via Homebrew if missing
 * 3. Linux: auto-install python3.12 via apt-get if missing
 *
 * @returns The path or name of a compatible Python executable.
 * @throws If no compatible Python can be found or installed.
 */
export async function findCompatiblePython(): Promise<string> {
	const candidates =
		process.platform === "win32"
			? ["py -3.12", "py -3.11", "py -3.10", "python3.12", "python3.11", "python3.10", "python", "python3"]
			: ["python3.12", "python3.11", "python3.10", "python3"]

	for (const py of candidates) {
		try {
			const { execSync } = await import("child_process")
			const output = execSync(`"${py}" --version`, { stdio: "pipe", encoding: "utf-8" }).trim()
			// Validate version string (e.g. Python 3.12.2)
			const match = output.match(/Python\s+(3\.\d+)/i)
			if (match) {
				const minor = parseInt(match[1].split(".")[1], 10)
				if (minor >= 10 && minor <= 12) {
					return py
				}
			}
		} catch {
			// not found, try next
		}
	}

	// macOS: auto-install python@3.12 via Homebrew
	if (process.platform === "darwin") {
		try {
			const { execSync } = await import("child_process")
			execSync("brew --version", { stdio: "pipe" })
			execSync("brew install python@3.12", { stdio: "inherit" })
			const prefix = execSync("brew --prefix python@3.12", {
				stdio: "pipe",
				encoding: "utf-8",
			})
				.toString()
				.trim()
			const pyPath = path.join(prefix, "bin", "python3.12")
			execSync(`"${pyPath}" --version`, { stdio: "pipe" })
			return pyPath
		} catch {
			// brew not available or install failed — fall through
		}
	}

	// Linux: try apt-get
	if (process.platform === "linux") {
		try {
			const { execSync } = await import("child_process")
			execSync("sudo apt-get update -qq && sudo apt-get install -y -qq python3.12 python3.12-venv", {
				stdio: "inherit",
			})
			execSync("/usr/bin/python3.12 --version", { stdio: "pipe" })
			return "/usr/bin/python3.12"
		} catch {
			// apt not available or install failed — fall through
		}
	}

	throw new Error(
		"Could not find a compatible Python version (3.10, 3.11, or 3.12). " +
			"Please install Python 3.12 and ensure it is available on your PATH.",
	)
}

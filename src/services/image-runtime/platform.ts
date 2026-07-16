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
	const p = os_platform || getPlatformOS()
	const version = "latest"
	switch (p) {
		case "windows":
			return `https://github.com/Comfy-Org/ComfyUI/releases/${version}/download/ComfyUI_windows_portable_nvidia.7z`
		case "macos":
			// macOS no longer offers a portable ZIP; use git clone instead
			return "https://github.com/Comfy-Org/ComfyUI.git"
		case "linux":
			// Linux no longer offers a portable tarball; use git clone instead
			return "https://github.com/Comfy-Org/ComfyUI.git"
	}
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
 * 1. Try already-installed binaries: python3.12, python3.11, python3.10
 * 2. macOS: auto-install python@3.12 via Homebrew
 * 3. Linux: auto-install python3.12 via apt-get
 * 4. Windows: return "python" (portable bundles include their own Python)
 *
 * @returns The path or name of a compatible Python executable.
 * @throws If no compatible Python can be found or installed.
 */
export async function findCompatiblePython(): Promise<string> {
	if (process.platform === "win32") {
		return "python"
	}

	// Try commonly-named compatible versions first
	const candidates = ["python3.12", "python3.11", "python3.10"]
	for (const py of candidates) {
		try {
			const { execSync } = await import("child_process")
			execSync(`"${py}" --version`, { stdio: "pipe" })
			return py
		} catch {
			// not found, try next
		}
	}

	// macOS: auto-install python@3.12 via Homebrew
	if (process.platform === "darwin") {
		try {
			const { execSync } = await import("child_process")
			// Check if brew is available
			execSync("brew --version", { stdio: "pipe" })
			// Install python@3.12 (no-op if already installed)
			execSync("brew install python@3.12", { stdio: "inherit" })
			// Resolve the full path (brew --prefix returns the cellar prefix)
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

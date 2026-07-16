/**
 * ComfyUI Runtime Manager — installs, launches, and monitors a local ComfyUI instance.
 *
 * Installation approach differs per platform:
 * - macOS & Linux: `git clone` + create venv + `pip install`
 * - Windows: Download portable 7z archive and extract
 */
import fs from "fs/promises"
import { existsSync } from "fs"
import path from "path"
import { RuntimeManager, type InstallProgressCallback } from "./runtime-manager"
import { downloadManager } from "./download-manager"
import { getComfyUIDownloadUrl, getDefaultComfyUIPath, findCompatiblePython } from "./platform"

export class ComfyUIManager extends RuntimeManager {
	/**
	 * Path to the ComfyUI source (subdirectory within installPath).
	 * On macOS/Linux this is where `git clone` puts the repo.
	 * On Windows the portable archive extracts directly into installPath.
	 */
	private get comfyUISrcPath(): string {
		// Windows portable archives extract to installPath directly
		// macOS/Linux git clone creates a subdirectory
		return this.isWindows ? this.installPath : path.join(this.installPath, "ComfyUI")
	}

	private get venvPath(): string {
		return path.join(this.installPath, "venv")
	}

	private get venvBinDir(): string {
		return this.isWindows ? path.join(this.venvPath, "Scripts") : path.join(this.venvPath, "bin")
	}

	private get isWindows(): boolean {
		return process.platform === "win32"
	}

	constructor(installPath?: string, port?: number) {
		super("ComfyUI", installPath || getDefaultComfyUIPath(), port || 8188)
	}

	get executableName(): string {
		return this.isWindows ? "python.exe" : "python3"
	}

	/**
	 * On macOS/Linux we launch the venv's python directly.
	 * On Windows the portable archive includes its own python.exe.
	 */
	protected override getExecPath(): string {
		// On Unix we launch the venv python directly so ComfyUI finds its
		// installed dependencies via the venv's site-packages.
		return this.isWindows ? path.join(this.installPath, this.executableName) : path.join(this.venvBinDir, "python3")
	}

	/**
	 * Spawn from the ComfyUI source directory so that relative imports
	 * like `comfy/`, `node_helpers.py` resolve correctly.
	 * On Windows the portable extract puts everything at the root.
	 */
	protected override getCwd(): string {
		return this.comfyUISrcPath
	}

	get downloadUrl(): string {
		return getComfyUIDownloadUrl()
	}

	get defaultModel(): string {
		return "sd_xl_turbo"
	}

	async install(onProgress?: InstallProgressCallback): Promise<void> {
		await fs.mkdir(this.installPath, { recursive: true })

		if (this.isWindows) {
			await this.installWindows(onProgress)
		} else {
			await this.installUnix(onProgress)
		}

		// Create venv + install Python dependencies (Unix only — Windows
		// portable already bundles its own Python and dependencies)
		if (!this.isWindows) {
			onProgress?.("create-venv", "Creating virtual environment...", 30)
			await this.createVenv()
			onProgress?.("create-venv", "Virtual environment ready", 35)
		}
		onProgress?.("install-deps", "Installing Python dependencies...", 35)
		await this.installDependencies(onProgress)

		this.state.installed = true
		this.emit("state-change", { ...this.state })
	}

	private async installWindows(onProgress?: InstallProgressCallback): Promise<void> {
		const { execSync } = await import("child_process")

		// Download portable 7z archive
		onProgress?.("download", "Downloading ComfyUI portable archive...", 18)
		const archivePath = path.join(this.installPath, "comfyui.7z")
		await new Promise<void>((resolve, reject) => {
			downloadManager.once("complete", (event: { id: string; destPath: string }) => {
				if (event.destPath === archivePath) resolve()
			})
			downloadManager.once("error", (event: { id: string; error: string }) => {
				reject(new Error(event.error))
			})
			downloadManager.enqueue(this.downloadUrl, archivePath)
		})

		// Extract
		onProgress?.("extract", "Extracting ComfyUI archive...", 25)
		execSync(`7z x "${archivePath}" -o"${this.installPath}" -y`, { stdio: "inherit" })
	}

	private async installUnix(onProgress?: InstallProgressCallback): Promise<void> {
		const { execSync } = await import("child_process")
		const mainPy = path.join(this.comfyUISrcPath, "main.py")

		// If already fully cloned, skip
		if (existsSync(mainPy)) {
			return
		}

		// If a partial/incomplete checkout exists from a previous failed
		// attempt, remove it first so git clone can write into an empty dir.
		if (existsSync(this.comfyUISrcPath)) {
			await fs.rm(this.comfyUISrcPath, { recursive: true, force: true })
		}

		// Step 1: Find compatible Python (may trigger brew install)
		onProgress?.("check-python", "Checking Python compatibility...", 10)
		try {
			const { findCompatiblePython } = await import("./platform")
			// Pre-cache Python check so it's done before clone
			const python = await findCompatiblePython()
			onProgress?.("check-python", `Using Python: ${python}`, 15)
		} catch {
			// Will fail later in createVenv, don't block clone
		}

		// Step 2: Git clone
		onProgress?.("git-clone", "Cloning ComfyUI repository...", 18)
		try {
			execSync(`git clone --depth 1 https://github.com/Comfy-Org/ComfyUI.git "${this.comfyUISrcPath}"`, {
				cwd: this.installPath,
				stdio: "inherit",
			})
		} catch (err) {
			throw new Error(
				`Failed to clone ComfyUI repository. Please ensure Git is installed on your system.\n` +
					`  Command: git clone --depth 1 https://github.com/Comfy-Org/ComfyUI.git\n` +
					`  Original error: ${(err as Error).message}`,
			)
		}
	}

	private async createVenv(): Promise<void> {
		const { execSync } = await import("child_process")

		// Find a Python 3.10–3.12 compatible with ComfyUI / PyTorch
		const python = await findCompatiblePython()

		// Create venv (skip if it already exists and has python3)
		const venvPython = path.join(this.venvBinDir, "python3")
		if (existsSync(venvPython)) {
			return
		}

		execSync(`"${python}" -m venv "${this.venvPath}"`, { stdio: "inherit" })
	}

	async uninstall(): Promise<void> {
		if (this.state.running) {
			await this.stop()
		}

		await fs.rm(this.installPath, { recursive: true, force: true })
		this.state.installed = false
		this.emit("state-change", { ...this.state })
	}

	async healthCheck(): Promise<boolean> {
		try {
			// Try /system_stats first (ComfyUI >= ~v0.2.0)
			const res = await fetch(`http://127.0.0.1:${this.port}/system_stats`)
			if (res.ok) return true

			// Fall back to /object_info for older ComfyUI builds that
			// don't ship the /system_stats endpoint at all (HTTP 404).
			if (res.status === 404) {
				const fallbackRes = await fetch(`http://127.0.0.1:${this.port}/object_info`)
				return fallbackRes.ok
			}

			return false
		} catch {
			return false
		}
	}

	protected getLaunchArgs(): string[] {
		// On Unix: exec is venv/bin/python3, so args[0] is the script.
		// On Windows: exec is the portable python.exe, so args[0] is the script.
		return ["main.py", "--port", String(this.port), "--listen", "127.0.0.1", "--disable-auto-launch"]
	}

	protected getLaunchEnv(): Record<string, string> {
		return {
			PYTHONUNBUFFERED: "1",
		}
	}

	private async installDependencies(onProgress?: InstallProgressCallback): Promise<void> {
		const requirementsPath = path.join(this.comfyUISrcPath, "requirements.txt")
		if (existsSync(requirementsPath)) {
			const { execSync } = await import("child_process")
			onProgress?.("pip-install", "Installing ComfyUI dependencies (this may take several minutes)...", 38)
			const pipCmd = this.isWindows
				? `"${path.join(this.installPath, "python.exe")}" -m pip install -r "${requirementsPath}"`
				: `"${path.join(this.venvBinDir, "pip")}" install -r "${requirementsPath}"`
			execSync(pipCmd, { cwd: this.comfyUISrcPath, stdio: "inherit" })
			onProgress?.("pip-install", "Dependencies installed", 45)
		}
	}
}

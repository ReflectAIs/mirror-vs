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
	 * Cloned into `installPath/ComfyUI` or extracted into root.
	 */
	public get comfyUISrcPath(): string {
		const subDir = path.join(this.installPath, "ComfyUI")
		if (existsSync(subDir)) {
			return subDir
		}
		return this.installPath
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
	 * Resolves the Python executable path across platforms and setups.
	 * Checks venv, embedded portable Python, or root directory.
	 */
	protected override getExecPath(): string {
		const venvExec = path.join(this.venvBinDir, this.executableName)
		if (existsSync(venvExec)) {
			return venvExec
		}

		const embeddedExec = path.join(this.installPath, "python_embeded", "python.exe")
		if (this.isWindows && existsSync(embeddedExec)) {
			return embeddedExec
		}

		const rootExec = path.join(this.installPath, this.executableName)
		if (existsSync(rootExec)) {
			return rootExec
		}

		return venvExec
	}

	/**
	 * Working directory from which ComfyUI is launched.
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
			const archivePath = path.join(this.installPath, "comfyui_portable.7z")
			onProgress?.("download-runtime", "Downloading ComfyUI Windows Portable...", 10)

			// Download portable archive
			await new Promise<void>((resolve, reject) => {
				const onProgressHandler = (p: {
					id: string
					downloadedBytes: number
					totalBytes: number
					progress: number
				}) => {
					// Scale download progress from 10% to 75%
					const scaled = 10 + Math.round((p.progress / 100) * 65)
					onProgress?.("download-runtime", `Downloading ComfyUI Windows Portable (${p.progress}%)...`, scaled)
				}
				downloadManager.on("progress", onProgressHandler)
				downloadManager.once("complete", () => {
					downloadManager.off("progress", onProgressHandler)
					resolve()
				})
				downloadManager.once("error", (e) => {
					downloadManager.off("progress", onProgressHandler)
					reject(new Error(e.error))
				})
				downloadManager.enqueue(this.downloadUrl, archivePath)
			})

			onProgress?.("extract-runtime", "Extracting ComfyUI Windows Portable...", 80)
			await this.extractArchive(archivePath, this.installPath)

			// Clean up archive
			try {
				await fs.rm(archivePath, { force: true })
			} catch {
				// ignore cleanup error
			}
		} else {
			onProgress?.("git-clone", "Setting up ComfyUI source repository...", 15)
			await this.cloneRepo(onProgress)

			onProgress?.("create-venv", "Creating virtual environment...", 30)
			await this.createVenv()

			onProgress?.("install-deps", "Installing Python dependencies...", 35)
			await this.installDependencies(onProgress)
		}

		this.state.installed = true
		this.emit("state-change", { ...this.state })
	}

	private async extractArchive(archivePath: string, destDir: string): Promise<void> {
		const { execSync } = await import("child_process")
		try {
			// Using Windows tar.exe which natively extracts .7z / .zip
			execSync(`tar -xf "${archivePath}" -C "${destDir}"`, { stdio: "inherit" })
		} catch (err) {
			throw new Error(
				`Failed to extract ComfyUI archive. Please ensure you have tar or a compatible extractor.\n` +
					`  Original error: ${(err as Error).message}`,
			)
		}
	}

	private async cloneRepo(onProgress?: InstallProgressCallback): Promise<void> {
		const { execSync } = await import("child_process")
		const cloneTarget = path.join(this.installPath, "ComfyUI")
		const mainPy = path.join(cloneTarget, "main.py")
		const rootMainPy = path.join(this.installPath, "main.py")

		if (existsSync(mainPy) || existsSync(rootMainPy)) {
			return
		}

		if (existsSync(cloneTarget)) {
			await fs.rm(cloneTarget, { recursive: true, force: true })
		}

		onProgress?.("check-python", "Checking Python compatibility...", 10)
		try {
			const { findCompatiblePython } = await import("./platform")
			const python = await findCompatiblePython()
			onProgress?.("check-python", `Using Python: ${python}`, 15)
		} catch {
			// Will fail later in createVenv if Python is completely missing
		}

		onProgress?.("git-clone", "Cloning ComfyUI repository...", 18)
		try {
			execSync(`git clone --depth 1 https://github.com/Comfy-Org/ComfyUI.git "${cloneTarget}"`, {
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
		const venvPython = path.join(this.venvBinDir, this.executableName)

		if (existsSync(venvPython)) {
			return
		}

		const python = await findCompatiblePython()
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
			const res = await fetch(`http://127.0.0.1:${this.port}/system_stats`)
			if (res.ok) return true

			if (res.status === 404) {
				const fallbackRes = await fetch(`http://127.0.0.1:${this.port}/object_info`)
				return fallbackRes.ok
			}

			return false
		} catch {
			return false
		}
	}

	protected override async getLaunchArgs(): Promise<string[]> {
		const { HardwareDetector } = await import("./hardware-detector")
		const hwFlags = await HardwareDetector.getRecommendedFlags()
		return ["main.py", "--port", String(this.port), "--listen", "127.0.0.1", "--disable-auto-launch", ...hwFlags]
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
			onProgress?.("pip-install", "Installing ComfyUI dependencies...", 38)

			const venvPython = path.join(this.venvBinDir, this.executableName)
			const pipCmd = existsSync(venvPython)
				? `"${venvPython}" -m pip install -r "${requirementsPath}"`
				: this.isWindows
					? `"${path.join(this.installPath, "python.exe")}" -m pip install -r "${requirementsPath}"`
					: `"${path.join(this.venvBinDir, "pip")}" install -r "${requirementsPath}"`

			execSync(pipCmd, { cwd: this.comfyUISrcPath, stdio: "inherit" })
			onProgress?.("pip-install", "Dependencies installed", 45)
		}
	}
}

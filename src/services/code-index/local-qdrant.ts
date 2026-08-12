import * as vscode from "vscode"
import { spawn, ChildProcess, execSync } from "child_process"
import { existsSync } from "fs"
import fs from "fs/promises"
import path from "path"
import os from "os"
import { downloadManager } from "../image-runtime/download-manager"

export class LocalQdrantManager {
	private static instance: LocalQdrantManager
	private process: ChildProcess | null = null
	private installPath: string

	private constructor(private readonly context: vscode.ExtensionContext) {
		this.installPath = path.join(context.globalStorageUri.fsPath, "qdrant-bin")
	}

	public static getInstance(context: vscode.ExtensionContext): LocalQdrantManager {
		if (!LocalQdrantManager.instance) {
			LocalQdrantManager.instance = new LocalQdrantManager(context)
		}
		return LocalQdrantManager.instance
	}

	private getBinaryName(): string {
		return os.platform() === "win32" ? "qdrant.exe" : "qdrant"
	}

	public getBinaryPath(): string {
		return path.join(this.installPath, this.getBinaryName())
	}

	public getCwd(): string {
		return this.installPath
	}

	public async isInstalled(): Promise<boolean> {
		return existsSync(this.getBinaryPath())
	}

	private getDownloadUrl(): string {
		const platform = os.platform()
		const arch = os.arch()
		const version = "v1.11.0" // Stable Qdrant version

		if (platform === "darwin") {
			if (arch === "arm64") {
				return `https://github.com/qdrant/qdrant/releases/download/${version}/qdrant-aarch64-apple-darwin.tar.gz`
			}
			return `https://github.com/qdrant/qdrant/releases/download/${version}/qdrant-x86_64-apple-darwin.tar.gz`
		} else if (platform === "win32") {
			return `https://github.com/qdrant/qdrant/releases/download/${version}/qdrant-x86_64-pc-windows-msvc.zip`
		} else {
			// Linux
			if (arch === "arm64") {
				return `https://github.com/qdrant/qdrant/releases/download/${version}/qdrant-aarch64-unknown-linux-gnu.tar.gz`
			}
			return `https://github.com/qdrant/qdrant/releases/download/${version}/qdrant-x86_64-unknown-linux-gnu.tar.gz`
		}
	}

	public async install(onProgress?: (progress: number) => void): Promise<void> {
		if (await this.isInstalled()) return

		await fs.mkdir(this.installPath, { recursive: true })
		const url = this.getDownloadUrl()
		const isZip = url.endsWith(".zip")
		const archiveName = isZip ? "qdrant.zip" : "qdrant.tar.gz"
		const archivePath = path.join(this.installPath, archiveName)

		console.log(`[LocalQdrantManager] Downloading Qdrant from ${url}...`)
		await new Promise<void>((resolve, reject) => {
			const onProgressHandler = (p: { progress: number }) => {
				if (onProgress) onProgress(p.progress)
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
			downloadManager.enqueue(url, archivePath)
		})

		console.log(`[LocalQdrantManager] Extracting Qdrant archive...`)
		if (isZip) {
			if (os.platform() === "win32") {
				try {
					execSync(`tar -xf "${archivePath}" -C "${this.installPath}"`, { stdio: "ignore" })
				} catch {
					execSync(
						`powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${this.installPath}' -Force"`,
						{ stdio: "ignore" },
					)
				}
			} else {
				execSync(`unzip -o "${archivePath}" -d "${this.installPath}"`, { stdio: "ignore" })
			}
		} else {
			execSync(`tar -xzf "${archivePath}" -C "${this.installPath}"`, { stdio: "ignore" })
		}

		// Ensure permissions on macOS/Linux
		if (os.platform() !== "win32") {
			await fs.chmod(this.getBinaryPath(), 0o755)
		}

		// Clean up archive
		try {
			await fs.unlink(archivePath)
		} catch {
			// ignore cleanup errors
		}
		console.log("[LocalQdrantManager] Qdrant installed successfully!")
	}

	public async start(onProgress?: (progress: number) => void): Promise<void> {
		if (await this.isRunning()) {
			console.log("[LocalQdrantManager] Qdrant is already running.")
			return
		}

		await this.install(onProgress)

		console.log(`[LocalQdrantManager] Launching Qdrant from ${this.getBinaryPath()}...`)
		let logStream: any = "ignore"
		try {
			const logFile = path.join(this.installPath, "qdrant.log")
			logStream = require("fs").createWriteStream(logFile, { flags: "a" })
		} catch (e) {
			console.error("[LocalQdrantManager] Failed to create log file:", e)
		}

		this.process = spawn(this.getBinaryPath(), [], {
			cwd: this.getCwd(),
			stdio: ["ignore", logStream, logStream],
			detached: false,
		})

		this.process.on("error", (err) => {
			console.error("[LocalQdrantManager] Qdrant process error:", err)
			this.process = null
		})

		this.process.on("exit", (code) => {
			console.log(`[LocalQdrantManager] Qdrant process exited with code ${code}`)
			this.process = null
		})

		// Wait for port 6333 to be ready (up to 10s)
		console.log("[LocalQdrantManager] Waiting for Qdrant port 6333 to be ready...")
		const start = Date.now()
		while (Date.now() - start < 10000) {
			if (await this.isPortReady()) {
				console.log("[LocalQdrantManager] Qdrant port 6333 is ready.")
				return
			}
			await new Promise((resolve) => setTimeout(resolve, 250))
		}

		throw new Error("Timeout waiting for local Qdrant server to start on port 6333")
	}

	public async stop(): Promise<void> {
		if (this.process) {
			console.log("[LocalQdrantManager] Stopping Qdrant process...")
			this.process.kill()
			this.process = null
		}
	}

	public async isRunning(): Promise<boolean> {
		return this.isPortReady()
	}

	private async isPortReady(): Promise<boolean> {
		try {
			const res = await fetch("http://localhost:6333/readyz")
			return res.ok
		} catch {
			return false
		}
	}

	public dispose(): void {
		this.stop().catch((err) => console.error("[LocalQdrantManager] Error during dispose stop:", err))
	}
}

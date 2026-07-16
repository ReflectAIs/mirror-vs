/**
 * Abstract runtime lifecycle manager.
 *
 * Concrete implementations handle the OS-specific install, launch, health-check
 * and shutdown of local image generation runtimes (ComfyUI).
 */
import { ChildProcess, spawn } from "child_process"
import path from "path"
import { EventEmitter } from "events"

export interface RuntimeState {
	installed: boolean
	running: boolean
	pid?: number
	port: number
	version?: string
	startTime?: number
}

export type RuntimeEvent = "state-change" | "error" | "output"

export type InstallProgressCallback = (step: string, message?: string, progressPercent?: number) => void

export abstract class RuntimeManager extends EventEmitter {
	protected state: RuntimeState
	protected process: ChildProcess | null = null
	protected healthCheckInterval: NodeJS.Timeout | null = null

	constructor(
		public readonly name: string,
		protected installPath: string,
		protected port: number,
	) {
		super()
		this.state = {
			installed: false,
			running: false,
			port,
		}
	}

	/**
	 * Detect whether the runtime is installed by checking if the executable exists.
	 * Updates `this.state.installed` and returns the result.
	 *
	 * Call this after construction when the manager is created outside of the
	 * install flow (e.g., on extension startup) to sync state with the filesystem.
	 */
	async detectInstalled(): Promise<boolean> {
		const { access } = await import("fs/promises")
		const execPath = this.getExecPath()
		try {
			await access(execPath)
			this.state.installed = true
			console.log(`[RuntimeManager:${this.name}] detectInstalled: FOUND at ${execPath}`)
		} catch {
			this.state.installed = false
			console.log(`[RuntimeManager:${this.name}] detectInstalled: NOT FOUND at ${execPath}`)
		}
		return this.state.installed
	}

	abstract get executableName(): string
	abstract get downloadUrl(): string
	abstract get defaultModel(): string

	abstract install(onProgress?: InstallProgressCallback): Promise<void>
	abstract uninstall(): Promise<void>

	/**
	 * Override to change the executable path resolved at launch time.
	 * Default: {@code path.join(installPath, executableName)}.
	 */
	protected getExecPath(): string {
		return path.join(this.installPath, this.executableName)
	}

	/**
	 * Override to change the working directory of the spawned process.
	 * Default: {@code installPath}.
	 */
	protected getCwd(): string {
		return this.installPath
	}

	async launch(): Promise<void> {
		if (this.state.running) {
			console.log(`[RuntimeManager:${this.name}] Already running, skipping launch`)
			return
		}

		const execPath = this.getExecPath()
		const launchArgs = this.getLaunchArgs()
		const cwd = this.getCwd()

		console.log(`[RuntimeManager:${this.name}] ====== LAUNCH ======`)
		console.log(`[RuntimeManager:${this.name}]   installPath = ${this.installPath}`)
		console.log(`[RuntimeManager:${this.name}]   executableName = ${this.executableName}`)
		console.log(`[RuntimeManager:${this.name}]   execPath    = ${execPath}`)
		console.log(`[RuntimeManager:${this.name}]   args        = ${JSON.stringify(launchArgs)}`)
		console.log(`[RuntimeManager:${this.name}]   cwd         = ${cwd}`)
		console.log(`[RuntimeManager:${this.name}]   port        = ${this.port}`)

		// Check if execPath exists before spawning
		const fs = require("fs")
		const exists = fs.existsSync(execPath)
		console.log(`[RuntimeManager:${this.name}]   execPath exists on disk? ${exists}`)

		if (exists) {
			const stat = fs.statSync(execPath)
			console.log(
				`[RuntimeManager:${this.name}]   execPath stat: isFile=${stat.isFile()}, mode=${stat.mode.toString(8)}, size=${stat.size}`,
			)
			// If it's a symlink, show the target
			if (stat.isSymbolicLink()) {
				const target = fs.readlinkSync(execPath)
				console.log(`[RuntimeManager:${this.name}]   execPath symlink -> ${target}`)
				const targetExists = fs.existsSync(target)
				console.log(`[RuntimeManager:${this.name}]   symlink target exists? ${targetExists}`)
			}
		}

		// Check if installPath/venv/bin/python3 exists (to verify venv integrity)
		const venvPython = path.join(cwd, "venv", "bin", "python3")
		console.log(`[RuntimeManager:${this.name}]   venv python3 exists? ${fs.existsSync(venvPython)}`)

		this.process = spawn(execPath, launchArgs, {
			cwd,
			stdio: ["ignore", "pipe", "pipe"],
			env: {
				...process.env,
				...this.getLaunchEnv(),
			},
		})

		this.state.pid = this.process.pid
		this.state.running = true
		this.state.startTime = Date.now()

		console.log(`[RuntimeManager:${this.name}]   spawned PID = ${this.process.pid}`)

		// Capture ALL stdout/stderr for diagnosis
		let capturedStdout = ""
		let capturedStderr = ""

		this.process.stdout?.on("data", (data: Buffer) => {
			const text = data.toString()
			capturedStdout += text
			console.log(`[RuntimeManager:${this.name}:stdout] ${text.trimEnd()}`)
			this.emit("output", { stream: "stdout", data: text })
		})

		this.process.stderr?.on("data", (data: Buffer) => {
			const text = data.toString()
			capturedStderr += text
			console.log(`[RuntimeManager:${this.name}:stderr] ${text.trimEnd()}`)
			this.emit("output", { stream: "stderr", data: text })
		})

		this.process.on("exit", (code, signal) => {
			console.log(`[RuntimeManager:${this.name}] ====== PROCESS EXIT ======`)
			console.log(`[RuntimeManager:${this.name}]   code   = ${code}`)
			console.log(`[RuntimeManager:${this.name}]   signal = ${signal}`)
			console.log(`[RuntimeManager:${this.name}]   stdout (${capturedStdout.length} chars):`)
			console.log(`[RuntimeManager:${this.name}]   ${capturedStdout.slice(0, 3000)}`)
			console.log(`[RuntimeManager:${this.name}]   stderr (${capturedStderr.length} chars):`)
			console.log(`[RuntimeManager:${this.name}]   ${capturedStderr.slice(0, 3000)}`)

			this.state.running = false
			this.state.pid = undefined
			this.emit("state-change", { ...this.state })

			// Only emit an error for genuine process crashes, not for intentional
			// shutdowns via `stop()` (which sends SIGTERM then SIGKILL).
			// - code === 0: clean exit, no error
			// - code === null && signal !== undefined: killed by signal (intentional or external)
			// - code !== 0 && code !== null: genuine non-zero exit (crash/compatibility issue)
			if (code !== null && code !== 0) {
				const errMsg = `Process exited with code ${code}${signal ? ` (signal ${signal})` : ""}`
				console.log(`[RuntimeManager:${this.name}] EMITTING ERROR: ${errMsg}`)
				this.emit("error", new Error(errMsg))
			}
		})

		this.process.on("error", (err) => {
			console.log(`[RuntimeManager:${this.name}] ====== PROCESS ERROR EVENT ======`)
			console.log(`[RuntimeManager:${this.name}]   message: ${err.message}`)
			console.log(`[RuntimeManager:${this.name}]   stack: ${err.stack}`)
			this.emit("error", err)
		})

		this.emit("state-change", { ...this.state })
		this.startHealthCheck()
	}

	async stop(): Promise<void> {
		this.stopHealthCheck()

		if (this.process) {
			this.process.kill("SIGTERM")
			// Wait for graceful shutdown
			await new Promise<void>((resolve) => {
				const timeout = setTimeout(() => {
					this.process?.kill("SIGKILL")
					resolve()
				}, 5000)
				this.process?.on("exit", () => {
					clearTimeout(timeout)
					resolve()
				})
			})
			this.process = null
		}

		this.state.running = false
		this.state.pid = undefined
		this.emit("state-change", { ...this.state })
	}

	abstract healthCheck(): Promise<boolean>

	getState(): RuntimeState {
		return { ...this.state }
	}

	getUrl(): string {
		return `http://127.0.0.1:${this.port}`
	}

	protected abstract getLaunchArgs(): string[]
	protected abstract getLaunchEnv(): Record<string, string>

	private startHealthCheck(): void {
		this.healthCheckInterval = setInterval(async () => {
			try {
				const alive = await this.healthCheck()
				console.log(`[RuntimeManager:${this.name}] healthCheck: ${alive}`)
				if (!alive && this.state.running) {
					// Process is gone (crashed). Update state and clean up.
					this.state.running = false
					this.state.pid = undefined
					this.emit("state-change", { ...this.state })
				}
			} catch {
				// Swallow health-check errors to avoid unhandled rejections
			}
		}, 10_000)
	}

	private stopHealthCheck(): void {
		if (this.healthCheckInterval) {
			clearInterval(this.healthCheckInterval)
			this.healthCheckInterval = null
		}
	}

	dispose(): void {
		this.stop()
		this.removeAllListeners()
	}
}

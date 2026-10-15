import { ChildProcess, spawn } from "child_process"
import * as crypto from "crypto"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"

/**
 * Strips ANSI escape sequences from a string.
 * Covers CSI sequences (ESC[), OSC sequences (ESC]), and common terminal control codes.
 */
function stripAnsi(str: string): string {
	return str.replace(/(\x1B\[[\d;]*[A-Za-z]|\x1B\][\d;]*(?:\x07|\x1B\\)|[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F])/g, "")
}

/**
 * Common SSH authentication/connection failure patterns detected in stderr.
 * Used to fail-fast on connection attempts.
 */
const AUTH_FAILURE_PATTERNS = [
	"permission denied",
	"password authentication failed",
	"authentication failed",
	"authenticity of host",
	"host key verification failed",
	"connection refused",
	"connection closed",
	"connection reset",
	"operation timed out",
	"network is unreachable",
	"no route to host",
]

/**
 * Resolves the path to the `sshpass` binary, searching standard install locations
 * (e.g. Homebrew on macOS, Linux paths) if not directly found in PATH.
 */
function resolveSshpassBinary(): string {
	const candidates = ["sshpass", "/opt/homebrew/bin/sshpass", "/usr/local/bin/sshpass", "/usr/bin/sshpass"]
	for (const candidate of candidates) {
		if (candidate === "sshpass") {
			// Will be checked via PATH
			continue
		}
		try {
			if (fs.existsSync(candidate)) {
				return candidate
			}
		} catch {}
	}
	return "sshpass"
}

/**
 * Provides an augmented PATH environment including standard Homebrew and local bin paths
 * so subprocesses can reliably discover binaries like sshpass in macOS GUI/VS Code environments.
 */
function getExtendedEnv(extraEnv?: Record<string, string | undefined>): NodeJS.ProcessEnv {
	const extraPaths = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"]
	const currentPath = process.env.PATH || ""
	const pathList = currentPath.split(path.delimiter)
	for (const p of extraPaths) {
		if (!pathList.includes(p)) {
			pathList.unshift(p)
		}
	}
	return {
		...process.env,
		PATH: pathList.join(path.delimiter),
		...extraEnv,
	}
}

export class SshSession {
	private socketPath: string
	private currentExecChild: ChildProcess | null = null
	public isDead = false

	constructor(
		private host: string,
		private port: number,
		private password?: string,
	) {
		// Use a secure socket directory with 0700 permissions in os.tmpdir()
		const socketDir = path.join(os.tmpdir(), "mirror-ssh")
		try {
			if (!fs.existsSync(socketDir)) {
				fs.mkdirSync(socketDir, { recursive: true, mode: 0o700 })
			}
		} catch {}

		// Hash host:port for a short, collision-free socket name compliant with macOS 104-byte sun_path limit
		const hash = crypto.createHash("sha256").update(`${host}:${port}`).digest("hex").slice(0, 16)
		this.socketPath = path.join(socketDir, `${hash}.sock`)
	}

	public getSocketPath(): string {
		return this.socketPath
	}

	/**
	 * Checks if the OpenSSH master connection is currently running and healthy.
	 */
	public async checkAlive(): Promise<boolean> {
		if (this.isDead || !fs.existsSync(this.socketPath)) {
			return false
		}
		return new Promise<boolean>((resolve) => {
			const check = spawn(
				"ssh",
				[
					"-O",
					"check",
					"-o",
					`ControlPath=${this.socketPath}`,
					"-o",
					"LogLevel=ERROR",
					"-p",
					String(this.port),
					this.host,
				],
				{ env: getExtendedEnv() },
			)

			check.on("close", (code) => {
				const alive = code === 0
				if (!alive) {
					this.isDead = true
				}
				resolve(alive)
			})
			check.on("error", () => {
				this.isDead = true
				resolve(false)
			})
		})
	}

	/**
	 * Establishes the persistent OpenSSH master multiplexer connection with keepalives.
	 * If already connected and alive, this is a no-op.
	 */
	public async connect(timeoutMs: number = 15000): Promise<void> {
		if (await this.checkAlive()) {
			this.isDead = false
			return
		}

		// Clean up any stale or orphaned socket file before establishing a new master
		try {
			if (fs.existsSync(this.socketPath)) {
				fs.unlinkSync(this.socketPath)
			}
		} catch {}

		return new Promise<void>((resolve, reject) => {
			let settled = false
			const timer = setTimeout(() => {
				if (!settled) {
					settled = true
					this.isDead = true
					reject(
						new Error(`SSH connection attempt to ${this.host}:${this.port} timed out after ${timeoutMs}ms`),
					)
				}
			}, timeoutMs)

			// Master connection arguments:
			// -N: do not execute remote command
			// -f: fork to background once authenticated and master socket established
			// ControlPersist=1h: keep master tunnel alive in background across idle gaps
			// ServerAliveInterval=15 & ServerAliveCountMax=3: send keepalive pings every 15s to keep tunnel open
			const masterArgs = [
				"-N",
				"-f",
				"-o",
				"ControlMaster=auto",
				"-o",
				`ControlPath=${this.socketPath}`,
				"-o",
				"ControlPersist=1h",
				"-o",
				"ServerAliveInterval=15",
				"-o",
				"ServerAliveCountMax=3",
				"-o",
				"TCPKeepAlive=yes",
				"-o",
				"StrictHostKeyChecking=no",
				"-o",
				"UserKnownHostsFile=/dev/null",
				"-o",
				"ConnectTimeout=15",
				"-o",
				"LogLevel=ERROR",
				"-p",
				String(this.port),
				this.host,
			]

			let child: ChildProcess
			let stderrOutput = ""

			if (this.password) {
				const sshpass = resolveSshpassBinary()
				child = spawn(sshpass, ["-e", "ssh", ...masterArgs], {
					env: getExtendedEnv({ SSHPASS: this.password }),
				})
			} else {
				child = spawn("ssh", masterArgs, {
					env: getExtendedEnv(),
				})
			}

			child.stderr?.on("data", (data) => {
				stderrOutput += stripAnsi(data.toString())
			})

			child.on("error", (err) => {
				if (settled) return
				settled = true
				clearTimeout(timer)
				this.isDead = true
				reject(new Error(`Failed to start SSH process: ${err.message}`))
			})

			child.on("close", (code) => {
				if (settled) return
				settled = true
				clearTimeout(timer)

				if (code === 0) {
					this.isDead = false
					resolve()
				} else {
					this.isDead = true
					const lower = stderrOutput.toLowerCase()
					for (const pattern of AUTH_FAILURE_PATTERNS) {
						if (lower.includes(pattern)) {
							reject(
								new Error(
									`SSH authentication/connection failed: detected "${pattern}" in server response.\n` +
										`Output: ${stderrOutput.trim()}`,
								),
							)
							return
						}
					}
					reject(new Error(`SSH connection failed (code ${code}): ${stderrOutput.trim() || "Unknown error"}`))
				}
			})
		})
	}

	/**
	 * Backwards-compatibility alias for connect.
	 */
	public async waitForConnection(timeoutMs: number = 15000): Promise<void> {
		return this.connect(timeoutMs)
	}

	/**
	 * Executes a remote command over the existing OpenSSH multiplexed master connection.
	 * Runs cleanly without pseudo-terminal echo or sentinel hacks, streaming stdout/stderr
	 * and capturing the real remote process exit code.
	 */
	public async executeCommand(
		command: string,
		timeoutMs: number = 180000,
		onOutput?: (chunk: string) => void,
	): Promise<string> {
		// Ensure master connection is healthy before executing
		const isAlive = await this.checkAlive()
		if (!isAlive) {
			try {
				await this.connect()
			} catch (err: any) {
				this.isDead = true
				return `[SSH Session is disconnected: ${err.message}]`
			}
		}

		if (this.currentExecChild) {
			return Promise.reject(new Error("Another command is currently running in this SSH session."))
		}

		return new Promise((resolve) => {
			let outputBuffer = ""
			let settled = false

			// Command executes in non-interactive environment with stdin redirected to /dev/null
			const remoteFormattedCommand = `(export CI=true TERM=dumb DOCKER_CLI_HINTS=false DEBIAN_FRONTEND=noninteractive; ${command}) </dev/null`

			const execArgs = [
				"-o",
				`ControlPath=${this.socketPath}`,
				"-o",
				"LogLevel=ERROR",
				"-o",
				"StrictHostKeyChecking=no",
				"-o",
				"UserKnownHostsFile=/dev/null",
				"-p",
				String(this.port),
				this.host,
				remoteFormattedCommand,
			]

			const child = spawn("ssh", execArgs, {
				env: getExtendedEnv(),
				stdio: ["ignore", "pipe", "pipe"],
			})

			this.currentExecChild = child

			child.stdout?.on("data", (data) => {
				const str = stripAnsi(data.toString())
				outputBuffer += str
				if (onOutput) {
					onOutput(str)
				}
			})

			child.stderr?.on("data", (data) => {
				const str = stripAnsi(data.toString())
				outputBuffer += str
				if (onOutput) {
					onOutput(str)
				}
			})

			const timer = setTimeout(() => {
				if (!settled) {
					settled = true
					this.currentExecChild = null
					try {
						child.kill("SIGTERM")
					} catch {}
					resolve(outputBuffer.trim() + `\n[Command execution timed out after ${timeoutMs}ms]`)
				}
			}, timeoutMs)

			child.on("close", (code) => {
				if (settled) return
				settled = true
				clearTimeout(timer)
				this.currentExecChild = null

				const trimmed = outputBuffer.trim()
				if (code !== 0 && code !== null) {
					resolve(trimmed + `\n[Command exited with code ${code}]`)
				} else {
					resolve(trimmed)
				}
			})

			child.on("error", (err) => {
				if (settled) return
				settled = true
				clearTimeout(timer)
				this.currentExecChild = null
				resolve(outputBuffer.trim() + `\n[SSH Process Error: ${err.message}]`)
			})
		})
	}

	/**
	 * Aborts the currently executing remote command without killing the master SSH tunnel.
	 */
	public abort(): void {
		if (this.currentExecChild) {
			try {
				this.currentExecChild.kill("SIGINT")
			} catch {}
			this.currentExecChild = null
		}
	}

	/**
	 * Closes the SSH session and requests the OpenSSH master daemon to exit cleanly.
	 */
	public close(): void {
		this.isDead = true
		this.abort()

		if (fs.existsSync(this.socketPath)) {
			try {
				spawn(
					"ssh",
					[
						"-O",
						"exit",
						"-o",
						`ControlPath=${this.socketPath}`,
						"-o",
						"LogLevel=ERROR",
						"-p",
						String(this.port),
						this.host,
					],
					{ env: getExtendedEnv() },
				)
			} catch {}
		}

		try {
			if (fs.existsSync(this.socketPath)) {
				fs.unlinkSync(this.socketPath)
			}
		} catch {}
	}
}

export class SshSessionRegistry {
	/**
	 * Session key format: `${taskId}|${host}|${port}`
	 * The `|` separator is used instead of `:` because hostnames and IPv4 addresses
	 * never contain pipes, making parsing unambiguous.
	 */
	private static sessions = new Map<string, SshSession>()

	/**
	 * Caches passwords per host:port so that reconnection after a session
	 * drops does not require the LLM to re-send the password parameter.
	 * Passwords are shared across tasks connecting to the same host:port.
	 */
	private static passwordCache = new Map<string, string>()

	private static makeKey(taskId: string, host: string, port: number): string {
		return `${taskId}|${host}|${port}`
	}

	public static async getOrCreateSession(
		taskId: string,
		host: string,
		port: number,
		password?: string,
	): Promise<SshSession> {
		const key = this.makeKey(taskId, host, port)
		const hostPortKey = `${host}:${port}`

		// Cache password if provided
		if (password) {
			this.passwordCache.set(hostPortKey, password)
		}
		const resolvedPassword = password || this.passwordCache.get(hostPortKey)

		let session = this.sessions.get(key)
		if (session && !session.isDead) {
			const alive = await session.checkAlive()
			if (alive) {
				return session
			}
		}

		// Clean up dead session if present
		if (session) {
			session.close()
			this.sessions.delete(key)
		}

		session = new SshSession(host, port, resolvedPassword)
		try {
			await session.connect()
		} catch (err) {
			this.sessions.delete(key)
			throw err
		}

		this.sessions.set(key, session)
		return session
	}

	public static removeSession(taskId: string, host: string, port: number) {
		const key = this.makeKey(taskId, host, port)
		const session = this.sessions.get(key)
		if (session) {
			session.close()
			this.sessions.delete(key)
		}
	}

	public static getSessions(): Array<{ taskId?: string; host: string; port: number; session: SshSession }> {
		const result: Array<{ taskId?: string; host: string; port: number; session: SshSession }> = []
		for (const [key, session] of this.sessions.entries()) {
			if (!session.isDead) {
				const parts = key.split("|")
				result.push({ taskId: parts[0], host: parts[1], port: parseInt(parts[2], 10), session })
			}
		}
		return result
	}

	/**
	 * Removes all sessions for a given task. Called when a task is closed.
	 */
	public static removeSessionsForTask(taskId: string) {
		for (const [key, session] of this.sessions.entries()) {
			if (key.startsWith(`${taskId}|`)) {
				session.close()
				this.sessions.delete(key)
			}
		}
	}

	public static clearAll() {
		for (const session of this.sessions.values()) {
			session.close()
		}
		this.sessions.clear()
		this.passwordCache.clear()
	}
}

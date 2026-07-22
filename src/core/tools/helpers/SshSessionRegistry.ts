import { ChildProcess, spawn } from "child_process"

/**
 * Strips ANSI escape sequences from a string.
 * Covers CSI sequences (ESC[), OSC sequences (ESC]), and common terminal control codes.
 */
function stripAnsi(str: string): string {
	return str.replace(/(\x1B\[[\d;]*[A-Za-z]|\x1B\][\d;]*(?:\x07|\x1B\\)|[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F])/g, "")
}

export class SshSession {
	private child: ChildProcess
	private outputBuffer: string = ""
	private commandPromise: { resolve: (out: string) => void; reject: (err: Error) => void } | null = null
	private onConnectCallback: (() => void) | null = null
	private onOutputCallback: ((chunk: string) => void) | null = null
	public isDead = false

	constructor(
		private host: string,
		private port: number,
		password?: string,
	) {
		const args = password
			? ["-p", password, "ssh", "-tt", "-o", "StrictHostKeyChecking=no", host, "-p", String(port)]
			: ["-tt", "-o", "StrictHostKeyChecking=no", host, "-p", String(port)]

		this.child = spawn(password ? "sshpass" : "ssh", args)

		this.child.stdout?.on("data", (data) => {
			const str = stripAnsi(data.toString())
			this.outputBuffer += str

			// Check for initial connection prompt stabilization if resolving connection
			if (
				this.onConnectCallback &&
				(this.outputBuffer.includes("$") || this.outputBuffer.includes("#") || this.outputBuffer.includes(">"))
			) {
				const cb = this.onConnectCallback
				this.onConnectCallback = null
				cb()
			}

			if (this.commandPromise) {
				const sentinelIndex = this.outputBuffer.indexOf("__SSH_COMMAND_FINISHED__")
				if (sentinelIndex !== -1) {
					const output = this.outputBuffer.slice(0, sentinelIndex)
					const remainder = this.outputBuffer.slice(sentinelIndex)

					const lines = remainder.split("\n")
					const exitCodeLine = lines.find((l) => l.includes("__SSH_COMMAND_FINISHED__"))
					const exitCodeMatch = exitCodeLine?.match(/__SSH_COMMAND_FINISHED__\s+(\d+)/)
					const exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1], 10) : 0

					const resolve = this.commandPromise.resolve
					this.commandPromise = null
					this.onOutputCallback = null
					this.outputBuffer = ""

					if (exitCode !== 0) {
						resolve(output.trim() + `\n[Command exited with code ${exitCode}]`)
					} else {
						resolve(output.trim())
					}
				} else {
					if (this.onOutputCallback) {
						this.onOutputCallback(str)
					}
				}
			}
		})

		this.child.stderr?.on("data", (data) => {
			const str = stripAnsi(data.toString())
			this.outputBuffer += str
			if (this.commandPromise && this.onOutputCallback) {
				this.onOutputCallback(str)
			}
		})

		this.child.on("close", (code, signal) => {
			this.isDead = true
			if (this.commandPromise) {
				const resolve = this.commandPromise.resolve
				this.commandPromise = null
				this.onOutputCallback = null
				resolve(this.outputBuffer.trim() + `\n[SSH Connection Closed unexpectedly with code ${code}]`)
			}
		})

		this.child.on("error", (err) => {
			this.isDead = true
			if (this.commandPromise) {
				const resolve = this.commandPromise.resolve
				this.commandPromise = null
				this.onOutputCallback = null
				resolve(this.outputBuffer.trim() + `\n[SSH Process Error: ${err.message}]`)
			}
		})
	}

	public waitForConnection(timeoutMs: number = 10000): Promise<void> {
		return new Promise((resolve, reject) => {
			this.onConnectCallback = resolve
			setTimeout(() => {
				if (this.onConnectCallback) {
					this.onConnectCallback = null
					resolve() // Fallback to resolve anyway so agent can try running commands
				}
			}, timeoutMs)
		})
	}

	public executeCommand(
		command: string,
		timeoutMs: number = 60000,
		onOutput?: (chunk: string) => void,
	): Promise<string> {
		if (this.isDead) {
			return Promise.resolve("[SSH Session is disconnected]")
		}
		if (this.commandPromise) {
			return Promise.reject(new Error("Another command is currently running in this SSH session."))
		}

		return new Promise((resolve, reject) => {
			this.outputBuffer = ""
			this.onOutputCallback = onOutput || null
			this.commandPromise = { resolve, reject }

			// Using a structured execution format that redirects stdin to /dev/null to prevent hanging on interactive prompts (like git auth)
			const formattedCommand = `(${command}) </dev/null\necho "__SSH_COMMAND_FINISHED__" $?\n`
			this.child.stdin?.write(formattedCommand)

			setTimeout(() => {
				if (this.commandPromise) {
					const partialOutput = this.outputBuffer
					this.commandPromise = null
					this.onOutputCallback = null
					resolve(partialOutput.trim() + "\n[Command execution timed out after " + timeoutMs + "ms]")
				}
			}, timeoutMs)
		})
	}

	public close() {
		try {
			this.child.stdin?.write("exit\n")
		} catch {}
		this.child.kill()
	}

	public abort() {
		if (this.commandPromise) {
			this.commandPromise = null
			this.onOutputCallback = null
		}
		try {
			this.child.stdin?.write("\x03")
		} catch {}
	}
}

export class SshSessionRegistry {
	private static sessions = new Map<string, SshSession>()

	public static async getOrCreateSession(host: string, port: number, password?: string): Promise<SshSession> {
		const key = `${host}:${port}`
		let session = this.sessions.get(key)
		if (!session || session.isDead) {
			session = new SshSession(host, port, password)
			await session.waitForConnection()
			this.sessions.set(key, session)
		}
		return session
	}

	public static removeSession(host: string, port: number) {
		const key = `${host}:${port}`
		const session = this.sessions.get(key)
		if (session) {
			session.close()
			this.sessions.delete(key)
		}
	}

	public static getSessions(): Array<{ host: string; port: number; session: SshSession }> {
		const result: Array<{ host: string; port: number; session: SshSession }> = []
		for (const [key, session] of this.sessions.entries()) {
			if (!session.isDead) {
				const [host, portStr] = key.split(":")
				result.push({ host, port: parseInt(portStr, 10), session })
			}
		}
		return result
	}

	public static clearAll() {
		for (const session of this.sessions.values()) {
			session.close()
		}
		this.sessions.clear()
	}
}

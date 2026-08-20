import { exec } from "child_process"
import psTree from "ps-tree"

export interface KillProcessTreeOptions {
	includeRoot?: boolean
	signal?: "SIGTERM" | "SIGKILL"
	forceTimeoutMs?: number
}

/**
 * Safely force-kills a process and all of its spawned child processes (process tree).
 *
 * Includes safety guards to NEVER kill PID 0, PID 1, or the host extension process itself.
 */
export async function killProcessTree(rootPid: number, options: KillProcessTreeOptions = {}): Promise<void> {
	const { includeRoot = true, signal = "SIGKILL", forceTimeoutMs = 150 } = options

	// Safety check: Never kill PID <= 1 or the extension host process
	if (!rootPid || rootPid <= 1 || rootPid === process.pid) {
		console.warn(`[killProcessTree] Safety guard prevented killing PID: ${rootPid}`)
		return
	}

	const isWindows = process.platform === "win32"

	if (isWindows) {
		return new Promise<void>((resolve) => {
			// /F = Forcefully terminate, /T = Terminates the specified process and any child processes started by it
			const cmd = includeRoot
				? `taskkill /F /T /PID ${rootPid}`
				: `wmic process where (ParentProcessId=${rootPid}) get ProcessId`

			exec(`taskkill /F /T /PID ${rootPid}`, (err) => {
				if (err) {
					// Ignore errors (process may have already exited)
				}
				resolve()
			})
		})
	}

	// Unix / macOS implementation
	return new Promise<void>((resolve) => {
		psTree(rootPid, (err, children) => {
			const childPids: number[] = []

			if (!err && Array.isArray(children)) {
				for (const child of children) {
					const pid = parseInt(child.PID, 10)
					if (pid && pid > 1 && pid !== process.pid && pid !== rootPid) {
						childPids.push(pid)
					}
				}
			}

			const targetPids = includeRoot ? [...childPids, rootPid] : childPids

			// Step 1: Send SIGTERM to allow graceful shutdown
			for (const pid of targetPids) {
				try {
					process.kill(pid, "SIGTERM")
				} catch {
					// Ignore ESRCH (process already dead)
				}
			}

			// Step 2: Follow up with SIGKILL after forceTimeoutMs if requested
			setTimeout(() => {
				for (const pid of targetPids) {
					try {
						process.kill(pid, "SIGKILL")
					} catch {
						// Ignore
					}
				}
				resolve()
			}, forceTimeoutMs)
		})
	})
}

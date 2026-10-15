import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { EventEmitter } from "events"
import * as fs from "fs"

const mockSpawn = vi.fn()

vi.mock("child_process", () => ({
	spawn: (...args: any[]) => mockSpawn(...args),
}))

import { SshSession, SshSessionRegistry } from "../SshSessionRegistry"

describe("SshSession and SshSessionRegistry", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		SshSessionRegistry.clearAll()
	})

	afterEach(() => {
		SshSessionRegistry.clearAll()
	})

	describe("SshSession", () => {
		it("generates a short socket path within limits", () => {
			const session = new SshSession("user@192.168.1.100", 2222)
			const socketPath = session.getSocketPath()
			expect(socketPath).toBeDefined()
			expect(socketPath.length).toBeLessThan(104)
			expect(socketPath).toContain("mirror-ssh")
			expect(socketPath.endsWith(".sock")).toBe(true)
		})

		it("connects and spawns ssh master process with keepalive options", async () => {
			const mockChild = new EventEmitter() as any
			mockChild.stderr = new EventEmitter()

			mockSpawn.mockImplementation((cmd: string, args: any) => {
				if (args?.[1] === "check") {
					// Simulate checkAlive failure (not yet connected)
					const checkEmitter = new EventEmitter() as any
					setTimeout(() => checkEmitter.emit("close", 1), 5)
					return checkEmitter
				}
				// Master connect
				setTimeout(() => mockChild.emit("close", 0), 10)
				return mockChild
			})

			const session = new SshSession("root@testserver", 22)
			await session.connect()

			expect(mockSpawn).toHaveBeenCalled()
			const call = mockSpawn.mock.calls.find((c: any) => (c[1] as string[])?.includes("ControlMaster=auto"))
			expect(call).toBeDefined()
			const args = call![1] as string[]
			expect(args).toContain("ServerAliveInterval=15")
			expect(args).toContain("ServerAliveCountMax=3")
			expect(args).toContain("TCPKeepAlive=yes")
			expect(args).toContain("ControlPersist=1h")
		})

		it("executes command over control socket and formats exit code", async () => {
			const session = new SshSession("root@testserver", 22)
			// Create socket file so checkAlive passes
			fs.writeFileSync(session.getSocketPath(), "")

			mockSpawn.mockImplementation((cmd: string, args: any) => {
				if (args?.[1] === "check") {
					const checkEmitter = new EventEmitter() as any
					setTimeout(() => checkEmitter.emit("close", 0), 5)
					return checkEmitter
				}
				// execCommand mock
				const execEmitter = new EventEmitter() as any
				execEmitter.stdout = new EventEmitter()
				execEmitter.stderr = new EventEmitter()
				setTimeout(() => {
					execEmitter.stdout.emit("data", Buffer.from("hello world\n"))
					execEmitter.emit("close", 0)
				}, 10)
				return execEmitter
			})

			const output = await session.executeCommand("echo hello world")
			expect(output).toBe("hello world")
		})

		it("reports non-zero exit code when remote command fails", async () => {
			const session = new SshSession("root@testserver", 22)
			// Create socket file so checkAlive passes
			fs.writeFileSync(session.getSocketPath(), "")

			mockSpawn.mockImplementation((cmd: string, args: any) => {
				if (args?.[1] === "check") {
					const checkEmitter = new EventEmitter() as any
					setTimeout(() => checkEmitter.emit("close", 0), 5)
					return checkEmitter
				}
				const execEmitter = new EventEmitter() as any
				execEmitter.stdout = new EventEmitter()
				execEmitter.stderr = new EventEmitter()
				setTimeout(() => {
					execEmitter.stderr.emit("data", Buffer.from("file not found\n"))
					execEmitter.emit("close", 1)
				}, 10)
				return execEmitter
			})

			const output = await session.executeCommand("cat nonexistent")
			expect(output).toContain("file not found")
			expect(output).toContain("[Command exited with code 1]")
		})
	})

	describe("SshSessionRegistry", () => {
		it("caches passwords per host:port and shares across tasks", async () => {
			let connectCalls = 0
			mockSpawn.mockImplementation((cmd: string, args: any) => {
				if (args?.[1] === "check") {
					const checkEmitter = new EventEmitter() as any
					// First check fails (not connected), subsequent succeed
					setTimeout(() => checkEmitter.emit("close", connectCalls > 0 ? 0 : 1), 5)
					return checkEmitter
				}
				connectCalls++
				const masterEmitter = new EventEmitter() as any
				masterEmitter.stderr = new EventEmitter()
				setTimeout(() => masterEmitter.emit("close", 0), 10)
				return masterEmitter
			})

			// Task 1 connects with password
			const s1 = await SshSessionRegistry.getOrCreateSession("task-1", "host.com", 22, "secret123")
			expect(s1).toBeDefined()

			// Task 2 connects without password -> should succeed using cached password
			const s2 = await SshSessionRegistry.getOrCreateSession("task-2", "host.com", 22)
			expect(s2).toBeDefined()
		})

		it("reuses active session for the same task and host:port", async () => {
			mockSpawn.mockImplementation((cmd: string, args: any) => {
				if (args?.[1] === "check") {
					const checkEmitter = new EventEmitter() as any
					setTimeout(() => checkEmitter.emit("close", 0), 5)
					return checkEmitter
				}
				const masterEmitter = new EventEmitter() as any
				masterEmitter.stderr = new EventEmitter()
				setTimeout(() => masterEmitter.emit("close", 0), 10)
				return masterEmitter
			})

			const s1 = await SshSessionRegistry.getOrCreateSession("task-1", "host.com", 22)
			// Touch socket path so checkAlive sees it
			fs.writeFileSync(s1.getSocketPath(), "")

			const s2 = await SshSessionRegistry.getOrCreateSession("task-1", "host.com", 22)
			expect(s1).toBe(s2)
		})
	})
})

import { vi, describe, it, expect, beforeEach } from "vitest"
import { sshSessionTool } from "../SshSessionTool"
import { SshSessionRegistry } from "../helpers/SshSessionRegistry"
import { ToolUse } from "../../../shared/tools"

vi.mock("../helpers/SshSessionRegistry", () => {
	const mockSession = {
		executeCommand: vi.fn().mockResolvedValue("Mock command output"),
		close: vi.fn(),
	}
	return {
		SshSessionRegistry: {
			getOrCreateSession: vi.fn().mockResolvedValue(mockSession),
			removeSession: vi.fn(),
		},
	}
})

describe("sshSessionTool", () => {
	let mockMirror: any
	let mockPushToolResult: any
	let mockAskApproval: any
	let toolResult: any

	beforeEach(() => {
		vi.clearAllMocks()

		mockMirror = {
			taskId: "test-task-id",
			consecutiveMistakeCount: 0,
			recordToolError: vi.fn(),
			sayAndCreateMissingParamError: vi.fn().mockResolvedValue("Missing parameter error"),
			say: vi.fn().mockResolvedValue(undefined),
			providerRef: {
				deref: vi.fn().mockResolvedValue({ context: undefined }),
			},
		}

		mockPushToolResult = vi.fn((result) => {
			toolResult = result
		})

		mockAskApproval = vi.fn().mockResolvedValue(true)
	})

	it("should fail when host is missing", async () => {
		const block: ToolUse = {
			type: "tool_use",
			name: "ssh_session",
			params: {},
			nativeArgs: {
				action: "connect",
			} as any,
			partial: false,
		}

		await sshSessionTool.handle(mockMirror, block as ToolUse<"ssh_session">, {
			askApproval: mockAskApproval,
			handleError: vi.fn(),
			pushToolResult: mockPushToolResult,
		})

		expect(mockMirror.recordToolError).toHaveBeenCalledWith("ssh_session")
		expect(mockMirror.sayAndCreateMissingParamError).toHaveBeenCalledWith("ssh_session", "host")
		expect(toolResult).toBe("Missing parameter error")
	})

	it("should connect successfully with approval", async () => {
		const block: ToolUse = {
			type: "tool_use",
			name: "ssh_session",
			params: {},
			nativeArgs: {
				action: "connect",
				host: "root@127.0.0.1",
				port: 22,
			},
			partial: false,
		}

		await sshSessionTool.handle(mockMirror, block as ToolUse<"ssh_session">, {
			askApproval: mockAskApproval,
			handleError: vi.fn(),
			pushToolResult: mockPushToolResult,
		})

		expect(mockAskApproval).toHaveBeenCalledWith("command", "Connect SSH [root@127.0.0.1:22]")
		expect(SshSessionRegistry.getOrCreateSession).toHaveBeenCalledWith(
			"test-task-id",
			"root@127.0.0.1",
			22,
			undefined,
		)
		expect(toolResult).toContain("Successfully connected")
	})

	it("should execute commands on persistent session", async () => {
		const block: ToolUse = {
			type: "tool_use",
			name: "ssh_session",
			params: {},
			nativeArgs: {
				action: "execute",
				host: "root@127.0.0.1",
				port: 22,
				command: "ls -la",
			},
			partial: false,
		}

		await sshSessionTool.handle(mockMirror, block as ToolUse<"ssh_session">, {
			askApproval: mockAskApproval,
			handleError: vi.fn(),
			pushToolResult: mockPushToolResult,
		})

		expect(mockAskApproval).toHaveBeenCalledWith("command", "Execute on SSH [root@127.0.0.1:22]: ls -la")
		expect(toolResult).toContain("Mock command output")
	})
})

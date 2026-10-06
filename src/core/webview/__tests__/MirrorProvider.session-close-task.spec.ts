import { beforeEach, describe, expect, it, vi } from "vitest"
import * as vscode from "vscode"

import { MirrorProvider } from "../MirrorProvider"
import { Task } from "../../task/Task"

// Mock dependencies
vi.mock("vscode", () => {
	const mockDisposable = { dispose: vi.fn() }
	return {
		workspace: {
			getConfiguration: vi.fn(() => ({
				get: vi.fn().mockReturnValue([]),
				update: vi.fn().mockResolvedValue(undefined),
			})),
			workspaceFolders: [],
			onDidChangeConfiguration: vi.fn(() => mockDisposable),
		},
		env: {
			uriScheme: "vscode",
			language: "en",
		},
		EventEmitter: vi.fn().mockImplementation(() => ({
			event: vi.fn(),
			fire: vi.fn(),
		})),
		Disposable: {
			from: vi.fn(),
		},
		window: {
			showErrorMessage: vi.fn(),
			createTextEditorDecorationType: vi.fn().mockReturnValue({
				dispose: vi.fn(),
			}),
			onDidChangeActiveTextEditor: vi.fn(() => mockDisposable),
		},
		Uri: {
			file: vi.fn().mockReturnValue({ toString: () => "file://test" }),
		},
	}
})

vi.mock("../../task/Task")
vi.mock("../../config/ContextProxy")
vi.mock("../../../services/mcp/McpServerManager", () => ({
	McpServerManager: {
		getInstance: vi.fn().mockResolvedValue({
			registerClient: vi.fn(),
		}),
		unregisterProvider: vi.fn(),
	},
}))
vi.mock("../../../integrations/workspace/WorkspaceTracker")
vi.mock("../../config/ProviderSettingsManager")
vi.mock("../../config/CustomModesManager")
vi.mock("../../../utils/path", () => ({
	getWorkspacePath: vi.fn().mockReturnValue("/test/workspace"),
}))
vi.mock("../../../shared/embeddingModels", () => ({
	EMBEDDING_MODEL_PROFILES: [],
}))

describe("MirrorProvider - Session Isolation & Close Tab Behavior", () => {
	let provider: MirrorProvider
	let mockContext: any
	let mockOutputChannel: any

	function createMockTask(taskId: string, sessionId: string, createdAt = Date.now()) {
		return {
			taskId,
			sessionId,
			instanceId: `inst-${taskId}`,
			createdAt,
			state: "idle",
			mirrorMessages: [],
			emit: vi.fn(),
			abortTask: vi.fn().mockResolvedValue(undefined),
			dispose: vi.fn(),
		} as unknown as Task
	}

	beforeEach(() => {
		vi.clearAllMocks()

		mockContext = {
			extensionUri: { fsPath: "/mock/path" },
			globalStorageUri: { fsPath: "/mock/storage" },
			workspaceState: {
				get: vi.fn(),
				update: vi.fn(),
			},
			secrets: {
				get: vi.fn(),
				store: vi.fn(),
				delete: vi.fn(),
			},
			subscriptions: [],
			extension: {
				packageJSON: { version: "0.9.10" },
			},
		}

		mockOutputChannel = {
			appendLine: vi.fn(),
			append: vi.fn(),
			clear: vi.fn(),
			show: vi.fn(),
			hide: vi.fn(),
			dispose: vi.fn(),
		}

		const mockContextProxy = {
			getValue: vi.fn().mockImplementation((key) => {
				if (key === "sessionClosedTabs") return {}
				return undefined
			}),
			setValue: vi.fn().mockResolvedValue(undefined),
			getValues: vi.fn().mockReturnValue({}),
			globalStorageUri: { fsPath: "/mock/storage/path" },
		} as any

		provider = new MirrorProvider(mockContext, mockOutputChannel, "sidebar", mockContextProxy)

		vi.spyOn(provider, "postStateToWebview").mockResolvedValue(undefined)
		vi.spyOn(provider, "switchToTask").mockResolvedValue(undefined)
	})

	it("switches to previous sibling tab when closing a tab within the same session", async () => {
		const sessionA = "session-A"
		provider.setCurrentSessionId(sessionA)

		const task1 = createMockTask("task-1", sessionA, 1000)
		const task2 = createMockTask("task-2", sessionA, 2000)

		// Both tasks in mirrorStack for sessionA
		;(provider as any).mirrorStack = [task1, task2]

		// Close current task (task-2)
		await provider.closeTask("task-2")

		// Should switch to task-1 (sibling in same session)
		expect(provider.switchToTask).toHaveBeenCalledWith("task-1")
		expect(task2.abortTask).toHaveBeenCalledWith(true)
		expect(provider.getCurrentSessionId()).toBe(sessionA)
	})

	it("stays in the current session and does NOT switch to another session when closing the only tab", async () => {
		const sessionA = "session-A"
		const sessionB = "session-B"

		// Suppose task-old belonged to sessionA and was somehow lingering in background
		const oldTask = createMockTask("task-old", sessionA, 1000)
		;(provider as any).backgroundTasks.set("task-old", oldTask)

		// Current session is sessionB with task-B
		provider.setCurrentSessionId(sessionB)
		const taskB = createMockTask("task-B", sessionB, 2000)
		;(provider as any).mirrorStack = [taskB]

		// Close task-B (the only tab in sessionB)
		await provider.closeTask("task-B")

		// Should NOT switch to task-old from sessionA
		expect(provider.switchToTask).not.toHaveBeenCalledWith("task-old")
		expect(provider.switchToTask).not.toHaveBeenCalled()

		// Current session remains sessionB (does not jump to sessionA)
		expect(provider.getCurrentSessionId()).toBe(sessionB)
		expect(provider.postStateToWebview).toHaveBeenCalled()
	})

	it("clearOtherSessionTasks removes in-memory tasks from other sessions", async () => {
		const sessionA = "session-A"
		const sessionB = "session-B"

		const taskA = createMockTask("task-A", sessionA)
		const taskB = createMockTask("task-B", sessionB)

		;(provider as any).mirrorStack = [taskA, taskB]
		;(provider as any).backgroundTasks.set("task-bg-A", createMockTask("task-bg-A", sessionA))

		// Keep only sessionB
		await provider.clearOtherSessionTasks(sessionB)

		// mirrorStack should only contain taskB
		expect((provider as any).mirrorStack).toEqual([taskB])
		// backgroundTasks for sessionA should be removed
		expect((provider as any).backgroundTasks.has("task-bg-A")).toBe(false)
		expect(taskA.abortTask).toHaveBeenCalledWith(true)
	})

	it("cleans up other sessions when switching sessions via switchSession", async () => {
		const sessionA = "session-A"
		const sessionB = "session-B"

		provider.setCurrentSessionId(sessionA)
		const taskA = createMockTask("task-A", sessionA)
		;(provider as any).mirrorStack = [taskA]

		// Switch to sessionB
		await provider.sessionManager.switchSession(sessionB)

		// Session A's task should be cleaned up from mirrorStack
		expect(provider.getCurrentSessionId()).toBe(sessionB)
		expect((provider as any).mirrorStack).toHaveLength(0)
		expect(taskA.abortTask).toHaveBeenCalledWith(true)
	})
})

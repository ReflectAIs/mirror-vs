import { describe, it, expect, vi, beforeEach } from "vitest"

// Task.ts imports `vscode` at module load, so mock it before importing the tool.
vi.mock("vscode", () => ({
	workspace: {
		getConfiguration: vi.fn(() => ({
			get: vi.fn(),
		})),
	},
}))

import { readSessionContextTool } from "../ReadSessionContextTool"
import type { ToolCallbacks } from "../BaseTool"

describe("readSessionContextTool", () => {
	let mockGetFullContext: ReturnType<typeof vi.fn>
	let mockPushToolResult: ReturnType<typeof vi.fn>
	let callbacks: ToolCallbacks

	const makeTask = (overrides: { sessionId?: string; deref?: () => unknown } = {}) => ({
		sessionId: "sessionId" in overrides ? overrides.sessionId : "session-1",
		providerRef: {
			deref:
				overrides.deref ??
				(() => ({ getSessionContextManager: () => ({ getFullContext: mockGetFullContext }) })),
		},
	})

	beforeEach(() => {
		mockGetFullContext = vi.fn().mockResolvedValue("## Sibling tabs\n- [idle] Other tab")
		mockPushToolResult = vi.fn()
		callbacks = {
			askApproval: vi.fn(),
			handleError: vi.fn(),
			pushToolResult: mockPushToolResult,
		}
		vi.clearAllMocks()
	})

	it("has the correct tool name", () => {
		expect(readSessionContextTool.name).toBe("read_session_context")
	})

	it("pushes the full session context from the provider", async () => {
		const task = makeTask()
		await readSessionContextTool.execute({}, task as any, callbacks)

		expect(mockGetFullContext).toHaveBeenCalledWith("session-1", "all")
		expect(mockPushToolResult).toHaveBeenCalledWith("## Sibling tabs\n- [idle] Other tab")
	})

	it("passes the requested scope through to getFullContext", async () => {
		const task = makeTask()
		await readSessionContextTool.execute({ scope: "knowledge" }, task as any, callbacks)

		expect(mockGetFullContext).toHaveBeenCalledWith("session-1", "knowledge")
	})

	it("pushes an error message when the provider is unavailable", async () => {
		const task = makeTask({ deref: () => undefined })
		await readSessionContextTool.execute({}, task as any, callbacks)

		expect(mockPushToolResult).toHaveBeenCalledWith("Failed to read session context: provider not available.")
	})

	it("pushes an error message when getFullContext throws", async () => {
		mockGetFullContext.mockRejectedValue(new Error("boom"))
		const task = makeTask()
		await readSessionContextTool.execute({}, task as any, callbacks)

		expect(mockPushToolResult).toHaveBeenCalledWith("Failed to read session context: boom")
	})

	it("handles a task with no sessionId (passes empty string)", async () => {
		const task = makeTask({ sessionId: undefined })
		await readSessionContextTool.execute({}, task as any, callbacks)

		expect(mockGetFullContext).toHaveBeenCalledWith("", "all")
	})

	it("passes target_task_id through to getFullContext for deep tab inspection", async () => {
		const task = makeTask()
		await readSessionContextTool.execute({ target_task_id: "target-123" }, task as any, callbacks)

		expect(mockGetFullContext).toHaveBeenCalledWith("session-1", "all", "target-123")
	})

	it("broadcasts shared notes via share_note parameter", async () => {
		const mockAddKnowledgeNote = vi.fn().mockResolvedValue({ text: "DB is running on port 5433" })
		const task = {
			taskId: "source-task-1",
			sessionId: "session-1",
			providerRef: {
				deref: () => ({
					getSessionContextManager: () => ({
						addKnowledgeNote: mockAddKnowledgeNote,
					}),
				}),
			},
		}

		await readSessionContextTool.execute({ share_note: "DB is running on port 5433" }, task as any, callbacks)

		expect(mockAddKnowledgeNote).toHaveBeenCalledWith("session-1", "DB is running on port 5433", "source-task-1")
		expect(mockPushToolResult).toHaveBeenCalledWith(expect.stringContaining("DB is running on port 5433"))
	})
})

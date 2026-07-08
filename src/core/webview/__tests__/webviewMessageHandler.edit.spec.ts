import type { Mock } from "vitest"
import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock dependencies first
vi.mock("vscode", () => ({
	window: {
		showWarningMessage: vi.fn(),
		showErrorMessage: vi.fn(),
	},
	workspace: {
		workspaceFolders: [{ uri: { fsPath: "/mock/workspace" } }],
		getConfiguration: vi.fn().mockReturnValue({
			get: vi.fn(),
			update: vi.fn(),
		}),
	},
	Uri: {
		file: vi.fn((path) => ({ fsPath: path })),
	},
	env: {
		uriScheme: "vscode",
	},
}))

vi.mock("../../task-persistence", () => ({
	saveTaskMessages: vi.fn(),
}))

vi.mock("../../../api/providers/fetchers/modelCache", () => ({
	getModels: vi.fn(),
	flushModels: vi.fn(),
	getModelsFromCache: vi.fn().mockReturnValue(undefined),
}))

vi.mock("../checkpointRestoreHandler", () => ({
	handleCheckpointRestoreOperation: vi.fn(),
}))

// Import after mocks
import { webviewMessageHandler } from "../webviewMessageHandler"
import type { MirrorProvider } from "../MirrorProvider"
import type { MirrorMessage } from "@mirror-vs/types"
import type { ApiMessage } from "../../task-persistence/apiMessages"
import { MessageManager } from "../../message-manager"

describe("webviewMessageHandler - Edit Message with Timestamp Fallback", () => {
	let mockMirrorProvider: MirrorProvider
	let mockCurrentTask: any

	beforeEach(() => {
		vi.clearAllMocks()

		// Create a mock task with messages
		mockCurrentTask = {
			taskId: "test-task-id",
			mirrorMessages: [] as MirrorMessage[],
			apiConversationHistory: [] as ApiMessage[],
			overwriteMirrorMessages: vi.fn(),
			overwriteApiConversationHistory: vi.fn(),
			handleWebviewAskResponse: vi.fn(),
		}
		mockCurrentTask.messageManager = new MessageManager(mockCurrentTask)

		// Create mock provider
		mockMirrorProvider = {
			getCurrentTask: vi.fn().mockReturnValue(mockCurrentTask),
			postMessageToWebview: vi.fn(),
			contextProxy: {
				getValue: vi.fn(),
				setValue: vi.fn(),
				globalStorageUri: { fsPath: "/mock/storage" },
			},
			log: vi.fn(),
			getState: vi.fn().mockResolvedValue({
				maxImageFileSize: 5,
				maxTotalImageSize: 20,
			}),
		} as unknown as MirrorProvider
	})

	it("should not modify API history when apiConversationHistoryIndex is -1", async () => {
		// Setup: User message followed by attempt_completion
		const userMessageTs = 1000
		const assistantMessageTs = 2000
		const completionMessageTs = 3000

		// UI messages (mirrorMessages)
		mockCurrentTask.mirrorMessages = [
			{
				ts: userMessageTs,
				type: "say",
				say: "user_feedback",
				text: "Hello",
			} as MirrorMessage,
			{
				ts: completionMessageTs,
				type: "say",
				say: "completion_result",
				text: "Task Completed!",
			} as MirrorMessage,
		]

		// API conversation history - note the user message is missing (common scenario after condense)
		mockCurrentTask.apiConversationHistory = [
			{
				ts: assistantMessageTs,
				role: "assistant",
				content: [
					{
						type: "text",
						text: "I'll help you with that.",
					},
				],
			},
			{
				ts: completionMessageTs,
				role: "assistant",
				content: [
					{
						type: "tool_use",
						name: "attempt_completion",
						id: "tool-1",
						input: {
							result: "Task Completed!",
						},
					},
				],
			},
		] as ApiMessage[]

		// Trigger edit confirmation
		await webviewMessageHandler(mockMirrorProvider, {
			type: "editMessageConfirm",
			messageTs: userMessageTs,
			text: "Hello World", // edited content
			restoreCheckpoint: false,
		})

		// Verify that UI messages were truncated at the correct index
		expect(mockCurrentTask.overwriteMirrorMessages).toHaveBeenCalledWith(
			[], // All messages before index 0 (empty array)
		)

		// API history should be truncated from first message at/after edited timestamp (fallback)
		expect(mockCurrentTask.overwriteApiConversationHistory).toHaveBeenCalledWith([])
	})

	it("should preserve messages before the edited message when message not in API history", async () => {
		const earlierMessageTs = 500
		const userMessageTs = 1000
		const assistantMessageTs = 2000

		// UI messages
		mockCurrentTask.mirrorMessages = [
			{
				ts: earlierMessageTs,
				type: "say",
				say: "user_feedback",
				text: "Earlier message",
			} as MirrorMessage,
			{
				ts: userMessageTs,
				type: "say",
				say: "user_feedback",
				text: "Hello",
			} as MirrorMessage,
			{
				ts: assistantMessageTs,
				type: "say",
				say: "text",
				text: "Response",
			} as MirrorMessage,
		]

		// API history - missing the exact user message at ts=1000
		mockCurrentTask.apiConversationHistory = [
			{
				ts: earlierMessageTs,
				role: "user",
				content: [{ type: "text", text: "Earlier message" }],
			},
			{
				ts: assistantMessageTs,
				role: "assistant",
				content: [{ type: "text", text: "Response" }],
			},
		] as ApiMessage[]

		await webviewMessageHandler(mockMirrorProvider, {
			type: "editMessageConfirm",
			messageTs: userMessageTs,
			text: "Hello World",
			restoreCheckpoint: false,
		})

		// Verify UI messages were truncated to preserve earlier message
		expect(mockCurrentTask.overwriteMirrorMessages).toHaveBeenCalledWith([
			{
				ts: earlierMessageTs,
				type: "say",
				say: "user_feedback",
				text: "Earlier message",
			},
		])

		// API history should be truncated from the first API message at/after the edited timestamp (fallback)
		expect(mockCurrentTask.overwriteApiConversationHistory).toHaveBeenCalledWith([
			{
				ts: earlierMessageTs,
				role: "user",
				content: [{ type: "text", text: "Earlier message" }],
			},
		])
	})

	it("should not use fallback when exact apiConversationHistoryIndex is found", async () => {
		const userMessageTs = 1000
		const assistantMessageTs = 2000

		// Both UI and API have the message at the same timestamp
		mockCurrentTask.mirrorMessages = [
			{
				ts: userMessageTs,
				type: "say",
				say: "user_feedback",
				text: "Hello",
			} as MirrorMessage,
			{
				ts: assistantMessageTs,
				type: "say",
				say: "text",
				text: "Response",
			} as MirrorMessage,
		]

		mockCurrentTask.apiConversationHistory = [
			{
				ts: userMessageTs,
				role: "user",
				content: [{ type: "text", text: "Hello" }],
			},
			{
				ts: assistantMessageTs,
				role: "assistant",
				content: [{ type: "text", text: "Response" }],
			},
		] as ApiMessage[]

		await webviewMessageHandler(mockMirrorProvider, {
			type: "editMessageConfirm",
			messageTs: userMessageTs,
			text: "Hello World",
			restoreCheckpoint: false,
		})

		// Both should be truncated at index 0
		expect(mockCurrentTask.overwriteMirrorMessages).toHaveBeenCalledWith([])
		expect(mockCurrentTask.overwriteApiConversationHistory).toHaveBeenCalledWith([])
	})

	it("should handle case where no API messages match timestamp criteria", async () => {
		const userMessageTs = 3000

		mockCurrentTask.mirrorMessages = [
			{
				ts: userMessageTs,
				type: "say",
				say: "user_feedback",
				text: "Hello",
			} as MirrorMessage,
		]

		// All API messages have timestamps before the edited message
		mockCurrentTask.apiConversationHistory = [
			{
				ts: 1000,
				role: "assistant",
				content: [{ type: "text", text: "Old message 1" }],
			},
			{
				ts: 2000,
				role: "assistant",
				content: [{ type: "text", text: "Old message 2" }],
			},
		] as ApiMessage[]

		await webviewMessageHandler(mockMirrorProvider, {
			type: "editMessageConfirm",
			messageTs: userMessageTs,
			text: "Hello World",
			restoreCheckpoint: false,
		})

		// UI messages truncated
		expect(mockCurrentTask.overwriteMirrorMessages).toHaveBeenCalledWith([])

		// API history should not be modified when no API messages meet the timestamp criteria
		expect(mockCurrentTask.overwriteApiConversationHistory).not.toHaveBeenCalled()
	})

	it("should handle empty API conversation history gracefully", async () => {
		const userMessageTs = 1000

		mockCurrentTask.mirrorMessages = [
			{
				ts: userMessageTs,
				type: "say",
				say: "user_feedback",
				text: "Hello",
			} as MirrorMessage,
		]

		mockCurrentTask.apiConversationHistory = []

		await webviewMessageHandler(mockMirrorProvider, {
			type: "editMessageConfirm",
			messageTs: userMessageTs,
			text: "Hello World",
			restoreCheckpoint: false,
		})

		// UI messages should be truncated
		expect(mockCurrentTask.overwriteMirrorMessages).toHaveBeenCalledWith([])

		// API history should not be modified when message not found
		expect(mockCurrentTask.overwriteApiConversationHistory).not.toHaveBeenCalled()
	})

	it("should correctly handle attempt_completion in API history", async () => {
		const userMessageTs = 1000
		const completionTs = 2000
		const feedbackTs = 3000

		mockCurrentTask.mirrorMessages = [
			{
				ts: userMessageTs,
				type: "say",
				say: "user_feedback",
				text: "Do something",
			} as MirrorMessage,
			{
				ts: completionTs,
				type: "say",
				say: "completion_result",
				text: "Task Completed!",
			} as MirrorMessage,
			{
				ts: feedbackTs,
				type: "say",
				say: "user_feedback",
				text: "Thanks",
			} as MirrorMessage,
		]

		// API history with attempt_completion tool use (user message missing)
		mockCurrentTask.apiConversationHistory = [
			{
				ts: completionTs,
				role: "assistant",
				content: [
					{
						type: "tool_use",
						name: "attempt_completion",
						id: "tool-1",
						input: {
							result: "Task Completed!",
						},
					},
				],
			},
			{
				ts: feedbackTs,
				role: "user",
				content: [
					{
						type: "text",
						text: "Thanks",
					},
				],
			},
		] as ApiMessage[]

		// Edit the first user message
		await webviewMessageHandler(mockMirrorProvider, {
			type: "editMessageConfirm",
			messageTs: userMessageTs,
			text: "Do something else",
			restoreCheckpoint: false,
		})

		// UI messages truncated at edited message
		expect(mockCurrentTask.overwriteMirrorMessages).toHaveBeenCalledWith([])

		// API history should be truncated from first message at/after edited timestamp (fallback)
		expect(mockCurrentTask.overwriteApiConversationHistory).toHaveBeenCalledWith([])
	})
})

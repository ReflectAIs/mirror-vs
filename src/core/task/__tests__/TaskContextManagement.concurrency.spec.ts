import { describe, it, expect, vi, beforeEach } from "vitest"
import { TaskContextManagement } from "../TaskContextManagement"
import * as condenseModule from "../../condense"

vi.mock("../../environment/getEnvironmentDetails", () => ({
	getEnvironmentDetails: vi.fn().mockResolvedValue("Environment details"),
}))

describe("TaskContextManagement Concurrency and Thresholds", () => {
	let mockTask: any
	let contextManager: TaskContextManagement

	beforeEach(() => {
		vi.restoreAllMocks()

		mockTask = {
			taskId: "task-123",
			cwd: "/mock/cwd",
			apiConversationHistory: [
				{ role: "user", content: "hello" },
				{ role: "assistant", content: "hi" },
				{ role: "user", content: "msg1" },
				{ role: "assistant", content: "msg2" },
				{ role: "user", content: "msg3" },
				{ role: "assistant", content: "msg4" },
			],
			conversationHistory: {
				flushPendingToolResultsToHistory: vi.fn().mockResolvedValue(undefined),
				overwriteApiConversationHistory: vi.fn().mockResolvedValue(undefined),
			},
			getSystemPrompt: vi.fn().mockResolvedValue("System prompt"),
			getTokenUsage: vi.fn().mockReturnValue({ contextTokens: 100000 }),
			debouncedEmitTokenUsage: vi.fn(),
			getFilesReadByMirrorSafely: vi.fn().mockResolvedValue([]),
			say: vi.fn().mockResolvedValue(undefined),
			api: {
				getModel: vi.fn().mockReturnValue({
					id: "claude-3-5-sonnet",
					info: { contextWindow: 128000, maxTokens: 4096 },
				}),
				countTokens: vi.fn().mockResolvedValue(100),
			},
			providerRef: {
				deref: vi.fn().mockReturnValue({
					getState: vi.fn().mockResolvedValue({
						autoCondenseContext: true,
						autoCondenseContextPercent: 75,
						profileThresholds: {},
						customModes: [],
						experiments: {},
						disabledTools: [],
					}),
					getMcpHub: vi.fn().mockReturnValue(undefined),
					getCodeIndexManager: vi.fn().mockReturnValue(undefined),
					postMessageToWebview: vi.fn().mockResolvedValue(undefined),
					getSessionContextManager: vi.fn().mockReturnValue({
						extractKnowledgeFromTask: vi.fn().mockResolvedValue(undefined),
					}),
				}),
			},
			abort: false,
			isStreaming: false,
			mirrorIgnoreController: undefined,
			toolUsage: {},
		}

		contextManager = new TaskContextManagement(mockTask)
	})

	it("prevents duplicate concurrent condensations and returns the shared in-flight promise", async () => {
		let resolveSummarize: (value: any) => void
		const summarizePromise = new Promise((resolve) => {
			resolveSummarize = resolve
		})

		const summarizeSpy = vi.spyOn(condenseModule, "summarizeConversation").mockImplementation(async () => {
			return summarizePromise as any
		})

		expect(contextManager.isCondensing).toBe(false)

		// Trigger first condensation
		const call1 = contextManager.condenseContext()
		expect(contextManager.isCondensing).toBe(true)

		// Trigger second condensation while first is still pending
		const call2 = contextManager.condenseContext()
		expect(contextManager.isCondensing).toBe(true)

		// Both promises should refer to the exact same operation
		expect(call1).toBe(call2)

		// Complete the summarization
		resolveSummarize!({
			messages: [{ role: "user", content: "condensed summary" }],
			summary: "Summary text",
			cost: 0.001,
			newContextTokens: 500,
			condenseId: "condense-1",
		})

		await Promise.all([call1, call2])

		expect(summarizeSpy).toHaveBeenCalledTimes(1)
		expect(contextManager.isCondensing).toBe(false)
		expect(mockTask.conversationHistory.overwriteApiConversationHistory).toHaveBeenCalledTimes(1)
		expect(mockTask.say).toHaveBeenCalledWith(
			"condense_context",
			undefined,
			undefined,
			false,
			undefined,
			undefined,
			{ isNonInteractive: true },
			expect.objectContaining({
				summary: "Summary text",
				condenseId: "condense-1",
			}),
		)
	})

	it("does not trigger background condense when condensation is already in progress", async () => {
		let resolveSummarize: (value: any) => void
		const summarizePromise = new Promise((resolve) => {
			resolveSummarize = resolve
		})

		vi.spyOn(condenseModule, "summarizeConversation").mockImplementation(async () => {
			return summarizePromise as any
		})

		const condenseSpy = vi.spyOn(contextManager, "condenseContext")

		// Start condensation
		const call1 = contextManager.condenseContext()
		expect(contextManager.isCondensing).toBe(true)

		// Attempt background condense while in flight
		contextManager.maybeTriggerBackgroundCondense()

		// condenseContext was called only once (by call1)
		expect(condenseSpy).toHaveBeenCalledTimes(1)

		resolveSummarize!({
			messages: [{ role: "user", content: "condensed" }],
			summary: "Summary",
			cost: 0,
			newContextTokens: 200,
			condenseId: "c-1",
		})

		await call1
	})

	it("respects autoCondenseContext: false setting in background condense", async () => {
		mockTask.providerRef.deref().getState.mockReturnValue({
			autoCondenseContext: false,
			autoCondenseContextPercent: 50,
		})

		const condenseSpy = vi.spyOn(contextManager, "condenseContext")

		contextManager.maybeTriggerBackgroundCondense()

		expect(condenseSpy).not.toHaveBeenCalled()
	})

	it("respects configured threshold percent from settings", async () => {
		// Context window is 128,000. 100,000 / 128,000 = ~78% used.
		// If threshold is 85%, should NOT trigger.
		mockTask.providerRef.deref().getState.mockReturnValue({
			autoCondenseContext: true,
			autoCondenseContextPercent: 85,
			profileThresholds: {},
		})

		const condenseSpy = vi.spyOn(contextManager, "condenseContext")

		contextManager.maybeTriggerBackgroundCondense()

		expect(condenseSpy).not.toHaveBeenCalled()

		// If threshold is 70%, SHOULD trigger.
		mockTask.providerRef.deref().getState.mockReturnValue({
			autoCondenseContext: true,
			autoCondenseContextPercent: 70,
			profileThresholds: {},
		})

		contextManager.maybeTriggerBackgroundCondense()

		expect(condenseSpy).toHaveBeenCalledTimes(1)
	})

	it("respects profile-specific thresholds", async () => {
		// Context tokens 100,000 / 128,000 = ~78%
		// Profile threshold = 90%
		mockTask.providerRef.deref().getState.mockReturnValue({
			autoCondenseContext: true,
			autoCondenseContextPercent: 70, // global is 70%
			currentProfileId: "high-budget",
			profileThresholds: {
				"high-budget": 90,
			},
		})

		const condenseSpy = vi.spyOn(contextManager, "condenseContext")

		contextManager.maybeTriggerBackgroundCondense()

		// 78% < 90% -> should not trigger
		expect(condenseSpy).not.toHaveBeenCalled()
	})
})

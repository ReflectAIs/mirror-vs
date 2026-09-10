import { describe, it, expect, vi, beforeEach } from "vitest"
import { handleAskResponse } from "../taskHandler"
import { MirrorProvider } from "../../MirrorProvider"
import type { WebviewMessage } from "@mirror-vs/types"

describe("handleAskResponse", () => {
	let mockProvider: any

	beforeEach(() => {
		vi.clearAllMocks()
		mockProvider = {
			getState: vi.fn().mockResolvedValue({}),
			getCurrentTask: vi.fn(),
			getLiveTask: vi.fn((id) => mockProvider.getCurrentTask()),
		}
	})

	it("immediately initiates task loop on messageResponse when task is idle and not waiting on ask", async () => {
		const sayMock = vi.fn().mockResolvedValue(undefined)
		const initiateTaskLoopMock = vi.fn().mockResolvedValue(undefined)
		const handleWebviewAskResponseMock = vi.fn()

		const mockTask = {
			taskId: "task-123",
			_started: true,
			isLoopActive: false,
			isWaitingOnAsk: false,
			taskAsk: undefined,
			idleAsk: undefined,
			resumableAsk: undefined,
			interactiveAsk: undefined,
			askResponse: undefined,
			mirrorMessages: [],
			say: sayMock,
			initiateTaskLoop: initiateTaskLoopMock,
			handleWebviewAskResponse: handleWebviewAskResponseMock,
		}
		mockProvider.getCurrentTask.mockReturnValue(mockTask)

		const message: WebviewMessage = {
			type: "askResponse",
			askResponse: "messageResponse",
			text: "Check this project for malware.",
			images: [],
		}

		await handleAskResponse(mockProvider as unknown as MirrorProvider, message)

		// Must NOT call handleWebviewAskResponse (which would swallow the message)
		expect(handleWebviewAskResponseMock).not.toHaveBeenCalled()

		// Must announce user_feedback and kick off initiateTaskLoop
		expect(sayMock).toHaveBeenCalledWith("user_feedback", "Check this project for malware.", [])
		expect(initiateTaskLoopMock).toHaveBeenCalledTimes(1)
		expect(initiateTaskLoopMock).toHaveBeenCalledWith([
			{
				type: "text",
				text: "<user_message>\nCheck this project for malware.\n</user_message>",
			},
		])
	})

	it("routes to handleWebviewAskResponse when task is actively waiting on an ask (isWaitingOnAsk is true)", async () => {
		const handleWebviewAskResponseMock = vi.fn()
		const initiateTaskLoopMock = vi.fn()

		const mockTask = {
			taskId: "task-123",
			_started: true,
			isLoopActive: true,
			isWaitingOnAsk: true,
			taskAsk: undefined,
			handleWebviewAskResponse: handleWebviewAskResponseMock,
			initiateTaskLoop: initiateTaskLoopMock,
			say: vi.fn(),
		}
		mockProvider.getCurrentTask.mockReturnValue(mockTask)

		const message: WebviewMessage = {
			type: "askResponse",
			askResponse: "messageResponse",
			text: "User response to ask",
			images: [],
		}

		await handleAskResponse(mockProvider as unknown as MirrorProvider, message)

		expect(handleWebviewAskResponseMock).toHaveBeenCalledWith("messageResponse", "User response to ask", [])
		expect(initiateTaskLoopMock).not.toHaveBeenCalled()
	})

	it("routes to handleWebviewAskResponse on button response (yesButtonClicked)", async () => {
		const handleWebviewAskResponseMock = vi.fn()
		const initiateTaskLoopMock = vi.fn()

		const mockTask = {
			taskId: "task-123",
			_started: true,
			isLoopActive: false,
			isWaitingOnAsk: false,
			taskAsk: undefined,
			handleWebviewAskResponse: handleWebviewAskResponseMock,
			initiateTaskLoop: initiateTaskLoopMock,
			say: vi.fn(),
		}
		mockProvider.getCurrentTask.mockReturnValue(mockTask)

		const message: WebviewMessage = {
			type: "askResponse",
			askResponse: "yesButtonClicked",
		}

		await handleAskResponse(mockProvider as unknown as MirrorProvider, message)

		expect(handleWebviewAskResponseMock).toHaveBeenCalledWith("yesButtonClicked", "", [])
		expect(initiateTaskLoopMock).not.toHaveBeenCalled()
	})

	it("injects in-between message when task loop is active and not waiting on ask", async () => {
		const injectInBetweenMessageMock = vi.fn().mockResolvedValue(undefined)
		const initiateTaskLoopMock = vi.fn()

		const mockTask = {
			taskId: "task-123",
			_started: true,
			isLoopActive: true,
			isWaitingOnAsk: false,
			taskAsk: undefined,
			handleWebviewAskResponse: vi.fn(),
			initiateTaskLoop: initiateTaskLoopMock,
			injectInBetweenMessage: injectInBetweenMessageMock,
			say: vi.fn(),
		}
		mockProvider.getCurrentTask.mockReturnValue(mockTask)

		const message: WebviewMessage = {
			type: "askResponse",
			askResponse: "messageResponse",
			text: "Steering message while task is running",
			images: [],
		}

		await handleAskResponse(mockProvider as unknown as MirrorProvider, message)

		expect(injectInBetweenMessageMock).toHaveBeenCalledWith(
			"Steering message while task is running",
			[],
			"user_feedback",
		)
		expect(initiateTaskLoopMock).not.toHaveBeenCalled()
	})
})

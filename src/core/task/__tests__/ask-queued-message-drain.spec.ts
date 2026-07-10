import { Task } from "../Task"

// Keep this test focused: if a queued message arrives while Task.ask() is blocked,
// it should be consumed and used to fulfill the ask.

describe("Task.ask queued message drain", () => {
	it("consumes queued message while blocked on followup ask", async () => {
		const task = Object.create(Task.prototype) as Task
		;(task as any).abort = false
		;(task as any).mirrorMessages = []
		;(task as any).askResponse = undefined
		;(task as any).askResponseText = undefined
		;(task as any).askResponseImages = undefined
		;(task as any).lastMessageTs = undefined

		// Message queue service: the bare prototype doesn't run the constructor,
		// so we attach a real one and wire it up ourselves.
		const { MessageQueueService } = await import("../../message-queue/MessageQueueService")
		;(task as any).messageQueueService = new MessageQueueService()

		// addToMirrorMessages must actually push the message so that
		// tryDrainQueuedMessage can find the last ask in mirrorMessages
		// with a ts matching this.lastMessageTs (set by ask()).
		;(task as any).addToMirrorMessages = vi.fn(async (msg: any) => {
			;(task as any).mirrorMessages.push(msg)
		})
		;(task as any).saveMirrorMessages = vi.fn(async () => {})
		;(task as any).updateMirrorMessage = vi.fn(async () => {})
		;(task as any).cancelAutoApprovalTimeout = vi.fn(() => {})
		;(task as any).checkpointSave = vi.fn(async () => {})
		;(task as any).emit = vi.fn()
		;(task as any).providerRef = { deref: () => undefined }
		;(task as any).handleWebviewAskResponse = vi.fn((response, text, images) => {
			;(task as any).askResponse = response
			;(task as any).askResponseText = text
			;(task as any).askResponseImages = images
		})

		const askPromise = task.ask("followup", "Q?", false)

		// Simulate webview queuing the user's selection text while the ask is pending.
		;(task as any).messageQueueService.addMessage("picked answer")

		// Drain the queued message manually (in real flow this happens via stateChanged handler)
		task.tryDrainQueuedMessage()

		const result = await askPromise
		expect(result.response).toBe("messageResponse")
		expect(result.text).toBe("picked answer")
	})

	it("consumes queued message via stateChanged handler", async () => {
		const task = Object.create(Task.prototype) as Task
		;(task as any).abort = false
		;(task as any).mirrorMessages = []
		;(task as any).askResponse = undefined
		;(task as any).askResponseText = undefined
		;(task as any).askResponseImages = undefined
		;(task as any).lastMessageTs = undefined

		const { MessageQueueService } = await import("../../message-queue/MessageQueueService")
		;(task as any).messageQueueService = new MessageQueueService()

		// Wire up the stateChanged handler manually just like the constructor does
		;(task as any).messageQueueService.on("stateChanged", () => {
			task.tryDrainQueuedMessage()
		})
		;(task as any).addToMirrorMessages = vi.fn(async (msg: any) => {
			;(task as any).mirrorMessages.push(msg)
		})
		;(task as any).saveMirrorMessages = vi.fn(async () => {})
		;(task as any).updateMirrorMessage = vi.fn(async () => {})
		;(task as any).cancelAutoApprovalTimeout = vi.fn(() => {})
		;(task as any).checkpointSave = vi.fn(async () => {})
		;(task as any).emit = vi.fn()
		;(task as any).providerRef = { deref: () => undefined }
		;(task as any).handleWebviewAskResponse = vi.fn((response, text, images) => {
			;(task as any).askResponse = response
			;(task as any).askResponseText = text
			;(task as any).askResponseImages = images
		})

		const askPromise = task.ask("followup", "Q?", false)

		// This triggers the stateChanged handler which calls tryDrainQueuedMessage
		;(task as any).messageQueueService.addMessage("picked answer")

		const result = await askPromise
		expect(result.response).toBe("messageResponse")
		expect(result.text).toBe("picked answer")
	})

	it("does not consume queued messages for command_output asks", async () => {
		const task = Object.create(Task.prototype) as Task
		;(task as any).abort = false
		;(task as any).mirrorMessages = []
		;(task as any).askResponse = undefined
		;(task as any).askResponseText = undefined
		;(task as any).askResponseImages = undefined
		;(task as any).lastMessageTs = undefined

		const { MessageQueueService } = await import("../../message-queue/MessageQueueService")
		;(task as any).messageQueueService = new MessageQueueService()
		;(task as any).addToMirrorMessages = vi.fn(async (msg: any) => {
			;(task as any).mirrorMessages.push(msg)
		})
		;(task as any).saveMirrorMessages = vi.fn(async () => {})
		;(task as any).updateMirrorMessage = vi.fn(async () => {})
		;(task as any).cancelAutoApprovalTimeout = vi.fn(() => {})
		;(task as any).checkpointSave = vi.fn(async () => {})
		;(task as any).emit = vi.fn()
		;(task as any).providerRef = { deref: () => undefined }
		;(task as any).handleWebviewAskResponse = vi.fn((response, text, images) => {
			;(task as any).askResponse = response
			;(task as any).askResponseText = text
			;(task as any).askResponseImages = images
		})

		const askPromise = task.ask("command_output", "command is still running...", false)
		;(task as any).messageQueueService.addMessage("1+1=?")

		setTimeout(() => {
			task.approveAsk()
		}, 0)

		const result = await askPromise

		expect(result.response).toBe("yesButtonClicked")
		expect(result.text).toBeUndefined()
		expect((task as any).messageQueueService.isEmpty()).toBe(false)
		expect((task as any).messageQueueService.messages[0]?.text).toBe("1+1=?")
	})
})

import { Task } from "../Task"
import { TaskUserInteraction } from "../TaskUserInteraction"

// NOTE: These tests validate the draining behavior of tryDrainQueuedMessage().
//
// The core invariant:
//   When a completion_result or resume_completed_task ask is blocking the
//   task loop and there are queued messages, tryDrainQueuedMessage MUST
//   dequeue ONE message and respond with messageResponse(text) — NOT
//   yesButtonClicked — so that:
//
//   1. AttemptCompletionTool pushes the queued text as a tool_result to
//      the API conversation (continuing the current task loop).
//   2. The model sees the user feedback, processes it, and calls
//      attempt_completion again.
//   3. On the NEXT completion_result ask, tryDrainQueuedMessage
//      dequeues the next message. This repeats until the queue is empty.
//   4. Only when the queue IS empty does yesButtonClicked fire,
//      triggering emitTaskCompleted → initiateTaskLoop breaks out.
//
// If yesButtonClicked fires while messages remain queued, the task
// "completes" but the loop sends "no tools used" → model calls
// attempt_completion again → another yesButtonClicked → infinite loop,
// queue never drains.

describe("Task.ask queued message drain", () => {
	// Shared setup for a bare Task prototype (no constructor side-effects).
	function makeTask() {
		const task = Object.create(Task.prototype) as Task
		;(task as any).abort = false
		;(task as any).mirrorMessages = []
		;(task as any).askResponse = undefined
		;(task as any).askResponseText = undefined
		;(task as any).askResponseImages = undefined
		;(task as any).lastMessageTs = undefined
		;(task as any).userInteractionManager = new TaskUserInteraction(task)
		;(task as any).mirrorMessagesManager = {
			addToMirrorMessages: vi.fn(async (msg: any) => {
				;(task as any).mirrorMessages.push(msg)
			}),
			saveMirrorMessages: vi.fn(async () => {}),
			updateMirrorMessage: vi.fn(async () => {}),
			findMessageByTimestamp: vi.fn(() => undefined),
		}
		;(task as any).checkpointSave = vi.fn(async () => {})
		;(task as any).emit = vi.fn()
		;(task as any).providerRef = { deref: () => undefined }
		const handleWebviewAskResponse = vi.fn((response, text, images) => {
			;(task as any).askResponse = response
			;(task as any).askResponseText = text
			;(task as any).askResponseImages = images
		})
		;(task as any).handleWebviewAskResponse = handleWebviewAskResponse
		vi.spyOn(task.userInteractionManager, "handleWebviewAskResponse").mockImplementation(handleWebviewAskResponse)
		return task
	}

	async function makeTaskWithQueue() {
		const { MessageQueueService } = await import("../../message-queue/MessageQueueService")
		const task = makeTask()
		;(task as any).messageQueueService = new MessageQueueService()
		return task
	}

	// ── Basic drain: followup ask ──────────────────────────────────────

	it("does not auto-drain queued message while blocked on followup ask", async () => {
		const task = await makeTaskWithQueue()
		const askPromise = task.ask("followup", "Q?", false)
		;(task as any).messageQueueService.addMessage("picked answer")
		const drained = task.tryDrainQueuedMessage()
		// Interactive asks are deliberately NOT auto-drained; the user must
		// respond explicitly (see TaskUserInteraction.tryDrainQueuedMessage).
		expect(drained).toBe(false)
		expect((task as any).messageQueueService.messages.length).toBe(1)

		// Resolve the ask explicitly and verify the queued text flows through.
		task.handleWebviewAskResponse("messageResponse", "picked answer")
		const result = await askPromise
		expect(result.response).toBe("messageResponse")
		expect(result.text).toBe("picked answer")
	})

	it("does not auto-drain queued message via stateChanged handler", async () => {
		const task = await makeTaskWithQueue()
		;(task as any).messageQueueService.on("stateChanged", () => {
			task.tryDrainQueuedMessage()
		})
		const askPromise = task.ask("followup", "Q?", false)
		;(task as any).messageQueueService.addMessage("picked answer")
		// Allow the stateChanged handler to run: the interactive ask must NOT
		// be drained, so the queue keeps its message.
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect((task as any).messageQueueService.messages.length).toBe(1)

		// Resolve the ask explicitly and verify the queued text flows through.
		task.handleWebviewAskResponse("messageResponse", "picked answer")
		const result = await askPromise
		expect(result.response).toBe("messageResponse")
		expect(result.text).toBe("picked answer")
	})

	// ── command_output does NOT drain ──────────────────────────────────

	it("does not consume queued messages for command_output asks", async () => {
		const task = await makeTaskWithQueue()
		const askPromise = task.ask("command_output", "command is still running...", false)
		;(task as any).messageQueueService.addMessage("1+1=?")
		setTimeout(() => task.approveAsk(), 0)
		const result = await askPromise
		expect(result.response).toBe("yesButtonClicked")
		expect(result.text).toBeUndefined()
		expect((task as any).messageQueueService.isEmpty()).toBe(false)
		expect((task as any).messageQueueService.messages[0]?.text).toBe("1+1=?")
	})

	// ── completion_result with queued messages: dequeue as feedback ────
	// This is the critical fix: completion_result + queued messages should
	// dequeue the message as user feedback (messageResponse) — NOT
	// yesButtonClicked — so the task loop continues processing queued
	// messages within the same session.

	it("drains first queued message as feedback when blocked on completion_result (not yesButtonClicked)", async () => {
		const task = await makeTaskWithQueue()
		;(task as any).messageQueueService.addMessage("Message one")
		;(task as any).messageQueueService.addMessage("Message two")
		;(task as any).messageQueueService.addMessage("Message three")

		const askPromise = task.ask("completion_result", "", false)
		task.tryDrainQueuedMessage()
		const result = await askPromise

		// Must respond with messageResponse (queued text), NOT yesButtonClicked
		expect(result.response).toBe("messageResponse")
		expect(result.text).toBe("Message one")
		// Queue should now have 2 messages remaining
		expect((task as any).messageQueueService.messages.length).toBe(2)
		expect((task as any).messageQueueService.messages[0]?.text).toBe("Message two")
		expect((task as any).messageQueueService.messages[1]?.text).toBe("Message three")
	})

	it("drains queued messages sequentially across multiple completion_result asks", async () => {
		const task = await makeTaskWithQueue()
		;(task as any).messageQueueService.addMessage("Msg 1")
		;(task as any).messageQueueService.addMessage("Msg 2")
		;(task as any).messageQueueService.addMessage("Msg 3")

		// First completion_result → drains Msg 1
		let askPromise = task.ask("completion_result", "", false)
		task.tryDrainQueuedMessage()
		let result = await askPromise
		expect(result.response).toBe("messageResponse")
		expect(result.text).toBe("Msg 1")
		expect((task as any).messageQueueService.messages.length).toBe(2)

		// Second completion_result → drains Msg 2
		askPromise = task.ask("completion_result", "", false)
		task.tryDrainQueuedMessage()
		result = await askPromise
		expect(result.response).toBe("messageResponse")
		expect(result.text).toBe("Msg 2")
		expect((task as any).messageQueueService.messages.length).toBe(1)

		// Third completion_result → drains Msg 3
		askPromise = task.ask("completion_result", "", false)
		task.tryDrainQueuedMessage()
		result = await askPromise
		expect(result.response).toBe("messageResponse")
		expect(result.text).toBe("Msg 3")
		expect((task as any).messageQueueService.messages.length).toBe(0)

		// Fourth: queue is empty → yesButtonClicked (task truly completes)
		askPromise = task.ask("completion_result", "", false)
		task.tryDrainQueuedMessage()
		// When queue is empty, tryDrainQueuedMessage is a no-op, so the
		// ask remains pending until something else resolves it.
		task.handleWebviewAskResponse("yesButtonClicked")
		result = await askPromise
		expect(result.response).toBe("yesButtonClicked")
	})

	// ── resume_completed_task same behavior ────────────────────────────

	it("drains queued message as feedback when blocked on resume_completed_task", async () => {
		const task = await makeTaskWithQueue()
		;(task as any).messageQueueService.addMessage("Resume feedback")
		;(task as any).messageQueueService.addMessage("Extra message")

		const askPromise = task.ask("resume_completed_task", "", false)
		task.tryDrainQueuedMessage()
		const result = await askPromise

		expect(result.response).toBe("messageResponse")
		expect(result.text).toBe("Resume feedback")
		expect((task as any).messageQueueService.messages.length).toBe(1)
	})

	// ── interaction with stateChanged handler (real-world path) ────────

	it("via stateChanged: completion_result drains first message and continues within same task", async () => {
		const task = await makeTaskWithQueue()
		;(task as any).messageQueueService.addMessage("First")
		;(task as any).messageQueueService.addMessage("Second")

		// Wire up stateChanged → tryDrainQueuedMessage (as real constructor does)
		;(task as any).messageQueueService.on("stateChanged", () => {
			task.tryDrainQueuedMessage()
		})

		const askPromise = task.ask("completion_result", "", false)
		task.tryDrainQueuedMessage()
		const result = await askPromise

		expect(result.response).toBe("messageResponse")
		expect(result.text).toBe("First")
		expect((task as any).messageQueueService.messages.length).toBe(1)
		expect((task as any).messageQueueService.messages[0]?.text).toBe("Second")
	})

	// ── Empty queue ────────────────────────────────────────────────────

	it("tryDrainQueuedMessage is a no-op when queue is empty", async () => {
		const task = await makeTaskWithQueue()
		const drained = task.tryDrainQueuedMessage()
		expect(drained).toBe(false)
		expect((task as any).handleWebviewAskResponse).not.toHaveBeenCalled()
	})

	// ── No ask pending ─────────────────────────────────────────────────

	it("tryDrainQueuedMessage is a no-op when no ask is pending", async () => {
		const task = await makeTaskWithQueue()
		;(task as any).messageQueueService.addMessage("orphan message")
		const drained = task.tryDrainQueuedMessage()
		expect(drained).toBe(false)
		expect((task as any).messageQueueService.messages.length).toBe(1)
	})

	// ── askResponse already set ────────────────────────────────────────

	it("tryDrainQueuedMessage is a no-op when askResponse is already set", async () => {
		const task = await makeTaskWithQueue()
		;(task as any).messageQueueService.addMessage("will not drain")
		;(task as any).askResponse = "yesButtonClicked"
		;(task as any).lastMessageTs = 12345
		;(task as any).mirrorMessages = [{ ts: 12345, type: "ask", ask: "completion_result" }]
		const drained = task.tryDrainQueuedMessage()
		expect(drained).toBe(false)
		expect((task as any).messageQueueService.messages.length).toBe(1)
	})

	// ── Interactive ask types do NOT auto-drain ───────────────────────

	it("does not auto-drain queued message inline for tool ask", async () => {
		const task = await makeTaskWithQueue()

		const askPromise = task.ask("tool", '{"tool":"readFile","path":"/tmp"}', false)
		;(task as any).messageQueueService.addMessage("approve")
		const drained = task.tryDrainQueuedMessage()
		// tool ask is interactive, so it must NOT be auto-drained.
		expect(drained).toBe(false)
		expect((task as any).messageQueueService.messages.length).toBe(1)

		// Approve the tool ask explicitly and verify the queued text flows through.
		task.handleWebviewAskResponse("messageResponse", "approve")
		const result = await askPromise
		expect(result.response).toBe("messageResponse")
		expect(result.text).toBe("approve")
	})

	it("does not auto-drain queued message inline for resume_task ask", async () => {
		const task = await makeTaskWithQueue()

		const askPromise = task.ask("resume_task", "", false)
		;(task as any).messageQueueService.addMessage("yes continue")
		const drained = task.tryDrainQueuedMessage()
		// resume_task ask is interactive, so it must NOT be auto-drained.
		expect(drained).toBe(false)
		expect((task as any).messageQueueService.messages.length).toBe(1)

		// Resume the task explicitly and verify the queued text flows through.
		task.handleWebviewAskResponse("messageResponse", "yes continue")
		const result = await askPromise
		expect(result.response).toBe("messageResponse")
		expect(result.text).toBe("yes continue")
	})
})

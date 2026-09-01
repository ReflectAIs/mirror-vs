import { type WebviewMessage, type EditQueuedMessagePayload } from "@mirror-vs/types"

import { MirrorProvider } from "../MirrorProvider"
import { resolveIncomingImages } from "./_helpers"

/**
 * Handles adding a message to the chat queue.
 */
export async function handleQueueMessage(provider: MirrorProvider, message: WebviewMessage): Promise<void> {
	const resolved = await resolveIncomingImages(provider, { text: message.text, images: message.images })
	const currentTask = provider.getLiveTask ? provider.getLiveTask(message.taskId) : provider.getCurrentTask?.()
	if (currentTask) {
		currentTask.messageQueueService.addMessage(resolved.text, resolved.images)

		// If the task is already started and the loop is not currently active (e.g. idle or background terminal running),
		// immediately dequeue and start the task loop so the queued message is acted upon without delay.
		if (!currentTask.isLoopActive && (currentTask as any)._started) {
			currentTask.abort = false
			const queued = currentTask.messageQueueService.dequeueMessage()
			if (queued) {
				await currentTask.say("user_feedback", queued.text, queued.images)
				const { formatResponse } = await import("../../prompts/responses")
				const imageBlocks = formatResponse.imageBlocks(queued.images)
				const userContent = [
					{ type: "text" as const, text: `<user_message>\n${queued.text}\n</user_message>` },
					...imageBlocks,
				]
				void currentTask.initiateTaskLoop(userContent)
			}
		}
	}
}

/**
 * Handles removing a message from the chat queue.
 */
export async function handleRemoveQueuedMessage(provider: MirrorProvider, message: WebviewMessage): Promise<void> {
	const currentTask = provider.getLiveTask ? provider.getLiveTask(message.taskId) : provider.getCurrentTask?.()
	currentTask?.messageQueueService.removeMessage(message.text ?? "")
}

/**
 * Handles editing a queued message.
 */
export async function handleEditQueuedMessage(provider: MirrorProvider, message: WebviewMessage): Promise<void> {
	if (message.payload) {
		const { id, text, images } = message.payload as EditQueuedMessagePayload
		const currentTask = provider.getLiveTask ? provider.getLiveTask(message.taskId) : provider.getCurrentTask?.()
		currentTask?.messageQueueService.updateMessage(id, text, images)
	}
}

/**
 * Handles force-sending a queued message as an in-between steering message.
 */
export async function handleForceSendQueuedMessage(provider: MirrorProvider, message: WebviewMessage): Promise<void> {
	const currentTask = provider.getLiveTask ? provider.getLiveTask(message.taskId) : provider.getCurrentTask?.()
	if (!currentTask) return

	// Remove from queue if message.text represents an ID or if payload.id is provided
	const payload = message.payload as { id?: string; text?: string; images?: string[] } | undefined
	const idToRemove = payload?.id || message.text
	if (idToRemove) {
		currentTask.messageQueueService.removeMessage(idToRemove)
	}

	const text = payload?.text ?? message.text ?? ""
	const images = payload?.images ?? message.images

	const resolved = await resolveIncomingImages(provider, { text, images })

	// If the task is currently waiting on an ask (e.g. question/approval), answer the ask with this message
	if (currentTask.taskAsk && !currentTask.taskAsk.isAnswered) {
		currentTask.handleWebviewAskResponse("messageResponse", resolved.text, resolved.images)
		return
	}

	if (currentTask.isLoopActive) {
		await currentTask.injectInBetweenMessage(resolved.text, resolved.images)
	} else if ((currentTask as any)._started) {
		await currentTask.say("user_feedback", resolved.text, resolved.images)
		const { formatResponse } = await import("../../prompts/responses")
		const imageBlocks = formatResponse.imageBlocks(resolved.images)
		const userContent = [
			{ type: "text" as const, text: `<user_message>\n${resolved.text}\n</user_message>` },
			...imageBlocks,
		]
		void currentTask.initiateTaskLoop(userContent)
	}
}

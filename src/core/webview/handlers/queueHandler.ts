import { type WebviewMessage, type EditQueuedMessagePayload } from "@mirror-vs/types"

import { MirrorProvider } from "../MirrorProvider"
import { resolveIncomingImages } from "./_helpers"

/**
 * Handles adding a message to the chat queue.
 */
export async function handleQueueMessage(provider: MirrorProvider, message: WebviewMessage): Promise<void> {
	const resolved = await resolveIncomingImages(provider, { text: message.text, images: message.images })
	const currentTask = provider.getCurrentTask()
	if (currentTask) {
		currentTask.messageQueueService.addMessage(resolved.text, resolved.images)
	}
}

/**
 * Handles removing a message from the chat queue.
 */
export async function handleRemoveQueuedMessage(provider: MirrorProvider, message: WebviewMessage): Promise<void> {
	provider.getCurrentTask()?.messageQueueService.removeMessage(message.text ?? "")
}

/**
 * Handles editing a queued message.
 */
export async function handleEditQueuedMessage(provider: MirrorProvider, message: WebviewMessage): Promise<void> {
	if (message.payload) {
		const { id, text, images } = message.payload as EditQueuedMessagePayload
		provider.getCurrentTask()?.messageQueueService.updateMessage(id, text, images)
	}
}

import { type WebviewMessage } from "@mirror-vs/types"

import { MirrorProvider } from "../MirrorProvider"
import { getGlobalState, updateGlobalState } from "./_helpers"

/**
 * Handles dismissing an upsell notification.
 */
export async function handleDismissUpsell(provider: MirrorProvider, message: WebviewMessage): Promise<void> {
	if (message.upsellId) {
		try {
			const dismissedUpsells = getGlobalState(provider, "dismissedUpsells") || []

			let updatedList = dismissedUpsells
			if (!dismissedUpsells.includes(message.upsellId)) {
				updatedList = [...dismissedUpsells, message.upsellId]
				await updateGlobalState(provider, "dismissedUpsells", updatedList)
			}

			await provider.postMessageToWebview({
				type: "dismissedUpsells",
				list: updatedList,
			})
		} catch (error) {
			provider.log(`Failed to dismiss upsell: ${error instanceof Error ? error.message : String(error)}`)
		}
	}
}

/**
 * Handles requesting the list of dismissed upsells.
 */
export async function handleGetDismissedUpsells(provider: MirrorProvider): Promise<void> {
	const dismissedUpsells = getGlobalState(provider, "dismissedUpsells") || []
	await provider.postMessageToWebview({
		type: "dismissedUpsells",
		list: dismissedUpsells,
	})
}

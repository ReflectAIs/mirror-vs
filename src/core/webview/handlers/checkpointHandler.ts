import * as vscode from "vscode"
import pWaitFor from "p-wait-for"

import { type WebviewMessage } from "@mirror-vs/types"
import { checkoutDiffPayloadSchema, checkoutRestorePayloadSchema } from "@mirror-vs/types"

import { MirrorProvider } from "../MirrorProvider"
import { t } from "../../../i18n"

/**
 * Handles the checkpoint diff operation — shows diff for a checkpoint.
 */
export async function handleCheckpointDiff(provider: MirrorProvider, message: WebviewMessage): Promise<void> {
	const result = checkoutDiffPayloadSchema.safeParse(message.payload)

	if (result.success) {
		await provider.getCurrentTask()?.checkpointDiff(result.data)
	}
}

/**
 * Handles the checkpoint restore operation — restores files to a checkpoint state.
 */
export async function handleCheckpointRestore(provider: MirrorProvider, message: WebviewMessage): Promise<void> {
	const result = checkoutRestorePayloadSchema.safeParse(message.payload)

	if (result.success) {
		await provider.cancelTask()

		try {
			await pWaitFor(() => provider.getCurrentTask()?.isInitialized === true, { timeout: 3_000 })
		} catch (error) {
			vscode.window.showErrorMessage(t("common:errors.checkpoint_timeout"))
		}

		try {
			await provider.getCurrentTask()?.checkpointRestore(result.data)
		} catch (error) {
			vscode.window.showErrorMessage(t("common:errors.checkpoint_failed"))
		}
	}
}

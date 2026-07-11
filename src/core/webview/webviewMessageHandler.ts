/**
 * webviewMessageHandler.ts — Thin delegation layer.
 *
 * Routes all webview messages to the appropriate domain handler via
 * messageRouter.ts.  The original 3 324‑line monolith has been
 * decomposed into focused handler files under ./handlers/.
 *
 * See:
 *  - messageRouter.ts     – routing switch
 *  - handlers/*.ts        – domain‑specific handler functions
 *  - plans/monolith-decomposition-plan.md – refactoring plan
 */

import type { WebviewMessage } from "@mirror-vs/types"
import type { MirrorProvider } from "./MirrorProvider"
import { routeMessage } from "./messageRouter"

export const webviewMessageHandler = async (provider: MirrorProvider, message: WebviewMessage): Promise<void> => {
	await routeMessage(provider, message)
}

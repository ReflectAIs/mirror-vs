import { Anthropic } from "@anthropic-ai/sdk"
import workerpool from "workerpool"

import { countTokensResultSchema } from "../workers/types"
import { tiktoken } from "./tiktoken"

let pool: workerpool.Pool | null | undefined = undefined

export type CountTokensOptions = {
	useWorker?: boolean
}

export async function countTokens(
	content: Anthropic.Messages.ContentBlockParam[],
	{ useWorker = true }: CountTokensOptions = {},
): Promise<number> {
	// Lazily create the worker pool if it doesn't exist.
	if (useWorker && typeof pool === "undefined") {
		pool = workerpool.pool(__dirname + "/workers/countTokens.js", {
			// A single worker keeps the (expensive-to-construct) tiktoken encoder resident.
			// A generous queue lets bursts of counts from multiple tabs queue up instead of
			// overflowing: an overflow throws and falls back to running tiktoken on the main
			// thread, which blocks the VS Code extension host.
			maxWorkers: 1,
			maxQueueSize: 100,
		})
	}

	// If the worker pool doesn't exist or the caller doesn't want to use it
	// then, use the non-worker implementation.
	if (!useWorker || !pool) {
		return tiktoken(content)
	}

	try {
		const data = await pool.exec("countTokens", [content])
		const result = countTokensResultSchema.parse(data)

		if (!result.success) {
			throw new Error(result.error)
		}

		return result.count
	} catch (error) {
		// Reset to undefined so a subsequent call can lazily recreate the worker pool
		// rather than permanently degrading to the main thread (typeof null === "object").
		try {
			await pool?.terminate()
		} catch {}
		pool = undefined
		console.error(error)
		return tiktoken(content)
	}
}

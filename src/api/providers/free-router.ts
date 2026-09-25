import { Anthropic } from "@anthropic-ai/sdk"
import {
	freeRouterDefaultModelId,
	freeRouterDefaultModelInfo,
	freeRouterModels,
	DEFAULT_FREE_ROUTER_MODELS,
	type ModelInfo,
} from "@mirror-vs/types"

import type { ApiHandlerOptions } from "../../shared/api"
import type { ApiHandlerCreateMessageMetadata } from "../index"
import { ApiStreamChunk } from "../transform/stream"

import { BaseProvider } from "./base-provider"
import { OpenRouterHandler } from "./openrouter"

export interface ModelHealth {
	modelId: string
	isExhausted: boolean
	exhaustedUntil?: number
	failureCount: number
	lastError?: string
}

// Global in-memory health map shared across handler instances for the session
const modelHealthMap = new Map<string, ModelHealth>()

/**
 * Default cooldown period when a free model hits rate limits or quota exhaustion (10 minutes).
 */
export const DEFAULT_FREE_ROUTER_COOLDOWN_MS = 10 * 60 * 1000

/**
 * Returns the current health state of all tracked free models.
 */
export function getModelHealthMap(): Map<string, ModelHealth> {
	return modelHealthMap
}

/**
 * Reset cooldown for a specific model, or all models if modelId is omitted.
 */
export function resetModelCooldown(modelId?: string): void {
	if (modelId) {
		modelHealthMap.delete(modelId)
	} else {
		modelHealthMap.clear()
	}
}

/**
 * Check if a model is currently exhausted and in cooldown.
 */
export function isModelExhausted(modelId: string): boolean {
	const health = modelHealthMap.get(modelId)
	if (!health || !health.isExhausted) {
		return false
	}
	if (health.exhaustedUntil && Date.now() >= health.exhaustedUntil) {
		// Cooldown has expired, auto-recover
		health.isExhausted = false
		health.exhaustedUntil = undefined
		return false
	}
	return true
}

/**
 * Determines whether an error indicates rate limiting, quota exhaustion, endpoint unavailability, or temporary capacity issues.
 */
export function isExhaustionError(error: unknown): boolean {
	if (!error) return false

	const anyErr = error as any
	const status = anyErr.status ?? anyErr.statusCode ?? anyErr.code ?? anyErr.error?.code

	// Fatal / non-retryable client errors that should NOT trigger failover cooldown:
	if (status === 401 || status === "401") {
		return false
	}
	if (anyErr.name === "AbortError") {
		return false
	}

	const rawMsg =
		anyErr.message ||
		anyErr.error?.message ||
		anyErr.error?.metadata?.raw ||
		(typeof error === "string" ? error : "")

	const msgLower = String(rawMsg).toLowerCase()

	if (msgLower.includes("invalid api key") || msgLower.includes("unauthorized") || msgLower.includes("abort")) {
		return false
	}

	// HTTP status code checks indicating endpoint or provider unavailability:
	// 429: Rate Limit / Too Many Requests
	// 402: Payment Required / Free Credits Exhausted
	// 404: Endpoint / Model Not Found (e.g. OpenRouter "404 No endpoints found for <model>")
	// 502: Bad Gateway (upstream free provider failure)
	// 503: Service Unavailable (upstream overloaded)
	// 504: Gateway Timeout (upstream unresponsive)
	if (
		status === 429 ||
		status === "429" ||
		status === 402 ||
		status === "402" ||
		status === 404 ||
		status === "404" ||
		status === 502 ||
		status === "502" ||
		status === 503 ||
		status === "503" ||
		status === 504 ||
		status === "504"
	) {
		return true
	}

	const exhaustionKeywords = [
		"rate limit",
		"rate_limit",
		"ratelimit",
		"quota",
		"exhausted",
		"credits",
		"too many requests",
		"capacity",
		"overloaded",
		"temporarily unavailable",
		"free tier",
		"limit exceeded",
		"resource_exhausted",
		"resourcelimitexceeded",
		"429",
		"insufficient_quota",
		"billing",
		"exceeded your current quota",
		"service unavailable",
		"no endpoints found",
		"no endpoint found",
		"endpoint not found",
		"not found",
		"404",
		"bad gateway",
		"gateway timeout",
		"no healthy upstream",
		"provider offline",
		"temporarily offline",
		"no provider available",
	]

	return exhaustionKeywords.some((keyword) => msgLower.includes(keyword))
}

export class FreeRouterHandler extends BaseProvider {
	private readonly options: ApiHandlerOptions
	private readonly apiKey?: string
	private readonly cooldownMs: number
	private currentActiveModelId?: string

	constructor(options: ApiHandlerOptions) {
		super()
		this.options = options
		this.apiKey = options.freeRouterApiKey || options.openRouterApiKey
		this.cooldownMs =
			options.freeRouterCooldownMinutes && options.freeRouterCooldownMinutes > 0
				? options.freeRouterCooldownMinutes * 60 * 1000
				: DEFAULT_FREE_ROUTER_COOLDOWN_MS
	}

	/**
	 * Returns the list of configured model IDs in priority order.
	 * In Auto-Router mode, models are managed automatically based on the curated free models pool.
	 */
	public getModelPool(): string[] {
		// 1. If user specified custom model list in settings, use that
		if (Array.isArray(this.options.freeRouterModels) && this.options.freeRouterModels.length > 0) {
			return this.options.freeRouterModels
		}

		// 2. Default pool: all active default free models in curated priority order
		return DEFAULT_FREE_ROUTER_MODELS.map((m) => m.id)
	}

	/**
	 * Returns the currently active healthy model ID and info.
	 */
	override getModel(): { id: string; info: ModelInfo } {
		if (this.currentActiveModelId && !isModelExhausted(this.currentActiveModelId)) {
			const info = freeRouterModels[this.currentActiveModelId] || freeRouterDefaultModelInfo
			return { id: this.currentActiveModelId, info }
		}

		const pool = this.getModelPool()
		const healthyId = pool.find((id) => !isModelExhausted(id)) || pool[0] || freeRouterDefaultModelId
		const info = freeRouterModels[healthyId] || freeRouterDefaultModelInfo

		return { id: healthyId, info }
	}

	/**
	 * Create message stream with automatic circuit breaker and model failover.
	 */
	override async *createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): AsyncGenerator<ApiStreamChunk> {
		const pool = this.getModelPool()

		// Separate healthy and cooling down models
		const healthyModels: string[] = []
		const coolingDownModels: { id: string; remainingSeconds: number }[] = []

		for (const modelId of pool) {
			if (!isModelExhausted(modelId)) {
				healthyModels.push(modelId)
			} else {
				const health = modelHealthMap.get(modelId)
				const remainingMs = Math.max(0, (health?.exhaustedUntil ?? Date.now()) - Date.now())
				coolingDownModels.push({ id: modelId, remainingSeconds: Math.ceil(remainingMs / 1000) })
			}
		}

		// If all models are cooling down, check if we can try the one expiring soonest
		const candidatesToTry =
			healthyModels.length > 0
				? healthyModels
				: coolingDownModels.sort((a, b) => a.remainingSeconds - b.remainingSeconds).map((m) => m.id)

		if (candidatesToTry.length === 0) {
			throw new Error("No free models configured in the Free Router pool.")
		}

		let lastError: Error | null = null

		for (let i = 0; i < candidatesToTry.length; i++) {
			const candidateModelId = candidatesToTry[i]
			let firstChunkYielded = false

			try {
				// Build an OpenRouterHandler configured for this free model
				const candidateHandler = new OpenRouterHandler({
					...this.options,
					openRouterModelId: candidateModelId,
					openRouterApiKey: this.apiKey,
					openRouterBaseUrl: this.options.openRouterBaseUrl || "https://openrouter.ai/api/v1",
				})

				const stream = candidateHandler.createMessage(systemPrompt, messages, metadata)

				for await (const chunk of stream) {
					if (!firstChunkYielded) {
						firstChunkYielded = true
						this.currentActiveModelId = candidateModelId
						this.options.apiModelId = candidateModelId
					}
					yield chunk
				}

				// If stream completed successfully, mark model healthy
				const existingHealth = modelHealthMap.get(candidateModelId)
				if (existingHealth) {
					existingHealth.isExhausted = false
					existingHealth.exhaustedUntil = undefined
					existingHealth.failureCount = 0
				}

				// Successfully served request
				return
			} catch (err: any) {
				lastError = err

				// If we already started streaming tokens to the user, we cannot cleanly restart
				if (firstChunkYielded) {
					throw err
				}

				// Check if this error is an exhaustion / rate-limit error
				if (isExhaustionError(err)) {
					const now = Date.now()
					const prev = modelHealthMap.get(candidateModelId)
					const failureCount = (prev?.failureCount ?? 0) + 1
					// Exponential backoff multiplier for repeated failures up to 30 min
					const backoffMultiplier = Math.min(3, failureCount)
					const cooldownMs = this.cooldownMs * backoffMultiplier
					const exhaustedUntil = now + cooldownMs

					modelHealthMap.set(candidateModelId, {
						modelId: candidateModelId,
						isExhausted: true,
						exhaustedUntil,
						failureCount,
						lastError: err.message,
					})

					const cooldownMins = Math.round(cooldownMs / 60000)
					const nextCandidate = candidatesToTry[i + 1]

					console.warn(
						`[FreeRouter] Model "${candidateModelId}" hit rate limit/exhaustion (${err.message}). ` +
							`Cooling down for ${cooldownMins}m. ` +
							(nextCandidate
								? `Auto-routing to next available free model: "${nextCandidate}"...`
								: "No remaining healthy models in candidate pool."),
					)

					// Continue loop to try next model
					continue
				}

				// Non-exhaustion error (e.g. abort, invalid syntax), rethrow immediately
				throw err
			}
		}

		// If all candidates were exhausted
		const summary = candidatesToTry
			.map((id) => {
				const health = modelHealthMap.get(id)
				const remainingSec = health?.exhaustedUntil ? Math.ceil((health.exhaustedUntil - Date.now()) / 1000) : 0
				return `• ${id}: cooling down (${remainingSec}s remaining)`
			})
			.join("\n")

		throw new Error(
			`All free models in the router are currently exhausted or rate-limited:\n${summary}\n\n` +
				`Last error: ${lastError?.message || "Rate limit reached"}\n` +
				`They will automatically recover when their cooldown expires. You can also reset cooldowns in Settings.`,
		)
	}
}

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
import { GroqHandler } from "./groq"
import { CerebrasHandler } from "./cerebras"
import { NvidiaHandler } from "./nvidia"
import { SambaNovaHandler } from "./sambanova"
import { GeminiHandler } from "./gemini"

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

	// Do not failover on user-initiated cancellation or invalid key configuration
	if (
		msgLower.includes("invalid api key") ||
		msgLower.includes("unauthorized") ||
		msgLower.includes("request aborted by user") ||
		msgLower.includes("request cancelled by user")
	) {
		return false
	}

	// HTTP status code checks indicating endpoint or provider unavailability / permissions:
	// 400: Bad Request (deprecated or unsupported model on provider)
	// 402: Payment Required / Free Credits Exhausted
	// 403: Forbidden / Permission Denied / Cloudflare Geoblock
	// 404: Endpoint / Model Not Found (e.g. OpenRouter "404 No endpoints found for <model>")
	// 408: Request Timeout
	// 410: Gone / Endpoint Disabled / Missing Public API Endpoints permission (e.g. NVIDIA NIM)
	// 429: Rate Limit / Too Many Requests
	// 500: Upstream Server Error
	// 502: Bad Gateway (upstream free provider failure)
	// 503: Service Unavailable (upstream overloaded)
	// 504: Gateway Timeout (upstream unresponsive)
	// 520-529: Cloudflare / Edge timeout & origin down
	if (
		status === 400 ||
		status === "400" ||
		status === 402 ||
		status === "402" ||
		status === 403 ||
		status === "403" ||
		status === 404 ||
		status === "404" ||
		status === 408 ||
		status === "408" ||
		status === 410 ||
		status === "410" ||
		status === 429 ||
		status === "429" ||
		status === 500 ||
		status === "500" ||
		status === 502 ||
		status === "502" ||
		status === 503 ||
		status === "503" ||
		status === 504 ||
		status === "504" ||
		status === 520 ||
		status === "520" ||
		status === 521 ||
		status === "521" ||
		status === 522 ||
		status === "522" ||
		status === 524 ||
		status === "524" ||
		status === 529 ||
		status === "529"
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
		"timeout",
		"timed out",
		"econnreset",
		"etimedout",
		"esockettimedout",
		"socket hang up",
		"fetch failed",
		"network error",
		"premature close",
		"stream closed",
		"unresponsive",
		"stopped responding",
		"empty response",
		"streaming error",
		"410",
		"gone",
		"403",
		"forbidden",
		"permission",
		"public api endpoints",
		"entitlement",
	]

	return exhaustionKeywords.some((keyword) => msgLower.includes(keyword))
}

const FIRST_CHUNK_TIMEOUT_MS = 25_000

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
	 * Builds an appropriate API handler instance for the candidate free model.
	 * Dispatches to Groq, Cerebras, NVIDIA, SambaNova, Gemini, or OpenRouter based on model prefix.
	 */
	public buildCandidateHandler(candidateModelId: string) {
		if (candidateModelId.startsWith("groq/")) {
			const modelId = candidateModelId.replace(/^groq\//, "")
			return new GroqHandler({
				...this.options,
				apiModelId: modelId,
				groqApiKey: this.options.groqApiKey,
			})
		}

		if (candidateModelId.startsWith("cerebras/")) {
			const modelId = candidateModelId.replace(/^cerebras\//, "")
			return new CerebrasHandler({
				...this.options,
				apiModelId: modelId,
				cerebrasApiKey: this.options.cerebrasApiKey,
			})
		}

		if (candidateModelId.startsWith("nvidia/")) {
			const modelId = candidateModelId.replace(/^nvidia\//, "")
			return new NvidiaHandler({
				...this.options,
				apiModelId: modelId,
				nvidiaApiKey: this.options.nvidiaApiKey,
			})
		}

		if (candidateModelId.startsWith("sambanova/")) {
			const modelId = candidateModelId.replace(/^sambanova\//, "")
			return new SambaNovaHandler({
				...this.options,
				apiModelId: modelId,
				sambaNovaApiKey: this.options.sambaNovaApiKey,
			})
		}

		if (candidateModelId.startsWith("gemini/")) {
			const modelId = candidateModelId.replace(/^gemini\//, "")
			return new GeminiHandler({
				...this.options,
				apiModelId: modelId,
				geminiApiKey: this.options.geminiApiKey,
			})
		}

		return new OpenRouterHandler({
			...this.options,
			openRouterModelId: candidateModelId,
			openRouterApiKey: this.apiKey,
			openRouterBaseUrl: this.options.openRouterBaseUrl || "https://openrouter.ai/api/v1",
		})
	}

	/**
	 * Returns the list of configured model IDs in priority order.
	 * Dynamically incorporates models from all free providers with configured API keys,
	 * backed by OpenRouter zero-cost models.
	 */
	public getModelPool(): string[] {
		// 1. If user explicitly specified custom models in settings, use them
		if (Array.isArray(this.options.freeRouterModels) && this.options.freeRouterModels.length > 0) {
			const pool = [...this.options.freeRouterModels]
			if (this.options.apiModelId && this.options.apiModelId.trim()) {
				const preferred = this.options.apiModelId.trim()
				return [preferred, ...pool.filter((id) => id !== preferred)]
			}
			return pool
		}

		// 2. Multi-provider free pool: include models from providers where keys are set
		const pool: string[] = []

		if (this.options.groqApiKey) {
			pool.push("groq/llama-3.3-70b-versatile", "groq/deepseek-r1-distill-llama-70b", "groq/llama-3.1-8b-instant")
		}

		if (this.options.cerebrasApiKey) {
			pool.push("cerebras/llama-3.3-70b", "cerebras/llama3.1-8b")
		}

		if (this.options.nvidiaApiKey) {
			pool.push(
				"nvidia/meta/llama-3.3-70b-instruct",
				"nvidia/deepseek-ai/deepseek-r1",
				"nvidia/nvidia/llama-3.1-nemotron-70b-instruct",
			)
		}

		if (this.options.sambaNovaApiKey) {
			pool.push("sambanova/Meta-Llama-3.3-70B-Instruct", "sambanova/DeepSeek-R1-Distill-Llama-70B")
		}

		if (this.options.geminiApiKey) {
			pool.push("gemini/gemini-2.5-flash", "gemini/gemini-2.0-flash")
		}

		// Always include OpenRouter free models as resilient baseline
		const defaultOpenRouterModels = DEFAULT_FREE_ROUTER_MODELS.filter((m) => m.provider === "openrouter").map(
			(m) => m.id,
		)
		for (const id of defaultOpenRouterModels) {
			if (!pool.includes(id)) {
				pool.push(id)
			}
		}

		// If user selected a preferred primary model via quick change, prioritize it
		if (this.options.apiModelId && this.options.apiModelId.trim()) {
			const preferred = this.options.apiModelId.trim()
			return [preferred, ...pool.filter((id) => id !== preferred)]
		}

		return pool
	}

	/**
	 * Returns the currently active healthy model ID and info.
	 */
	override getModel(): { id: string; info: ModelInfo } {
		// If user selected a preferred model and it's healthy, prioritize it
		const preferred = this.options.apiModelId?.trim()
		if (preferred && !isModelExhausted(preferred)) {
			const info = freeRouterModels[preferred] || freeRouterDefaultModelInfo
			return { id: preferred, info }
		}

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
				// Build handler for this candidate (Groq, Cerebras, NVIDIA, SambaNova, Gemini, or OpenRouter)
				const candidateHandler = this.buildCandidateHandler(candidateModelId)
				const stream = candidateHandler.createMessage(systemPrompt, messages, metadata)
				const iterator = stream[Symbol.asyncIterator]()

				// Helper to fetch next chunk with timeout watchdog
				const getNextChunk = async (timeoutMs: number): Promise<IteratorResult<ApiStreamChunk>> => {
					let timer: NodeJS.Timeout | undefined
					const timeoutPromise = new Promise<never>((_, reject) => {
						timer = setTimeout(() => {
							reject(
								new Error(
									`Model "${candidateModelId}" stopped responding (${timeoutMs / 1000}s limit exceeded).`,
								),
							)
						}, timeoutMs)
					})
					try {
						return await Promise.race([iterator.next(), timeoutPromise])
					} finally {
						if (timer) clearTimeout(timer)
					}
				}

				const bufferedChunks: ApiStreamChunk[] = []
				let hasSubstantiveContent = false

				while (true) {
					const timeoutMs = !hasSubstantiveContent ? FIRST_CHUNK_TIMEOUT_MS : 35_000
					const result = await getNextChunk(timeoutMs)

					if (result.done) {
						if (!hasSubstantiveContent) {
							throw new Error(
								`Model "${candidateModelId}" returned an empty response (no text or tool calls generated).`,
							)
						}
						// Flush any buffered chunks before completing
						for (const chunk of bufferedChunks) {
							yield chunk
						}
						break
					}

					const chunk = result.value
					if (chunk && "type" in chunk && chunk.type === "error") {
						const errMsg = (chunk as any).message || (chunk as any).error || "Stream returned error"
						throw new Error(`Model "${candidateModelId}" streaming error: ${errMsg}`)
					}

					if (!hasSubstantiveContent) {
						bufferedChunks.push(chunk)
						const isSubstantive =
							(chunk.type === "text" && chunk.text.trim().length > 0) ||
							(chunk.type === "reasoning" && chunk.text.trim().length > 0) ||
							chunk.type.startsWith("tool_call")

						if (isSubstantive) {
							hasSubstantiveContent = true
							firstChunkYielded = true
							this.currentActiveModelId = candidateModelId
							// Flush initial buffered chunks to caller
							for (const bChunk of bufferedChunks) {
								yield bChunk
							}
							bufferedChunks.length = 0
						}
					} else {
						yield chunk
					}
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

				// If we already started streaming real tokens to the user, we cannot cleanly restart
				if (firstChunkYielded) {
					throw err
				}

				// Check for user-initiated abort - do not cooldown or failover
				if (
					err?.name === "AbortError" ||
					err?.message?.includes("Request cancelled by user") ||
					err?.message?.includes("request aborted by user")
				) {
					throw err
				}

				// If error is a deterministic client/format error and not an exhaustion/capacity/timeout/permission issue, rethrow immediately
				if (!isExhaustionError(err)) {
					throw err
				}

				// If failed before first chunk yielded, record failure in circuit breaker
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
					lastError: err?.message || String(err),
				})

				// If this is a provider-wide auth, permission, or entitlement error (e.g. 401 Unauthorized, 403 Forbidden, 410 Gone),
				// also cool down any other models from the same provider prefix to avoid redundant round-trip delays
				const errStatus = err?.status ?? err?.statusCode ?? err?.code ?? err?.error?.code
				const errMsgLower = String(err?.message || "").toLowerCase()
				const isProviderLevelError =
					errStatus === 401 ||
					errStatus === "401" ||
					errStatus === 403 ||
					errStatus === "403" ||
					errStatus === 410 ||
					errStatus === "410" ||
					errMsgLower.includes("410") ||
					errMsgLower.includes("unauthorized") ||
					errMsgLower.includes("invalid api key") ||
					errMsgLower.includes("forbidden") ||
					errMsgLower.includes("permission")

				if (isProviderLevelError) {
					const prefixMatch = candidateModelId.match(/^([a-z0-9_-]+)\//i)
					if (prefixMatch) {
						const providerPrefix = prefixMatch[1]
						for (const candidate of candidatesToTry) {
							if (candidate.startsWith(`${providerPrefix}/`)) {
								modelHealthMap.set(candidate, {
									modelId: candidate,
									isExhausted: true,
									exhaustedUntil,
									failureCount,
									lastError: err?.message || String(err),
								})
							}
						}
					}
				}

				const cooldownMins = Math.round(cooldownMs / 60000)
				const nextCandidate = candidatesToTry[i + 1]

				console.warn(
					`[FreeRouter] Model "${candidateModelId}" failed (${err?.message || err}). ` +
						`Cooling down for ${cooldownMins}m. ` +
						(nextCandidate
							? `Auto-routing to next available free model: "${nextCandidate}"...`
							: "No remaining healthy models in candidate pool."),
				)

				// Continue loop to try next model
				continue
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

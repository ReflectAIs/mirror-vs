/**
 * ComfyUI provider — communicates with a local ComfyUI instance via its REST API
 * and WebSocket for real-time progress.
 *
 * ## Lifecycle
 * ComfyUI is started when any image operation is called (`generate`, `edit`,
 * etc.) and stopped once it completes.  This avoids keeping a background
 * Python process alive when no image generation is in progress.
 *
 * ## API Endpoints used
 * - `POST /prompt`          — queue a workflow
 * - `GET /history/{id}`     — fetch result after completion
 * - `GET /object_info`      — list available model checkpoints
 * - `GET /system_stats`     — health / uptime
 * - `POST /upload/image`    — upload an input image (img2img, inpaint)
 *
 * ## Error Handling
 * Errors from ComfyUI are parsed into structured ComfyUIError instances
 * with categories, codes, and actionable suggestions. The executeWorkflow
 * method returns these as structured fields on ImageResult so the LLM model
 * can understand and respond to errors intelligently.
 * - `WS /ws`                — real-time progress messages
 */
import type { ImageProvider } from "../provider"
import type {
	HealthStatus,
	ModelInfo,
	GenOptions,
	EditOptions,
	InpaintOptions,
	OutpaintOptions,
	UpscaleOptions,
	ImageResult,
	ProgressInfo,
	ProviderCapabilities,
} from "../types"
import { parseComfyUIError, ComfyUIError } from "./comfyui-errors"
import { WorkflowEngine } from "../../../services/image-runtime/workflows/engine"
import { ComfyUIManager } from "../../../services/image-runtime/comfyui-manager"
import { PipelineRegistry } from "../pipeline-registry"
import type { PipelineType } from "../pipeline"
import * as vscode from "vscode"

interface ComfyPromptResponse {
	prompt_id: string
	number: number
	error?: string
}

interface ComfyHistoryItem {
	prompt: Array<[number, any]>
	outputs: Record<string, ComfyOutput>
	status: { status_str: string; completed: boolean; messages: Array<[string, any]> }
}

interface ComfyOutput {
	images?: Array<{ filename: string; subfolder: string; type: string }>
	audio?: Array<{ filename: string; subfolder: string; type: string }>
}

interface ComfyProgressMessage {
	type: "progress"
	data: {
		value: number
		max: number
		step: number
		node: string
		stage?: string
	}
}

export class ComfyUIProvider implements ImageProvider {
	readonly name = "ComfyUI"

	private baseURL: string
	private wsURL: string
	private manager: ComfyUIManager | null
	private currentPromptId: string | null = null
	private progress: ProgressInfo = { state: "idle", progress: 0 }

	// Keep-alive: delayed shutdown timer.  After each operation, ComfyUI stays
	// alive for SHUTDOWN_DELAY_MS so the user can debug.  Repeated operations
	// extend the timer; previous timers are cancelled.
	private static SHUTDOWN_DELAY_MS = 60_000
	private static shutdownTimer: ReturnType<typeof setTimeout> | null = null

	constructor(baseURL: string = "http://127.0.0.1:8188", manager?: ComfyUIManager) {
		this.baseURL = baseURL.replace(/\/+$/, "")
		this.wsURL = this.baseURL.replace(/^http/, "ws")
		this.manager = manager ?? null
	}

	// ------------------------------------------------------------------ Lifecycle

	/**
	 * Ensure ComfyUI is running before an operation.
	 * If the process is already running (health check passes), this is a no-op.
	 * If not, it starts the process and waits up to 30 seconds for it to become healthy.
	 */
	async ensureRunning(): Promise<void> {
		if (!this.manager) {
			// No manager available — assume the user started ComfyUI externally
			return
		}

		// Quick health check first
		const alive = await this.health()
		if (alive.alive) {
			console.log(`[ComfyUIProvider] already running (v${alive.version})`)
			return
		}

		console.log(`[ComfyUIProvider] starting ComfyUI...`)

		try {
			await this.manager.launch()
		} catch (launchError) {
			throw new Error(
				`ComfyUI failed to launch: ${launchError instanceof Error ? launchError.message : String(launchError)}`,
			)
		}

		// Wait for health check to pass (up to 30s)
		for (let i = 0; i < 30; i++) {
			await new Promise((r) => setTimeout(r, 1000))
			const h = await this.health()
			if (h.alive) {
				console.log(`[ComfyUIProvider] ComfyUI started successfully`)
				return
			}
		}

		throw new Error("ComfyUI failed to become healthy within 30 seconds")
	}

	/**
	 * Shut down the ComfyUI process immediately.
	 */
	async shutdown(): Promise<void> {
		// Cancel any scheduled keep-alive shutdown first
		ComfyUIProvider.cancelScheduledShutdown()
		if (!this.manager) return
		console.log(`[ComfyUIProvider] shutting down ComfyUI...`)
		await this.manager.stop()
	}

	/**
	 * Cancel a previously scheduled keep-alive shutdown (if any).
	 */
	private static cancelScheduledShutdown(): void {
		if (ComfyUIProvider.shutdownTimer) {
			clearTimeout(ComfyUIProvider.shutdownTimer)
			ComfyUIProvider.shutdownTimer = null
			console.log(`[ComfyUIProvider] cancelled scheduled shutdown`)
		}
	}

	/**
	 * Schedule a delayed shutdown so the ComfyUI process stays alive for
	 * {@link SHUTDOWN_DELAY_MS} (60 s) after the most recent operation.
	 * Calling this again extends the timer and kills the previous one.
	 */
	private static scheduleShutdown(provider: ComfyUIProvider): void {
		ComfyUIProvider.cancelScheduledShutdown()
		ComfyUIProvider.shutdownTimer = setTimeout(async () => {
			console.log(`[ComfyUIProvider] keep-alive timer expired, shutting down`)
			await provider.shutdown()
			ComfyUIProvider.shutdownTimer = null
		}, ComfyUIProvider.SHUTDOWN_DELAY_MS)
		console.log(`[ComfyUIProvider] scheduled shutdown in ${ComfyUIProvider.SHUTDOWN_DELAY_MS / 1000}s`)
	}

	/**
	 * Execute an operation with lifecycle management.
	 * Starts ComfyUI, runs the operation, then keeps ComfyUI alive for
	 * {@link SHUTDOWN_DELAY_MS} (60 s) so the user can debug.
	 * Repeated operations extend the timer; previous timers are cancelled.
	 *
	 * Call `shutdown()` directly to stop immediately.
	 *
	 * The SIGTERM emitted by `shutdown()` is intentionally suppressed in
	 * runtime-manager.ts (exits via signal are not treated as errors since
	 * `code` is `null`, not `0`).
	 */
	private async withLifecycle<T>(fn: () => Promise<T>): Promise<T> {
		// Cancel any pending keep-alive shutdown before starting a new operation
		ComfyUIProvider.cancelScheduledShutdown()
		await this.ensureRunning()
		try {
			return await fn()
		} finally {
			// Don't shut down immediately — schedule a delayed keep-alive shutdown
			ComfyUIProvider.scheduleShutdown(this)
		}
	}

	// ------------------------------------------------------------------ Lifecycle

	async health(): Promise<HealthStatus> {
		try {
			// Try /system_stats first (ComfyUI >= ~v0.2.0) — it returns
			// version and uptime metadata alongside confirming the server
			// is alive.
			const res = await fetch(`${this.baseURL}/system_stats`)
			if (res.ok) {
				const data = await res.json()
				return {
					alive: true,
					version: data?.system?.comfyui_version ?? "unknown",
					uptime: data?.system?.uptime ?? 0,
				}
			}

			// Fall back to /object_info for older ComfyUI builds that
			// don't ship the /system_stats endpoint (HTTP 404).
			if (res.status === 404) {
				const fallbackRes = await fetch(`${this.baseURL}/object_info`)
				if (fallbackRes.ok) {
					return {
						alive: true,
						version: "unknown",
						uptime: 0,
					}
				}
				return { alive: false, message: `HTTP ${fallbackRes.status}` }
			}

			return { alive: false, message: `HTTP ${res.status}` }
		} catch (err: any) {
			return { alive: false, message: err.message }
		}
	}

	async listModels(): Promise<ModelInfo[]> {
		try {
			const res = await fetch(`${this.baseURL}/object_info`)
			if (!res.ok) return []
			const data = await res.json()

			// CheckpointLoaderSimple → list of checkpoint names
			const checkpointNode =
				data?.["CheckpointLoaderSimple"] ?? data?.["checkpoints"] ?? data?.["CheckpointLoader"]
			if (checkpointNode?.input?.required?.ckpt_name?.[0]?.length) {
				return checkpointNode.input.required.ckpt_name[0].map((name: string) => ({
					id: name,
					name,
					provider: "comfyui",
					installed: true,
					supportedFeatures: ["txt2img", "img2img"],
				}))
			}
			return []
		} catch {
			return []
		}
	}

	// ------------------------------------------------------------------
	// Pipeline resolution
	// ------------------------------------------------------------------

	/**
	 * Resolve the workflow for a given operation type.
	 *
	 * If `options.pipeline` is set, it is used directly (user override).
	 * Otherwise, the PipelineRegistry auto-selects based on the prompt.
	 *
	 * The workflow is normalized (legacy array → object format) before
	 * returning, so injectors can work uniformly.
	 */
	private async resolveWorkflow(
		type: PipelineType,
		prompt: string,
		options?: {
			pipeline?: string
			model?: string
			allowlists?: import("../../../shared/allowlists").PipelineAllowlists
		},
	): Promise<any> {
		// Lazy-init the PipelineRegistry if needed
		if (!PipelineRegistry.isInitialized()) {
			const cwd = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath
			await PipelineRegistry.initialize(cwd)
		}

		let def
		if (options?.pipeline) {
			console.log(`[ComfyUIProvider] resolveWorkflow: using user-specified pipeline="${options.pipeline}"`)
			// User-specified pipeline override
			def = PipelineRegistry.resolve(options.pipeline, type)
		} else {
			// Auto-select based on task description (and model name, so turbo models
			// like sd_xl_turbo automatically select the compatible flash pipeline)
			// Apply allowlists if provided
			console.log(
				`[ComfyUIProvider] resolveWorkflow: auto-selecting pipeline for type="${type}", model="${options?.model}"`,
			)
			def = PipelineRegistry.autoSelect(prompt, type, options?.model, options?.allowlists)
		}
		console.log(
			`[ComfyUIProvider] resolveWorkflow: selected pipeline slug="${def.slug}", name="${def.name}", type="${def.type}"`,
		)
		const normalized = WorkflowEngine.normalizeWorkflow(JSON.parse(JSON.stringify(def.workflow)))
		console.log(
			`[ComfyUIProvider] resolveWorkflow: normalized workflow keys count: ${Object.keys(normalized).length}`,
		)
		return normalized
	}

	// ------------------------------------------------------------------ Image ops

	async generate(prompt: string, options: GenOptions): Promise<ImageResult> {
		return this.withLifecycle(async () => {
			console.log(
				`[ComfyUIProvider] generate() called — prompt="${prompt.slice(0, 100)}", pipeline=${options.pipeline}, model=${options.model}`,
			)
			const workflow = await this.resolveWorkflow("generate", prompt, {
				pipeline: options.pipeline,
				model: options.model,
			})
			WorkflowEngine.injectPrompt(workflow, prompt)
			WorkflowEngine.injectModel(workflow, options.model)

			// Seed: use the provided one or generate a random one
			const seed = options.seed ?? Math.floor(Math.random() * 2 ** 32)
			WorkflowEngine.injectSeed(workflow, seed)

			if (options.width && options.height)
				WorkflowEngine.injectDimensions(workflow, options.width, options.height)

			// Negative prompt: always inject — append default negative prompt inside the engine
			WorkflowEngine.injectNegativePrompt(workflow, options.negativePrompt ?? "")

			// Sampler parameters
			if (options.samplerName) WorkflowEngine.injectSampler(workflow, options.samplerName)
			if (options.scheduler) WorkflowEngine.injectScheduler(workflow, options.scheduler)
			if (options.cfgScale !== undefined) WorkflowEngine.injectCFG(workflow, options.cfgScale)
			if (options.steps !== undefined) WorkflowEngine.injectSteps(workflow, options.steps)

			return this.executeWorkflow(workflow, options.onProgress)
		})
	}

	async edit(prompt: string, inputImage: string, options?: EditOptions): Promise<ImageResult> {
		return this.withLifecycle(async () => {
			const imageName = await this.uploadImage(inputImage)
			const workflow = await this.resolveWorkflow("edit", prompt, {
				pipeline: options?.pipeline,
				model: options?.model,
			})
			WorkflowEngine.injectPrompt(workflow, prompt)
			WorkflowEngine.injectModel(workflow, options?.model || "sd_xl_turbo")
			WorkflowEngine.injectImage(workflow, imageName)
			if (options?.seed !== undefined) WorkflowEngine.injectSeed(workflow, options.seed)
			if (options?.width && options?.height)
				WorkflowEngine.injectDimensions(workflow, options.width, options.height)

			return this.executeWorkflow(workflow, options?.onProgress)
		})
	}

	async inpaint(prompt: string, maskImage: string, options?: InpaintOptions): Promise<ImageResult> {
		return this.withLifecycle(async () => {
			const maskName = await this.uploadImage(maskImage)
			const workflow = await this.resolveWorkflow("inpaint", prompt, {
				pipeline: options?.pipeline,
				model: options?.model,
			})
			WorkflowEngine.injectPrompt(workflow, prompt)
			WorkflowEngine.injectModel(workflow, options?.model || "sd_xl_turbo")
			WorkflowEngine.injectMask(workflow, maskName)
			if (options?.seed !== undefined) WorkflowEngine.injectSeed(workflow, options.seed)

			return this.executeWorkflow(workflow, options?.onProgress)
		})
	}

	async outpaint(prompt: string, inputImage: string, options?: OutpaintOptions): Promise<ImageResult> {
		return this.withLifecycle(async () => {
			const imageName = await this.uploadImage(inputImage)
			const workflow = await this.resolveWorkflow("outpaint", prompt, {
				pipeline: options?.pipeline,
				model: options?.model,
			})
			WorkflowEngine.injectPrompt(workflow, prompt)
			WorkflowEngine.injectImage(workflow, imageName)

			return this.executeWorkflow(workflow, options?.onProgress)
		})
	}

	async upscale(image: string, options?: UpscaleOptions): Promise<ImageResult> {
		return this.withLifecycle(async () => {
			const imageName = await this.uploadImage(image)
			const workflow = await this.resolveWorkflow("upscale", "", {
				pipeline: options?.pipeline,
				model: options?.model,
			})
			WorkflowEngine.injectImage(workflow, imageName)
			if (options?.scaleFactor) {
				WorkflowEngine.injectUpscaleFactor(workflow, options.scaleFactor)
			}

			return this.executeWorkflow(workflow, undefined)
		})
	}

	async removeBackground(image: string): Promise<ImageResult> {
		return this.withLifecycle(async () => {
			const imageName = await this.uploadImage(image)
			const workflow = await this.resolveWorkflow("remove-bg", "", {})
			WorkflowEngine.injectImage(workflow, imageName)

			return this.executeWorkflow(workflow, undefined)
		})
	}

	// ------------------------------------------------------------------ Control

	async interrupt(): Promise<void> {
		if (this.currentPromptId) {
			try {
				await fetch(`${this.baseURL}/interrupt`, { method: "POST" })
			} catch {
				// Best-effort
			}
			this.currentPromptId = null
			this.progress = { state: "idle", progress: 0 }
		}
	}

	async getProgress(): Promise<ProgressInfo> {
		return this.progress
	}

	getCapabilities(): ProviderCapabilities {
		return {
			canGenerate: true,
			canEdit: true,
			canInpaint: true,
			canOutpaint: true,
			canUpscale: true,
			canRemoveBackground: true,
			supportsControlNet: true,
			supportsIPAdapter: true,
			supportsLoRA: true,
			supportsVideo: false,
		}
	}

	// ------------------------------------------------------------------ Private

	private async executeWorkflow(workflow: any, onProgress?: (p: ProgressInfo) => void): Promise<ImageResult> {
		const startTime = Date.now()
		this.progress = { state: "preparing", progress: 0 }
		onProgress?.(this.progress)

		// Debug: log the full workflow JSON so the user can inspect what's being sent
		const bodyStr = JSON.stringify({ prompt: workflow })
		console.log(`[ComfyUIProvider] executeWorkflow — POST /prompt body (${bodyStr.length} chars)`)
		console.log(`[ComfyUIProvider] WORKFLOW JSON:\n${JSON.stringify(workflow, null, 2)}`)

		try {
			const res = await fetch(`${this.baseURL}/prompt`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: bodyStr,
			})

			if (!res.ok) {
				const text = await res.text()
				// Parse the error into structured fields so the LLM can understand it
				const parsed = parseComfyUIError(text, res.status)
				return {
					success: false,
					error: parsed.message,
					errorCode: parsed.code,
					errorCategory: parsed.category,
					errorSuggestion: parsed.suggestion,
					errorNodeId: parsed.nodeId,
				}
			}

			const data: ComfyPromptResponse = await res.json()
			if (data.error) {
				const errorStr = typeof data.error === "string" ? data.error : JSON.stringify(data.error)
				const parsed = parseComfyUIError(errorStr)
				return {
					success: false,
					error: parsed.message,
					errorCode: parsed.code,
					errorCategory: parsed.category,
					errorSuggestion: parsed.suggestion,
					errorNodeId: parsed.nodeId,
				}
			}

			this.currentPromptId = data.prompt_id
			this.progress = { state: "running", progress: 10 }
			onProgress?.(this.progress)

			// Poll for completion AND fetch the result in a single loop.
			// WS is used only for progress reporting — completion is detected
			// via polling /history. A single loop avoids the race condition
			// where listenForProgress finished (WS error/close) before ComfyUI
			// completed, causing fetchResult to start too early.
			const result = await this.pollForResult(data.prompt_id, onProgress)
			const elapsed = Date.now() - startTime

			if (!result) {
				const parsed = parseComfyUIError("No result received from ComfyUI")
				return {
					success: false,
					error: parsed.message,
					errorCode: parsed.code,
					errorCategory: parsed.category,
					errorSuggestion: parsed.suggestion,
				}
			}

			this.progress = { state: "completed", progress: 100 }
			this.currentPromptId = null

			return {
				success: true,
				imageData: result,
				imageFormat: "png",
				executionTimeMs: elapsed,
			}
		} catch (err: any) {
			this.progress = { state: "failed", progress: 0 }
			this.currentPromptId = null

			// If it's already a ComfyUIError (thrown from pollForResult), use its structured details
			if (err instanceof ComfyUIError) {
				return {
					success: false,
					error: err.details.message,
					errorCode: err.details.code,
					errorCategory: err.details.category,
					errorSuggestion: err.details.suggestion,
					errorNodeId: err.details.nodeId,
				}
			}

			// Generic catch-all — parse the raw message
			const parsed = parseComfyUIError(err.message ?? String(err))
			return {
				success: false,
				error: parsed.message,
				errorCode: parsed.code,
				errorCategory: parsed.category,
				errorSuggestion: parsed.suggestion,
			}
		}
	}

	/**
	 * Single polling loop that:
	 * 1. Opens a WebSocket for real-time progress updates (relayed via onProgress)
	 * 2. Polls /history/{promptId} every 2s for completion
	 * 3. When completed, fetches the output image and returns it as a base64 data URL
	 *
	 * This merges the old listenForProgress + fetchResult into one method
	 * to avoid the race condition where WS error/close triggers result-fetching
	 * before ComfyUI has finished saving the output.
	 */
	private async pollForResult(promptId: string, onProgress?: (p: ProgressInfo) => void): Promise<string | null> {
		// Open WebSocket for progress (non-blocking — errors/closes are ignored)
		try {
			const ws = new WebSocket(`${this.wsURL}/ws`)
			ws.onmessage = (event: MessageEvent) => {
				try {
					const msg: ComfyProgressMessage = JSON.parse(event.data as string)
					if (msg.type === "progress") {
						const { value, max } = msg.data
						const pct = Math.min(90, Math.round((value / max) * 90))
						this.progress = {
							state: "running",
							progress: pct,
							stage: msg.data.stage,
							value,
							max,
						}
						onProgress?.(this.progress)
					}
				} catch {
					// non-JSON message, ignore
				}
			}
			ws.onerror = () => {
				/* WS error is not fatal — polling continues */
			}
			ws.onclose = () => {
				/* WS close is not fatal — polling continues */
			}
		} catch {
			// WebSocket not available — polling still works
		}

		// Single polling loop: check /history for completion, then fetch the image
		// Total budget: 120 attempts × 2s = 240s (4 minutes)
		const MAX_ATTEMPTS = 120
		for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
			await new Promise((r) => setTimeout(r, 2000))

			// Report intermediate progress from the polling loop every 5 attempts (10s),
			// so the user sees progress advancing even when the WebSocket doesn't send events.
			// Progress ranges from 10 → 85 (%); the final 15% is reserved for image fetch.
			if (attempt % 5 === 0 && attempt > 0) {
				const pct = Math.min(85, 10 + Math.round((attempt / MAX_ATTEMPTS) * 75))
				this.progress = {
					state: "running",
					progress: pct,
					stage: `waiting (attempt ${attempt}/${MAX_ATTEMPTS})`,
					value: attempt,
					max: MAX_ATTEMPTS,
				}
				onProgress?.(this.progress)
			}

			try {
				const res = await fetch(`${this.baseURL}/history/${promptId}`)
				if (!res.ok) continue

				const history: Record<string, ComfyHistoryItem> = await res.json()
				const item = history[promptId]
				if (!item?.status?.completed) continue

				// Check for error status — ComfyUI may report errors via status_str or
				// messages array even when completed is true.
				if (item?.status?.status_str === "error") {
					const errorMsg = item.status.messages?.find((m: [string, any]) => m[0] === "error")?.[1]
					const rawError = errorMsg ? String(errorMsg) : "ComfyUI execution error"
					// Try to extract node information from error messages
					const nodeMatch = typeof errorMsg === "string" ? errorMsg.match(/Node\s+#?(\d+)/i) : null
					const parsed = parseComfyUIError(rawError, undefined, {
						nodeId: nodeMatch?.[1],
						nodeClassType: "unknown",
					})
					throw new ComfyUIError({
						...parsed,
						message: rawError,
					})
				}
				// Also check the messages array for execution errors (some ComfyUI versions
				// report errors in messages without setting status_str)
				const errorMessage = item?.status?.messages?.find(
					(m: [string, any]) => m[0] === "error" || m[0] === "execution_error",
				)
				if (errorMessage) {
					const rawError = String(errorMessage[1] ?? "ComfyUI execution error")
					const parsed = parseComfyUIError(rawError)
					throw new ComfyUIError({
						...parsed,
						message: rawError,
					})
				}

				// Report that we found completion and are fetching the image
				this.progress = { state: "running", progress: 90, stage: "fetching result" }
				onProgress?.(this.progress)

				// Find the first image or audio output
				for (const nodeId of Object.keys(item.outputs)) {
					const output = item.outputs[nodeId]

					// Check for image outputs
					if (output.images && output.images.length > 0) {
						const img = output.images[0]
						const imgRes = await fetch(
							`${this.baseURL}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${encodeURIComponent(img.type)}`,
						)
						if (imgRes.ok) {
							const blob = await imgRes.arrayBuffer()
							const base64 = Buffer.from(blob).toString("base64")

							this.progress = { state: "running", progress: 95, stage: "decoding result" }
							onProgress?.(this.progress)

							return `data:image/${img.filename.endsWith(".png") ? "png" : "jpeg"};base64,${base64}`
						}
					}

					// Check for audio outputs (e.g. from SaveAudio node)
					if (output.audio && output.audio.length > 0) {
						const aud = output.audio[0]
						const audRes = await fetch(
							`${this.baseURL}/view?filename=${encodeURIComponent(aud.filename)}&subfolder=${encodeURIComponent(aud.subfolder)}&type=${encodeURIComponent(aud.type)}`,
						)
						if (audRes.ok) {
							const blob = await audRes.arrayBuffer()
							const base64 = Buffer.from(blob).toString("base64")

							this.progress = { state: "running", progress: 95, stage: "decoding result" }
							onProgress?.(this.progress)

							// Determine MIME type from the audio filename extension
							const ext = aud.filename.split(".").pop()?.toLowerCase() || "wav"
							return `data:audio/${ext};base64,${base64}`
						}
					}
				}
				// Completed but no image or audio outputs found
				return null
			} catch {
				// network hiccup, retry
				continue
			}
		}
		return null
	}

	private async uploadImage(dataUrl: string): Promise<string> {
		// data:image/png;base64,...
		const match = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/)
		if (!match) throw new Error("Invalid data URL format")

		const ext = match[1] === "jpeg" ? "jpg" : match[1]
		const base64Data = match[2]
		const buffer = Buffer.from(base64Data, "base64")
		const filename = `mirror_input_${Date.now()}.${ext}`

		// Use ComfyUI's upload API (multipart form)
		const formData = new FormData()
		formData.append("image", new Blob([buffer], { type: `image/${ext}` }), filename)
		formData.append("type", "input")
		formData.append("overwrite", "true")

		const res = await fetch(`${this.baseURL}/upload/image`, {
			method: "POST",
			body: formData,
		})

		if (!res.ok) {
			throw new Error(`Failed to upload image to ComfyUI: ${res.statusText}`)
		}

		return filename
	}
}

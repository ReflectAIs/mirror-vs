/**
 * Comfy Cloud provider — communicates with the Comfy Cloud API
 * (cloud.comfy.org) as a headless replacement for local ComfyUI.
 *
 * Unlike the local ComfyUIProvider, this provider:
 *   - Does NOT manage a local process lifecycle (no `withLifecycle`)
 *   - Reuses WorkflowEngine for workflow injection (same workflows)
 *   - Posts workflows to cloud.comfy.org/api/prompt instead of localhost:8188
 *   - Polls /api/history/{promptId} for completion (no WebSocket)
 *
 * ## API Endpoints used
 * - `POST /api/prompt`            — queue a workflow
 * - `GET /api/history/{id}`       — fetch result after completion
 *
 * ## Error Handling
 * Returns structured ImageResult errors on API failures or timeouts.
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
import { WorkflowEngine } from "../../../services/image-runtime/workflows/engine"
import { PipelineRegistry } from "../pipeline-registry"
import { ComfyCloudRuntime } from "../../../services/generation-runtime/ComfyCloudRuntime"
import type { PipelineType } from "../pipeline"
import * as vscode from "vscode"

const DEFAULT_BASE_URL = "https://cloud.comfy.org"

export class ComfyCloudProvider implements ImageProvider {
	readonly name = "Comfy Cloud"

	private context: vscode.ExtensionContext
	private baseURL: string
	private currentPromptId: string | null = null
	private progress: ProgressInfo = { state: "idle", progress: 0 }

	constructor(context: vscode.ExtensionContext, baseURL: string = DEFAULT_BASE_URL) {
		this.context = context
		this.baseURL = baseURL.replace(/\/+$/, "")
	}

	async health(): Promise<HealthStatus> {
		const result = await ComfyCloudRuntime.validateConfiguration(this.context)
		return { alive: result.valid, message: result.message }
	}

	async listModels(): Promise<ModelInfo[]> {
		// Comfy Cloud manages models server-side — return a placeholder
		return [{ id: "comfy-cloud/default", name: "Comfy Cloud (managed)", provider: "comfy_cloud", installed: true }]
	}

	// ------------------------------------------------------------------
	// Pipeline resolution
	// ------------------------------------------------------------------

	/**
	 * Resolve the workflow for a given operation type.
	 * Delegates to PipelineRegistry just like ComfyUIProvider does.
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
		if (!PipelineRegistry.isInitialized()) {
			const cwd = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath
			await PipelineRegistry.initialize(cwd)
		}

		let def
		if (options?.pipeline) {
			def = PipelineRegistry.resolve(options.pipeline, type)
		} else {
			// Apply allowlists if provided
			def = PipelineRegistry.autoSelect(prompt, type, options?.model, options?.allowlists)
		}
		return WorkflowEngine.normalizeWorkflow(JSON.parse(JSON.stringify(def.workflow)))
	}

	// ------------------------------------------------------------------
	// Image ops
	// ------------------------------------------------------------------

	async generate(prompt: string, options: GenOptions): Promise<ImageResult> {
		try {
			const workflow = await this.resolveWorkflow("generate", prompt, {
				pipeline: options.pipeline,
				model: options.model,
			})
			WorkflowEngine.injectPrompt(workflow, prompt)
			WorkflowEngine.injectModel(workflow, options.model)

			const seed = options.seed ?? Math.floor(Math.random() * 2 ** 32)
			WorkflowEngine.injectSeed(workflow, seed)

			if (options.width && options.height)
				WorkflowEngine.injectDimensions(workflow, options.width, options.height)
			WorkflowEngine.injectNegativePrompt(workflow, options.negativePrompt ?? "")

			if (options.samplerName) WorkflowEngine.injectSampler(workflow, options.samplerName)
			if (options.scheduler) WorkflowEngine.injectScheduler(workflow, options.scheduler)
			if (options.cfgScale !== undefined) WorkflowEngine.injectCFG(workflow, options.cfgScale)
			if (options.steps !== undefined) WorkflowEngine.injectSteps(workflow, options.steps)

			return this.executeWorkflow(workflow, options.onProgress)
		} catch (error: any) {
			return { success: false, error: error.message || "Comfy Cloud generation failed." }
		}
	}

	async edit(prompt: string, inputImage: string, options?: EditOptions): Promise<ImageResult> {
		try {
			const workflow = await this.resolveWorkflow("edit", prompt, {
				pipeline: options?.pipeline,
				model: options?.model,
			})
			WorkflowEngine.injectPrompt(workflow, prompt)
			WorkflowEngine.injectModel(workflow, options?.model || "sd_xl_turbo")
			WorkflowEngine.injectImage(workflow, inputImage)
			if (options?.seed !== undefined) WorkflowEngine.injectSeed(workflow, options.seed)
			if (options?.width && options?.height)
				WorkflowEngine.injectDimensions(workflow, options.width, options.height)

			return this.executeWorkflow(workflow, options?.onProgress)
		} catch (error: any) {
			return { success: false, error: error.message || "Comfy Cloud edit failed." }
		}
	}

	async inpaint(prompt: string, maskImage: string, options?: InpaintOptions): Promise<ImageResult> {
		try {
			const workflow = await this.resolveWorkflow("inpaint", prompt, {
				pipeline: options?.pipeline,
				model: options?.model,
			})
			WorkflowEngine.injectPrompt(workflow, prompt)
			WorkflowEngine.injectModel(workflow, options?.model || "sd_xl_turbo")
			WorkflowEngine.injectMask(workflow, maskImage)
			if (options?.seed !== undefined) WorkflowEngine.injectSeed(workflow, options.seed)

			return this.executeWorkflow(workflow, options?.onProgress)
		} catch (error: any) {
			return { success: false, error: error.message || "Comfy Cloud inpaint failed." }
		}
	}

	async outpaint(prompt: string, inputImage: string, options?: OutpaintOptions): Promise<ImageResult> {
		try {
			const workflow = await this.resolveWorkflow("outpaint", prompt, {
				pipeline: options?.pipeline,
				model: options?.model,
			})
			WorkflowEngine.injectPrompt(workflow, prompt)
			WorkflowEngine.injectImage(workflow, inputImage)

			return this.executeWorkflow(workflow, options?.onProgress)
		} catch (error: any) {
			return { success: false, error: error.message || "Comfy Cloud outpaint failed." }
		}
	}

	async upscale(image: string, options?: UpscaleOptions): Promise<ImageResult> {
		try {
			const workflow = await this.resolveWorkflow("upscale", "", {
				pipeline: options?.pipeline,
				model: options?.model,
			})
			WorkflowEngine.injectImage(workflow, image)
			if (options?.scaleFactor) {
				WorkflowEngine.injectUpscaleFactor(workflow, options.scaleFactor)
			}

			return this.executeWorkflow(workflow, undefined)
		} catch (error: any) {
			return { success: false, error: error.message || "Comfy Cloud upscale failed." }
		}
	}

	async removeBackground(image: string): Promise<ImageResult> {
		try {
			const workflow = await this.resolveWorkflow("remove-bg", "", {})
			WorkflowEngine.injectImage(workflow, image)

			return this.executeWorkflow(workflow, undefined)
		} catch (error: any) {
			return { success: false, error: error.message || "Comfy Cloud remove background failed." }
		}
	}

	// ------------------------------------------------------------------
	// Control
	// ------------------------------------------------------------------

	async interrupt(): Promise<void> {
		this.currentPromptId = null
		this.progress = { state: "idle", progress: 0 }
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
			supportsControlNet: false,
			supportsIPAdapter: false,
			supportsLoRA: false,
			supportsVideo: true,
		}
	}

	// ------------------------------------------------------------------
	// Private
	// ------------------------------------------------------------------

	/**
	 * Submit the workflow to Comfy Cloud and wait for results.
	 */
	private async executeWorkflow(workflow: any, _onProgress?: (p: ProgressInfo) => void): Promise<ImageResult> {
		this.progress = { state: "running", progress: 10 }

		const result = await ComfyCloudRuntime.executeGeneration(this.context, { workflow })

		if (!result.success) {
			this.progress = { state: "failed", progress: 0 }
			return { success: false, error: result.error || "Comfy Cloud execution failed." }
		}

		this.progress = { state: "completed", progress: 100 }

		// Return the first output URL as base64 imageData
		const outputUrl = result.outputs?.[0]
		if (!outputUrl) {
			return { success: false, error: "Comfy Cloud returned no output files." }
		}

		return { success: true, imageData: outputUrl }
	}
}

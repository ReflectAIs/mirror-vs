/**
 * Atlas Cloud provider — wraps the Atlas Cloud runtime into the standard
 * ImageProvider interface.
 *
 * Atlas Cloud is an OpenAI-compatible unified multi-modal aggregator.
 * It provides a simplified cloud fallback for developers who prefer
 * drop-in enterprise endpoints without direct node graph injection.
 *
 * This provider:
 *   - Uses AtlasCloudRuntime for HTTP dispatch
 *   - Maps operations (generate, edit, etc.) to Atlas Cloud model calls
 *   - Returns ImageResult with output URLs
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
import { AtlasCloudRuntime } from "../../../services/generation-runtime/AtlasCloudRuntime"
import * as vscode from "vscode"

export class AtlasCloudProvider implements ImageProvider {
	readonly name = "Atlas Cloud"

	private context: vscode.ExtensionContext

	constructor(context: vscode.ExtensionContext) {
		this.context = context
	}

	async health(): Promise<HealthStatus> {
		const result = await AtlasCloudRuntime.validateConfiguration(this.context)
		return { alive: result.valid, message: result.message }
	}

	async listModels(): Promise<ModelInfo[]> {
		return [
			{ id: "atlas-cloud/default", name: "Atlas Cloud (aggregator)", provider: "atlas_cloud", installed: true },
		]
	}

	async generate(prompt: string, options: GenOptions): Promise<ImageResult> {
		const result = await AtlasCloudRuntime.executeGeneration(this.context, options.model || "atlas-cloud/default", {
			type: "image",
			prompt,
			model: options.model,
			negativePrompt: options.negativePrompt,
			aspectRatio: options.width && options.height ? `${options.width}:${options.height}` : undefined,
		})

		if (!result.success) {
			return { success: false, error: result.error || "Atlas Cloud generation failed." }
		}

		return { success: true, imageData: result.url }
	}

	async edit(prompt: string, inputImage: string, options?: EditOptions): Promise<ImageResult> {
		const result = await AtlasCloudRuntime.executeGeneration(
			this.context,
			options?.model || "atlas-cloud/default",
			{
				type: "image",
				prompt,
				model: options?.model,
				negativePrompt: options?.negativePrompt,
			},
		)

		if (!result.success) {
			return { success: false, error: result.error || "Atlas Cloud edit failed." }
		}

		return { success: true, imageData: result.url }
	}

	async inpaint(prompt: string, _maskImage: string, options?: InpaintOptions): Promise<ImageResult> {
		const result = await AtlasCloudRuntime.executeGeneration(
			this.context,
			options?.model || "atlas-cloud/default",
			{
				type: "image",
				prompt,
				model: options?.model,
			},
		)

		if (!result.success) {
			return { success: false, error: result.error || "Atlas Cloud inpaint failed." }
		}

		return { success: true, imageData: result.url }
	}

	async outpaint(_prompt: string, _inputImage: string, _options?: OutpaintOptions): Promise<ImageResult> {
		return { success: false, error: "Outpainting is not supported by Atlas Cloud." }
	}

	async upscale(_image: string, _options?: UpscaleOptions): Promise<ImageResult> {
		return { success: false, error: "Upscaling is not supported by Atlas Cloud." }
	}

	async removeBackground(_image: string): Promise<ImageResult> {
		return { success: false, error: "Background removal is not supported by Atlas Cloud." }
	}

	async interrupt(): Promise<void> {
		// Atlas Cloud API calls are short-lived; no cancel endpoint used.
	}

	async getProgress(): Promise<ProgressInfo> {
		return { state: "idle", progress: 0 }
	}

	getCapabilities(): ProviderCapabilities {
		return {
			canGenerate: true,
			canEdit: true,
			canInpaint: true,
			canOutpaint: false,
			canUpscale: false,
			canRemoveBackground: false,
			supportsControlNet: false,
			supportsIPAdapter: false,
			supportsLoRA: false,
			supportsVideo: false,
		}
	}
}

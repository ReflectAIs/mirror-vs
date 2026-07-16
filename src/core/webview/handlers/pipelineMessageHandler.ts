/**
 * pipelineMessageHandler.ts — Webview message handlers for pipeline management.
 *
 * These handlers allow the webview UI to:
 *  - Request the list of all discovered pipelines
 *  - Import a new pipeline from JSON content
 *  - Delete a user-added pipeline
 *  - Set the default pipeline for a given type
 *  - Set the ComfyUI default pipeline for a specific type (persisted to global state)
 *  - Request hardware profiling
 *  - Save HuggingFace / OpenRouter tokens to SecretStorage
 *  - Batch-save sanitized settings (tokens stripped) to global state
 *  - Request/update pipeline allowlists
 *  - Scan ComfyUI user workflows for import
 *  - Import selected ComfyUI workflows as pipelines
 */
import * as path from "path"
import * as fsp from "fs/promises"
import type { MirrorProvider } from "../MirrorProvider"
import type { WebviewMessage, MirrorVSSettings } from "@mirror-vs/types"
import { PipelineRegistry } from "../../../api/image/pipeline-registry"
import type { PipelineType } from "../../../api/image/pipeline"
import { getCurrentCwd } from "./_helpers"
import { HardwareDetector } from "../../../services/image-runtime/hardware-detector"
import { WorkflowScanner } from "../../../services/image-runtime/workflow-scanner"
import { getDefaultComfyUIPath } from "../../../services/image-runtime/platform"

/**
 * Handle a "requestPipelines" message.
 * Returns the full list of discovered pipelines to the webview.
 */
export async function handleRequestPipelines(provider: MirrorProvider): Promise<void> {
	try {
		if (!PipelineRegistry.isInitialized()) {
			const cwd = getCurrentCwd(provider)
			await PipelineRegistry.initialize(cwd)
		}

		// Always restore persisted defaults (user defaults, hidden pipelines)
		// on every request, so that changes made in settings are reflected
		// even if the registry was already initialized.
		const values = provider.contextProxy.getValues()
		PipelineRegistry.restorePersistedDefaults(values.comfyuiDefaultPipelines ?? {}, values.hiddenPipelines ?? [])

		const pipelines = PipelineRegistry.listAll()
		await provider.postMessageToWebview({
			type: "pipelines",
			pipelines: pipelines.map((p) => ({
				slug: p.slug,
				name: p.name,
				description: p.description,
				type: p.type,
				tags: p.tags,
				source: p.source,
				isDefault: p.isDefault,
				hidden: PipelineRegistry.isHidden(p.slug),
			})),
		})
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error)
		provider.log(`[pipelineMessageHandler] Error listing pipelines: ${errorMessage}`)
		await provider.postMessageToWebview({
			type: "pipelines",
			pipelines: [],
			error: errorMessage,
		})
	}
}

/**
 * Handle an "importPipeline" message.
 * Validates and imports a pipeline from raw JSON content.
 */
export async function handleImportPipeline(provider: MirrorProvider, message: WebviewMessage): Promise<void> {
	try {
		const jsonContent = message.text
		if (!jsonContent) {
			await provider.postMessageToWebview({
				type: "importPipelineResult",
				success: false,
				error: "No JSON content provided",
			})
			return
		}

		const cwd = getCurrentCwd(provider)
		if (!PipelineRegistry.isInitialized()) {
			await PipelineRegistry.initialize(cwd)
		}

		const slug = await PipelineRegistry.importPipeline(jsonContent, cwd)
		await provider.postMessageToWebview({
			type: "importPipelineResult",
			success: true,
			slug,
		})
		// Refresh the pipeline list in the UI
		await handleRequestPipelines(provider)
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error)
		provider.log(`[pipelineMessageHandler] Error importing pipeline: ${errorMessage}`)
		await provider.postMessageToWebview({
			type: "importPipelineResult",
			success: false,
			error: errorMessage,
		})
	}
}

/**
 * Handle a "deletePipeline" message.
 * Deletes a user-added pipeline by slug.
 */
/**
 * Handle a "hidePipeline" message.
 * Soft-deletes a pipeline (hides it from UI and auto-selection).
 * Built-in pipelines that can't be physically deleted use this instead.
 * The preference is persisted in global state so it survives restarts.
 */
export async function handleHidePipeline(provider: MirrorProvider, message: WebviewMessage): Promise<void> {
	try {
		const slug = message.text
		if (!slug) {
			await provider.postMessageToWebview({
				type: "hidePipelineResult",
				success: false,
				error: "No pipeline slug provided",
			})
			return
		}

		PipelineRegistry.hidePipeline(slug)

		// Persist hidden pipelines to global state
		const currentHidden = provider.contextProxy.getValues().hiddenPipelines ?? []
		if (!currentHidden.includes(slug)) {
			await provider.contextProxy.setValue("hiddenPipelines", [...currentHidden, slug])
		}

		await provider.postMessageToWebview({
			type: "hidePipelineResult",
			success: true,
			slug,
		})
		// Refresh the pipeline list in the UI
		await handleRequestPipelines(provider)
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error)
		provider.log(`[pipelineMessageHandler] Error hiding pipeline: ${errorMessage}`)
		await provider.postMessageToWebview({
			type: "hidePipelineResult",
			success: false,
			error: errorMessage,
		})
	}
}

/**
 * Handle an "unhidePipeline" message.
 * Restores a previously hidden pipeline, making it visible again.
 * The preference is persisted in global state so it survives restarts.
 */
export async function handleUnhidePipeline(provider: MirrorProvider, message: WebviewMessage): Promise<void> {
	try {
		const slug = message.text
		if (!slug) {
			await provider.postMessageToWebview({
				type: "unhidePipelineResult",
				success: false,
				error: "No pipeline slug provided",
			})
			return
		}

		PipelineRegistry.unhidePipeline(slug)

		// Persist hidden pipelines to global state
		const currentHidden = provider.contextProxy.getValues().hiddenPipelines ?? []
		await provider.contextProxy.setValue(
			"hiddenPipelines",
			currentHidden.filter((s: string) => s !== slug),
		)

		await provider.postMessageToWebview({
			type: "unhidePipelineResult",
			success: true,
			slug,
		})
		// Refresh the pipeline list in the UI
		await handleRequestPipelines(provider)
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error)
		provider.log(`[pipelineMessageHandler] Error unhiding pipeline: ${errorMessage}`)
		await provider.postMessageToWebview({
			type: "unhidePipelineResult",
			success: false,
			error: errorMessage,
		})
	}
}

export async function handleDeletePipeline(provider: MirrorProvider, message: WebviewMessage): Promise<void> {
	try {
		const slug = message.text
		if (!slug) {
			await provider.postMessageToWebview({
				type: "deletePipelineResult",
				success: false,
				error: "No pipeline slug provided",
			})
			return
		}

		const cwd = getCurrentCwd(provider)
		await PipelineRegistry.deletePipeline(slug, cwd)
		await provider.postMessageToWebview({
			type: "deletePipelineResult",
			success: true,
			slug,
		})
		// Refresh the pipeline list in the UI
		await handleRequestPipelines(provider)
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error)
		provider.log(`[pipelineMessageHandler] Error deleting pipeline: ${errorMessage}`)
		await provider.postMessageToWebview({
			type: "deletePipelineResult",
			success: false,
			error: errorMessage,
		})
	}
}

/**
 * Handle a "setDefaultPipeline" message.
 * Sets a pipeline as the user-preferred default for its type.
 * The preference is stored in the extension's global state so it
 * survives restarts.
 */
export async function handleSetDefaultPipeline(provider: MirrorProvider, message: WebviewMessage): Promise<void> {
	try {
		const slug = message.text
		if (!slug) {
			await provider.postMessageToWebview({
				type: "setDefaultPipelineResult",
				success: false,
				error: "No pipeline slug provided",
			})
			return
		}

		// Resolve the pipeline to get its type
		const def = PipelineRegistry.resolve(slug)
		const pipelineType = def.type

		// Store the user preference in-memory (session-scoped).
		// The PipelineRegistry's autoSelect will honor it immediately.
		PipelineRegistry.setUserDefault(pipelineType, slug)

		await provider.postMessageToWebview({
			type: "setDefaultPipelineResult",
			success: true,
			slug,
			pipelineType,
		})
		// Refresh the pipeline list in the UI
		await handleRequestPipelines(provider)
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error)
		provider.log(`[pipelineMessageHandler] Error setting default pipeline: ${errorMessage}`)
		await provider.postMessageToWebview({
			type: "setDefaultPipelineResult",
			success: false,
			error: errorMessage,
		})
	}
}

/**
 * Handle a "setComfyuiDefaultPipeline" message.
 * Persists the user's per-type ComfyUI pipeline preference to global state.
 */
export async function handleSetComfyuiDefaultPipeline(
	provider: MirrorProvider,
	message: WebviewMessage,
): Promise<void> {
	try {
		const { pipelineType, slug } = message.values ?? {}
		if (!pipelineType || !slug) {
			await provider.postMessageToWebview({
				type: "setDefaultPipelineResult",
				success: false,
				error: "Missing pipelineType or slug in message values",
			})
			return
		}

		// Resolve the pipeline to validate it exists
		const def = PipelineRegistry.resolve(slug)
		if (!def) {
			await provider.postMessageToWebview({
				type: "setDefaultPipelineResult",
				success: false,
				error: `No pipeline found with slug "${slug}"`,
			})
			return
		}

		// Store preference in PipelineRegistry session memory
		PipelineRegistry.setUserDefault(pipelineType, slug)

		// Persist to global state so it survives restarts
		const currentDefaults = provider.contextProxy.getValues().comfyuiDefaultPipelines ?? {}
		await provider.contextProxy.setValue("comfyuiDefaultPipelines", {
			...currentDefaults,
			[pipelineType]: slug,
		})

		await provider.postMessageToWebview({
			type: "setDefaultPipelineResult",
			success: true,
			slug,
			pipelineType,
		})
		// Refresh the pipeline list
		await handleRequestPipelines(provider)
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error)
		provider.log(`[pipelineMessageHandler] Error setting ComfyUI default pipeline: ${errorMessage}`)
		await provider.postMessageToWebview({
			type: "setDefaultPipelineResult",
			success: false,
			error: errorMessage,
		})
	}
}

/**
 * Handle a "requestHardwareProfile" message.
 * Runs hardware detection, caches the profile, and posts the result back to the webview.
 */
export async function handleRequestHardwareProfile(provider: MirrorProvider): Promise<void> {
	try {
		const hw = await HardwareDetector.detect()
		const profile = HardwareDetector.summarize(hw)

		// Cache the hardware profile in global state
		await provider.contextProxy.setValue("comfyuiHardwareProfile", profile)

		await provider.postMessageToWebview({
			type: "comfyuiHardwareProfileResult",
			values: {
				profile,
				totalRAMGB: hw.totalRAMGB,
				hasCUDA: hw.hasCUDA,
				hasMetal: hw.hasMetal,
				gpuMemoryGB: hw.gpuMemoryGB,
				gpuVendor: hw.gpuVendor,
			},
		})
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error)
		provider.log(`[pipelineMessageHandler] Error detecting hardware profile: ${errorMessage}`)
		await provider.postMessageToWebview({
			type: "comfyuiHardwareProfileResult",
			error: errorMessage,
		})
	}
}

/**
 * Handle a "saveSecureTokens" message.
 * Stores HuggingFace and/or OpenRouter API tokens in VS Code SecretStorage.
 * These tokens are NOT persisted in global state; they are stored in the OS keychain.
 */
export async function handleSaveSecureTokens(provider: MirrorProvider, message: WebviewMessage): Promise<void> {
	try {
		const { huggingFaceToken, openRouterToken, comfyCloudToken, atlasCloudToken } = message.values ?? {}

		if (huggingFaceToken !== undefined) {
			await provider.contextProxy.storeSecret("mirror_hf_api_token", huggingFaceToken || undefined)
		}
		if (openRouterToken !== undefined) {
			await provider.contextProxy.storeSecret("mirror_openrouter_api_token", openRouterToken || undefined)
		}
		if (comfyCloudToken !== undefined) {
			await provider.contextProxy.storeSecret("mirror_comfy_cloud_api_token", comfyCloudToken || undefined)
		}
		if (atlasCloudToken !== undefined) {
			await provider.contextProxy.storeSecret("mirror_atlas_cloud_api_token", atlasCloudToken || undefined)
		}

		await provider.postMessageToWebview({
			type: "saveSecureTokensResult",
			success: true,
		})

		// Refresh state to show masked token indicators
		await provider.postStateToWebview()
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error)
		provider.log(`[pipelineMessageHandler] Error saving secure tokens: ${errorMessage}`)
		await provider.postMessageToWebview({
			type: "saveSecureTokensResult",
			success: false,
			error: errorMessage,
		})
	}
}

/**
 * Handle a "saveSettings" message.
 * Batch-writes sanitized settings (with sensitive token values stripped)
 * to global state, then refreshes the webview.
 *
 * The frontend should send this message with all non-secret settings in
 * `message.values`, and call `saveSecureTokens` separately for secrets.
 */
export async function handleSaveSettings(provider: MirrorProvider, message: WebviewMessage): Promise<void> {
	try {
		const settings = message.values ?? {}
		const safeKeys = [
			"generationProviders",
			"openRouterModels",
			"comfyuiDefaultPipelines",
			"hiddenPipelines",
			"experiments",
			"imageGenerationProvider",
			"openRouterImageGenerationSelectedModel",
			"comfyuiAutoSetup",
			"activeSearchProvider",
			"userBraveApiKey",
			"atlasCloudModels",
		]

		for (const key of safeKeys) {
			if (key in settings) {
				await provider.contextProxy.setValue(key as keyof MirrorVSSettings, settings[key])
			}
		}

		await provider.postMessageToWebview({
			type: "saveSettingsResult",
			success: true,
		})

		// Push updated state to the webview
		await provider.postStateToWebview()
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error)
		provider.log(`[pipelineMessageHandler] Error saving settings: ${errorMessage}`)
		await provider.postMessageToWebview({
			type: "saveSettingsResult",
			success: false,
			error: errorMessage,
		})
	}
}

/**
 * Handle a "requestAllowlists" message.
 * Reads the current pipeline allowlists from global state and sends them to the webview.
 */
export async function handleRequestAllowlists(provider: MirrorProvider): Promise<void> {
	try {
		const values = provider.contextProxy.getValues()
		const allowedPipelines = values.allowedPipelines ?? null
		const modelPipelineAllowlist = values.modelPipelineAllowlist ?? null

		// Return allowlists as top-level properties so the webview can read them directly
		// (ExtensionMessage interface defines allowedPipelines and modelPipelineAllowlist
		//  as top-level fields)
		await provider.postMessageToWebview({
			type: "requestAllowlists",
			allowedPipelines,
			modelPipelineAllowlist,
		})
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error)
		provider.log(`[pipelineMessageHandler] Error requesting allowlists: ${errorMessage}`)
		await provider.postMessageToWebview({
			type: "requestAllowlists",
			error: errorMessage,
		})
	}
}

/**
 * Handle an "updateAllowlists" message.
 * Persists the allowlist changes (allowedPipelines and/or modelPipelineAllowlist)
 * to global state, then refreshes the webview.
 */
export async function handleUpdateAllowlists(provider: MirrorProvider, message: WebviewMessage): Promise<void> {
	try {
		const { allowedPipelines, modelPipelineAllowlist } = message.values ?? {}

		if (allowedPipelines !== undefined) {
			await provider.contextProxy.setValue("allowedPipelines", allowedPipelines)
		}
		if (modelPipelineAllowlist !== undefined) {
			await provider.contextProxy.setValue("modelPipelineAllowlist", modelPipelineAllowlist)
		}

		await provider.postMessageToWebview({
			type: "updateAllowlists",
			success: true,
		})

		// Push updated state to the webview
		await provider.postStateToWebview()
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error)
		provider.log(`[pipelineMessageHandler] Error updating allowlists: ${errorMessage}`)
		await provider.postMessageToWebview({
			type: "updateAllowlists",
			success: false,
			error: errorMessage,
		})
	}
}

/**
 * Handle a "scanComfyuiWorkflows" message.
 * Scans the ComfyUI user workflows directory and returns discovered workflows.
 * Uses the default ComfyUI install path to locate the workflows directory.
 */
export async function handleScanComfyuiWorkflows(provider: MirrorProvider): Promise<void> {
	try {
		const comfyUIPath = getDefaultComfyUIPath()
		const comfyUISrcPath = WorkflowScanner.getComfyUISrcPath(comfyUIPath)
		const discovered = await WorkflowScanner.scan(comfyUISrcPath)

		// Return workflows as top-level properties so the webview can read them directly
		// (ExtensionMessage interface defines workflows and workflowDir as top-level fields)
		await provider.postMessageToWebview({
			type: "scanComfyuiWorkflowsResult",
			workflows: discovered.map((wf) => ({ name: wf.slug, filename: wf.filename })),
			workflowDir: WorkflowScanner.getUserWorkflowDir(comfyUISrcPath),
		})
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error)
		provider.log(`[pipelineMessageHandler] Error scanning ComfyUI workflows: ${errorMessage}`)
		await provider.postMessageToWebview({
			type: "scanComfyuiWorkflowsResult",
			workflows: [],
			workflowDir: "",
			error: errorMessage,
		})
	}
}

/**
 * Handle an "importComfyuiWorkflows" message.
 * Imports one or more discovered ComfyUI user workflows as Mirror pipelines.
 *
 * Expected payload in message.values:
 *   - filenames?: string[] — list of workflow filenames to import (omit or empty to import all)
 *   - pipelineType?: string — optional pipeline type to assign to all imported workflows
 *     (e.g. "generate", "edit", "inpaint", "upscale", "remove-bg")
 *     When provided, a _pipeline header with this type is injected into each imported file.
 *     When omitted, the type is guessed from the workflow content.
 */
export async function handleImportComfyuiWorkflows(provider: MirrorProvider, message: WebviewMessage): Promise<void> {
	try {
		const { filenames, pipelineType } = message.values ?? {}
		const comfyUIPath = getDefaultComfyUIPath()
		const comfyUISrcPath = WorkflowScanner.getComfyUISrcPath(comfyUIPath)

		let slugs: string[]

		if (filenames && filenames.length > 0) {
			// Import specific workflows with optional type assignment
			slugs = []
			for (const filename of filenames) {
				const slug = await WorkflowScanner.importOne(
					comfyUISrcPath,
					filename,
					pipelineType as PipelineType | undefined,
				)
				slugs.push(slug)
			}
		} else {
			// Import all discovered workflows (no type override for bulk)
			slugs = await WorkflowScanner.importAll(comfyUISrcPath)
		}

		// Re-initialize the pipeline registry so newly imported pipelines are available
		if (slugs.length > 0) {
			const cwd = getCurrentCwd(provider)
			await PipelineRegistry.initialize(cwd)
		}

		await provider.postMessageToWebview({
			type: "importComfyuiWorkflows",
			success: true,
			slugs,
		})

		// Refresh the pipeline list in the UI
		await handleRequestPipelines(provider)
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error)
		provider.log(`[pipelineMessageHandler] Error importing ComfyUI workflows: ${errorMessage}`)
		await provider.postMessageToWebview({
			type: "importComfyuiWorkflows",
			success: false,
			error: errorMessage,
		})
	}
}

/**
 * Handle a "deleteComfyuiWorkflow" message.
 * Deletes an imported ComfyUI workflow pipeline by filename.
 * Removes the pipeline file from the persistent comfyui pipelines directory.
 */
export async function handleDeleteComfyuiWorkflow(provider: MirrorProvider, message: WebviewMessage): Promise<void> {
	try {
		const { filename } = message.values ?? {}
		if (!filename) {
			throw new Error("Missing filename parameter")
		}

		const comfyuiPipelinesDir = WorkflowScanner.getComfyuiPipelinesDir()
		const slug = filename.replace(/\.json$/, "")
		const filePath = path.join(comfyuiPipelinesDir, filename.endsWith(".json") ? filename : `${filename}.json`)

		try {
			await fsp.access(filePath)
		} catch {
			throw new Error(`Workflow file "${filename}" not found in pipelines directory`)
		}

		await fsp.unlink(filePath)

		// Also delete from pipeline registry if it was registered
		const cwd = getCurrentCwd(provider)
		await PipelineRegistry.initialize(cwd)

		await provider.postMessageToWebview({
			type: "deleteComfyuiWorkflowResult",
			success: true,
			slug,
		})

		// Refresh the pipeline list in the UI
		await handleRequestPipelines(provider)
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error)
		provider.log(`[pipelineMessageHandler] Error deleting ComfyUI workflow: ${errorMessage}`)
		await provider.postMessageToWebview({
			type: "deleteComfyuiWorkflowResult",
			success: false,
			error: errorMessage,
		})
	}
}

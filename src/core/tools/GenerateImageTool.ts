import path from "path"
import fs from "fs/promises"
import * as vscode from "vscode"
import {
	GenerateImageParams,
	IMAGE_GENERATION_MODELS,
	IMAGE_GENERATION_MODEL_IDS,
	getImageGenerationProvider,
} from "@mirror-vs/types"
import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { fileExistsAtPath } from "../../utils/fs"
import { getReadablePath } from "../../utils/path"
import { isPathOutsideWorkspace } from "../../utils/pathUtils"
import { EXPERIMENT_IDS, experiments } from "../../shared/experiments"
import { ImageProviderRouter } from "../../api/image/router"
import { PipelineRegistry } from "../../api/image/pipeline-registry"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import type { ToolUse } from "../../shared/tools"
import { t } from "../../i18n"
import type { ProgressInfo } from "../../api/image/types"

export class GenerateImageTool extends BaseTool<"generate_image"> {
	readonly name = "generate_image" as const

	async execute(params: GenerateImageParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { prompt, path: relPath, image: inputImagePath, pipeline } = params
		console.log(
			`[GenerateImageTool] === RAW TOOL CALL PARAMS ===`,
			JSON.stringify({ prompt: prompt?.slice(0, 80), path: relPath, image: inputImagePath, pipeline }, null, 2),
		)
		console.log(`[GenerateImageTool] pipeline value type = "${typeof pipeline}", value = "${pipeline}"`)
		const { handleError, pushToolResult, askApproval } = callbacks

		const provider = task.providerRef.deref()
		const state = await provider?.getState()
		const exps = state?.experiments ?? {}
		const anyImagePipelineEnabled =
			experiments.isEnabled(exps, EXPERIMENT_IDS.TXT2IMG) ||
			experiments.isEnabled(exps, EXPERIMENT_IDS.IMG2IMG) ||
			experiments.isEnabled(exps, EXPERIMENT_IDS.INPAINT) ||
			experiments.isEnabled(exps, EXPERIMENT_IDS.OUTPAINT) ||
			experiments.isEnabled(exps, EXPERIMENT_IDS.UPSCALE) ||
			experiments.isEnabled(exps, EXPERIMENT_IDS.REMOVE_BG) ||
			experiments.isEnabled(exps, EXPERIMENT_IDS.TXT2AUDIO) ||
			experiments.isEnabled(exps, EXPERIMENT_IDS.TXT2VIDEO)

		if (!anyImagePipelineEnabled) {
			pushToolResult(
				formatResponse.toolError(
					"Image generation is an experimental feature that must be enabled in settings. Please enable 'Image Generation' in the Experimental Settings section.",
				),
			)
			return
		}

		if (!prompt) {
			task.consecutiveMistakeCount++
			task.recordToolError("generate_image")
			pushToolResult(await task.sayAndCreateMissingParamError("generate_image", "prompt"))
			return
		}

		if (!relPath) {
			task.consecutiveMistakeCount++
			task.recordToolError("generate_image")
			pushToolResult(await task.sayAndCreateMissingParamError("generate_image", "path"))
			return
		}

		const accessAllowed = task.mirrorIgnoreController?.validateAccess(relPath)
		if (!accessAllowed) {
			await task.say("mirrorignore_error", relPath)
			pushToolResult(formatResponse.mirrorIgnoreError(relPath))
			return
		}

		// Normalize inputImagePath: models often send null or "null" for new text-to-image generations
		const normalizedInputImagePath =
			inputImagePath &&
			inputImagePath !== "null" &&
			inputImagePath !== "undefined" &&
			typeof inputImagePath === "string" &&
			inputImagePath.trim() !== ""
				? inputImagePath.trim()
				: undefined

		let inputImageData: string | undefined
		if (normalizedInputImagePath) {
			const inputImageFullPath = path.resolve(task.cwd, normalizedInputImagePath)

			const inputImageExists = await fileExistsAtPath(inputImageFullPath)
			if (!inputImageExists) {
				await task.say("error", `Input image not found: ${getReadablePath(task.cwd, normalizedInputImagePath)}`)
				task.didToolFailInCurrentTurn = true
				pushToolResult(
					formatResponse.toolError(
						`Input image not found: ${getReadablePath(task.cwd, normalizedInputImagePath)}`,
					),
				)
				return
			}

			const inputImageAccessAllowed = task.mirrorIgnoreController?.validateAccess(normalizedInputImagePath)
			if (!inputImageAccessAllowed) {
				await task.say("mirrorignore_error", normalizedInputImagePath)
				pushToolResult(formatResponse.mirrorIgnoreError(normalizedInputImagePath))
				return
			}

			try {
				const imageBuffer = await fs.readFile(inputImageFullPath)
				const imageExtension = path.extname(inputImageFullPath).toLowerCase().replace(".", "")

				const supportedFormats = ["png", "jpg", "jpeg", "gif", "webp"]
				if (!supportedFormats.includes(imageExtension)) {
					await task.say(
						"error",
						`Unsupported image format: ${imageExtension}. Supported formats: ${supportedFormats.join(", ")}`,
					)
					task.didToolFailInCurrentTurn = true
					pushToolResult(
						formatResponse.toolError(
							`Unsupported image format: ${imageExtension}. Supported formats: ${supportedFormats.join(", ")}`,
						),
					)
					return
				}

				const mimeType = imageExtension === "jpg" ? "jpeg" : imageExtension
				inputImageData = `data:image/${mimeType};base64,${imageBuffer.toString("base64")}`
			} catch (error) {
				await task.say(
					"error",
					`Failed to read input image: ${error instanceof Error ? error.message : "Unknown error"}`,
				)
				task.didToolFailInCurrentTurn = true
				pushToolResult(
					formatResponse.toolError(
						`Failed to read input image: ${error instanceof Error ? error.message : "Unknown error"}`,
					),
				)
				return
			}
		}

		const isWriteProtected = task.mirrorProtectedController?.isWriteProtected(relPath) || false

		const fullPath = path.resolve(task.cwd, relPath)
		const isOutsideWorkspace = isPathOutsideWorkspace(fullPath)

		// Determine pipeline type for display in the approval UI and provider routing
		const pipelineType = inputImageData ? "img2img" : pipeline || "txt2img"
		console.log(
			`[GenerateImageTool] pipelineType resolved to = "${pipelineType}" (inputImageData=${!!inputImageData}, raw pipeline="${pipeline}")`,
		)

		// Route through the active provider with per-type resolution.
		const activeProvider = ImageProviderRouter.getActiveProvider(pipelineType)
		console.log(`[GenerateImageTool] activeProvider = ${activeProvider?.name ?? "undefined"}`)
		if (!activeProvider) {
			const errorMessage =
				"No image generation provider is configured or available. Please check that ComfyUI is running at http://127.0.0.1:8188 or configure an OpenRouter API key in Settings."
			console.log(`[GenerateImageTool] ERROR: no active provider — aborting`)
			await task.say("error", errorMessage)
			pushToolResult(formatResponse.toolError(errorMessage))
			return
		}

		// Validate OpenRouter API key only when OpenRouter is the active provider
		if (activeProvider.name === "openrouter") {
			const openRouterApiKey = state?.openRouterImageApiKey || state?.apiConfiguration?.openRouterApiKey
			if (!openRouterApiKey) {
				const errorMessage = t("tools:generateImage.openRouterApiKeyRequired")
				await task.say("error", errorMessage)
				pushToolResult(formatResponse.toolError(errorMessage))
				return
			}
		}

		// Model resolution for the active provider
		let selectedModel: string
		if (activeProvider.name === "comfyui") {
			selectedModel = state?.comfyuiModel || "sd_xl_turbo"
		} else if (activeProvider.name === "openrouter") {
			selectedModel =
				state?.openRouterModels?.[pipelineType] ||
				state?.openRouterImageGenerationSelectedModel ||
				"google/gemini-2.5-flash-image"
		} else if (activeProvider.name === "atlas_cloud") {
			selectedModel = state?.atlasCloudModels?.[pipelineType] || "atlas-cloud/default"
		} else if (activeProvider.name === "comfy_cloud") {
			selectedModel = "comfy-cloud/default"
		} else {
			selectedModel = state?.openRouterImageGenerationSelectedModel || IMAGE_GENERATION_MODEL_IDS[0]
		}

		// Resolve the actual pipeline early so the human-readable name can be shown
		// in the frontend message alongside the generic type.
		const effectivePipeline =
			pipeline || (activeProvider.name === "comfyui" ? state?.comfyuiDefaultPipelines?.[pipelineType] : undefined)

		let resolvedPipelineName: string | undefined
		try {
			if (!PipelineRegistry.isInitialized()) {
				const cwd = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath
				await PipelineRegistry.initialize(cwd)
			}
			const internalType = inputImageData ? "edit" : "generate"
			console.log(`[GenerateImageTool] Resolving pipeline slug="${effectivePipeline}" type="${internalType}"`)
			if (effectivePipeline) {
				const def = PipelineRegistry.resolve(effectivePipeline, internalType as any)
				resolvedPipelineName = def.name
				console.log(`[GenerateImageTool] Resolved pipeline "${effectivePipeline}" → name="${def.name}"`)
			} else {
				console.warn(`[GenerateImageTool] pipeline slug is empty/falsy — cannot resolve`)
			}
		} catch (e) {
			// PipelineRegistry not available or resolution failed — fall back to the slug itself
			console.warn(`[GenerateImageTool] Could not resolve pipeline name: ${e instanceof Error ? e.message : e}`)
			resolvedPipelineName = effectivePipeline || undefined
		}

		const sharedMessageProps = {
			tool: "generateImage" as const,
			path: getReadablePath(task.cwd, relPath),
			content: prompt,
			isOutsideWorkspace,
			isProtected: isWriteProtected,
		}

		try {
			task.consecutiveMistakeCount = 0

			const approvalMessagePayload = {
				...sharedMessageProps,
				content: prompt,
				pipeline: pipelineType,
				pipelineName: resolvedPipelineName,
				provider: activeProvider.name,
				...(normalizedInputImagePath && { inputImage: getReadablePath(task.cwd, normalizedInputImagePath) }),
			}
			console.log(
				`[GenerateImageTool] === APPROVAL MESSAGE PAYLOAD ===`,
				JSON.stringify(approvalMessagePayload, null, 2),
			)
			console.log(
				`[GenerateImageTool] pipeline field in payload = "${approvalMessagePayload.pipeline}"`,
				`pipelineName field in payload = "${approvalMessagePayload.pipelineName}"`,
			)
			const approvalMessage = JSON.stringify(approvalMessagePayload)

			const didApprove = await askApproval("tool", approvalMessage, undefined, isWriteProtected)

			if (!didApprove) {
				return
			}

			// Progress callback for live feedback during image generation.
			// Sends structured JSON via say("progress", ...) so the webview can render
			// an animated visual loader (e.g. CircularProgress ring + stage label).
			// Uses partial=true so the message updates in-place instead of creating
			// a new message per progress tick.
			let lastProgressJson = ""
			const onProgress = (p: ProgressInfo) => {
				const payload = JSON.stringify({
					stage: p.stage || "generating",
					progress: p.progress,
					value: p.value,
					max: p.max,
					state: p.state,
					eta: p.eta,
					currentNode: p.currentNode,
				})
				if (payload !== lastProgressJson) {
					lastProgressJson = payload
					task.say("progress", payload, undefined, true).catch(() => {})
				}
			}

			// Build common options with pipeline override if specified
			// Read allowlists from extension state so autoSelect() can filter pipelines
			// to only those the user has explicitly allowed (global and/or per-model).
			const allowlists =
				state?.allowedPipelines || state?.modelPipelineAllowlist
					? {
							allowedPipelines: state?.allowedPipelines ?? null,
							modelPipelineAllowlist: state?.modelPipelineAllowlist ?? null,
						}
					: undefined

			const baseOptions: {
				model: string
				onProgress: typeof onProgress
				pipeline?: string
				allowlists?: import("../../shared/allowlists").PipelineAllowlists
			} = {
				model: selectedModel,
				onProgress,
				...(allowlists && { allowlists }),
			}
			baseOptions.pipeline = effectivePipeline

			let result
			if (inputImageData) {
				console.log(`[GenerateImageTool] calling ${activeProvider.name}.edit()`)
				result = await activeProvider.edit(prompt, inputImageData, baseOptions)
			} else {
				console.log(`[GenerateImageTool] calling ${activeProvider.name}.generate()`)
				result = await activeProvider.generate(prompt, baseOptions)
			}
			console.log(`[GenerateImageTool] result.success = ${result?.success}, error = ${result?.error || "none"}`)

			if (!result.success) {
				// Build a rich error message — include the suggestion if available
				const errorMsg = result.error || "Failed to generate image"
				const displayMsg = result.errorSuggestion
					? `Pipeline "${pipelineType}" with model "${selectedModel}" failed: ${errorMsg}\n\n**Suggestion:** ${result.errorSuggestion}`
					: `Pipeline "${pipelineType}" with model "${selectedModel}" failed: ${errorMsg}`
				await task.say("error", displayMsg)

				// Build a structured error payload so the LLM can understand what went wrong
				const errorPayload: any = { error: errorMsg }
				if (result.errorCode) errorPayload.errorCode = result.errorCode
				if (result.errorCategory) errorPayload.errorCategory = result.errorCategory
				if (result.errorSuggestion) errorPayload.suggestion = result.errorSuggestion
				if (result.errorNodeId) errorPayload.nodeId = result.errorNodeId
				// Include pipeline slug and model name so the LLM can tell the user
				// exactly which pipeline/model configuration failed
				errorPayload.pipeline = pipelineType
				errorPayload.model = selectedModel

				task.didToolFailInCurrentTurn = true
				pushToolResult(formatResponse.toolError(errorPayload))
				return
			}

			// Send a final "completed" progress update so the UI doesn't stay stuck
			// at the last WebSocket progress value (e.g. 95%) after generation finishes.
			task.say(
				"progress",
				JSON.stringify({ stage: "complete", progress: 100, state: "completed" }),
				undefined,
				false, // partial=false so this is a permanent completion marker
			).catch(() => {})

			if (!result.imageData) {
				const errorMessage = "No image data received"
				await task.say("error", errorMessage)
				task.didToolFailInCurrentTurn = true
				pushToolResult(formatResponse.toolError(errorMessage))
				return
			}

			// Handle both image and audio data URLs
			const imageMatch = result.imageData.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/)
			const audioMatch = result.imageData.match(/^data:audio\/(\w+);base64,(.+)$/)
			const isAudio = !!audioMatch

			if (!imageMatch && !audioMatch) {
				const errorMessage = "Invalid image or audio format received"
				await task.say("error", errorMessage)
				task.didToolFailInCurrentTurn = true
				pushToolResult(formatResponse.toolError(errorMessage))
				return
			}

			const mediaFormat = isAudio ? audioMatch![1] : imageMatch![1]
			const base64Data = isAudio ? audioMatch![2] : imageMatch![2]

			let finalPath = relPath
			if (isAudio) {
				if (!finalPath.match(/\.(wav|mp3|flac|ogg|aac|m4a|webm)$/i)) {
					finalPath = `${finalPath}.${mediaFormat}`
				}
			} else {
				if (!finalPath.match(/\.(png|jpg|jpeg)$/i)) {
					finalPath = `${finalPath}.${mediaFormat === "jpeg" ? "jpg" : mediaFormat}`
				}
			}

			const mediaBuffer = Buffer.from(base64Data, "base64")

			const absolutePath = path.resolve(task.cwd, finalPath)
			const directory = path.dirname(absolutePath)
			await fs.mkdir(directory, { recursive: true })

			await fs.writeFile(absolutePath, mediaBuffer)

			if (finalPath) {
				await task.fileContextTracker.trackFileContext(finalPath, "mirror_edited")
			}

			task.didEditFile = true

			task.recordToolUsage("generate_image")

			const fullPath = path.join(task.cwd, finalPath)

			if (isAudio) {
				// For audio, report the saved file path via text (no image viewer necessary)
				await task.say("text", `Audio saved to ${getReadablePath(task.cwd, finalPath)}`)
			} else {
				let mediaUri = provider?.convertToWebviewUri?.(fullPath) ?? vscode.Uri.file(fullPath).toString()

				const cacheBuster = Date.now()
				mediaUri = mediaUri.includes("?") ? `${mediaUri}&t=${cacheBuster}` : `${mediaUri}?t=${cacheBuster}`

				await task.say("image", JSON.stringify({ imageUri: mediaUri, imagePath: fullPath }))
			}

			pushToolResult(formatResponse.toolResult(getReadablePath(task.cwd, finalPath)))
		} catch (error) {
			await handleError("generating image", error as Error)
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"generate_image">): Promise<void> {
		return
	}
}

export const generateImageTool = new GenerateImageTool()

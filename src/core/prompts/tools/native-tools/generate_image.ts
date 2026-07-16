import type OpenAI from "openai"

const BASE_GENERATE_IMAGE_DESCRIPTION = `Request to generate or edit an image (or generate audio) using AI models. This tool can create new images from text prompts, modify existing images based on your instructions, or generate audio clips from text descriptions.

CRITICAL — How to edit an existing image:
When the user asks you to modify an image you just generated (e.g. "make a sketch of it", "turn it into a painting", "change the style"), you MUST:
1. Use the file path of the previously-generated image as the \`image\` parameter
2. Describe the edit in the \`prompt\` parameter
3. Provide a new \`path\` for the result (do NOT overwrite the original)
If you omit \`image\`, the tool will generate a completely new image instead of editing the existing one.

Parameters:
- prompt: (required) The text prompt describing what to generate or how to edit the image / audio
- path: (required) The file path where the generated/edited image or audio should be saved (relative to the current workspace directory). The tool will automatically add the appropriate file extension if not provided.
- image: (optional, but REQUIRED for edits) The file path to an existing image to edit or transform (relative to the current workspace directory). Pass the path of a previously-generated image here to modify it. Supported formats: PNG, JPG, JPEG, GIF, WEBP.
- pipeline: (required) Pipeline slug to select a specific workflow variant. You must always specify the best pipeline for the task.`

const EXAMPLES_SECTION = `
Examples:
- { "prompt": "A beautiful sunset over mountains with vibrant orange and purple colors", "path": "images/sunset.png", "image": null }
- Upscaling: { "prompt": "Upscale this image to higher resolution", "path": "images/enhanced.png", "image": "images/input.jpg" }
- Fast icon generation: { "prompt": "A modern minimalist app icon", "path": "icons/app.png", "image": null, "pipeline": "txt2img-flash" }
- Audio generation: { "prompt": "Gentle rain falling on leaves", "path": "sounds/rain.wav", "image": null, "pipeline": "txt2audio" }`

const PROMPT_PARAMETER_DESCRIPTION = `Text description of the image to generate or the edits to apply. When editing an existing image (provided via the image parameter), describe the transformation you want to apply.`

const PATH_PARAMETER_DESCRIPTION = `Filesystem path (relative to the workspace) where the resulting image should be saved`

const IMAGE_PARAMETER_DESCRIPTION = `Optional path (relative to the workspace) to an existing image to edit or transform. IMPORTANT: When the user asks you to modify an image you just generated (e.g. "make a sketch of it", "turn it into a painting", "change the style"), you MUST pass the previously-saved image's file path here. If you omit this, the tool generates from scratch instead of editing. Supports PNG, JPG, JPEG, GIF, and WEBP`

/**
 * Build the pipeline parameter description solely from user-imported pipelines.
 */
function buildPipelineDescription(pipelineSlugs: string[]): string {
	if (pipelineSlugs.length === 0) {
		return `Pipeline slug to select a specific workflow variant. You must always specify the best pipeline for the task.`
	}

	const pipelineList = pipelineSlugs.map((slug) => `"${slug}"`).join(", ")
	return `Pipeline slug to select a specific workflow variant. Available pipelines: ${pipelineList}. You must always specify the best pipeline for the task.`
}

export interface GenerateImageToolOptions {
	/** Names of user-imported pipelines for dynamic tool description */
	pipelineNames?: string[]
}

export function createGenerateImageTool(options: GenerateImageToolOptions = {}): OpenAI.Chat.ChatCompletionTool {
	const { pipelineNames = [] } = options

	const descriptionParts: string[] = [BASE_GENERATE_IMAGE_DESCRIPTION]

	const pipelineDesc = buildPipelineDescription(pipelineNames)
	descriptionParts.push(`\n${pipelineDesc}`)
	if (pipelineNames.length > 0) {
		descriptionParts.push(EXAMPLES_SECTION)
	}

	const description = descriptionParts.join("\n")

	const pipelineParamDesc =
		pipelineNames.length > 0
			? `Pipeline slug to select a specific workflow variant. Available pipelines: ${pipelineNames.map((slug) => `"${slug}"`).join(", ")}. You must always specify the best pipeline for the task.`
			: `Pipeline slug to select a specific workflow variant. You must always specify the best pipeline for the task.`

	return {
		type: "function",
		function: {
			name: "generate_image",
			description,
			strict: true,
			parameters: {
				type: "object",
				properties: {
					prompt: {
						type: "string",
						description: PROMPT_PARAMETER_DESCRIPTION,
					},
					path: {
						type: "string",
						description: PATH_PARAMETER_DESCRIPTION,
					},
					image: {
						type: ["string", "null"],
						description: IMAGE_PARAMETER_DESCRIPTION,
					},
					pipeline: {
						type: "string",
						description: pipelineParamDesc,
					},
				},
				required: ["prompt", "path", "image", "pipeline"],
				additionalProperties: false,
			},
		},
	} satisfies OpenAI.Chat.ChatCompletionTool
}

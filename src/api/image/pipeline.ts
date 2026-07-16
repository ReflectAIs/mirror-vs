/**
 * Pipeline types for the ComfyUI workflow pipeline system.
 *
 * A "pipeline" is a ComfyUI workflow JSON that can be used for a specific
 * image task type (generate, edit, inpaint, etc.). Pipelines are discovered
 * from three sources:
 *  1. Built-in — shipped with the extension in `workflows/`
 *  2. Global   — `~/.mirror/pipelines/`
 *  3. Project  — `.mirror/pipelines/` (highest priority)
 *
 * Each pipeline carries a `_pipeline` metadata header embedded in the JSON,
 * plus the raw workflow body.  The registry caches all discovered pipelines
 * in memory and provides file-watching for hot-reload.
 */

// ---------------------------------------------------------------------------
// Pipeline type — mirrors the existing WorkflowType union
// ---------------------------------------------------------------------------

/** The kind of image operation a pipeline supports. */
export type PipelineType = "generate" | "edit" | "inpaint" | "outpaint" | "upscale" | "remove-bg"

/** All known pipeline types. */
export const ALL_PIPELINE_TYPES: PipelineType[] = ["generate", "edit", "inpaint", "outpaint", "upscale", "remove-bg"]

// ---------------------------------------------------------------------------
// Pipeline metadata (embedded as `_pipeline` in the JSON)
// ---------------------------------------------------------------------------

/**
 * Metadata header embedded inside a pipeline JSON file.
 *
 * Example:
 * ```json
 * {
 *   "_pipeline": {
 *     "name": "SDXL Turbo Flash",
 *     "description": "Ultra-fast generation using SDXL Turbo",
 *     "type": "generate",
 *     "tags": ["fast", "logo", "icon", "quick", "draft"]
 *   },
 *   "nodes": [ ... ]
 * }
 * ```
 */
export interface PipelineMetadata {
	/** Human-readable name (e.g. "SDXL Turbo Flash") */
	name: string
	/** Short description of what this pipeline does */
	description: string
	/** Which task type this pipeline handles */
	type: PipelineType
	/** Tags for auto-selection and filtering (e.g. "fast", "quality", "logo") */
	tags: string[]
	/** Whether this is the default pipeline for its type */
	isDefault?: boolean
}

// ---------------------------------------------------------------------------
// ComfyUI workflow format union
// ---------------------------------------------------------------------------

/**
 * A ComfyUI workflow can be in one of two formats:
 *
 * **Object format** (newer, preferred):
 *   Keys are numeric node IDs, values are node objects with `class_type`,
 *   `inputs`, and optionally `_meta.title`.
 *
 * **Legacy array format** (exported by older ComfyUI versions):
 *   Top-level `nodes` array + `links` array + `groups` + `extra`.
 */
export type ComfyUIWorkflow =
	| Record<
			string,
			{
				class_type?: string
				inputs?: Record<string, any>
				_meta?: { title?: string }
				widgets_values?: any[]
			}
	  >
	| {
			nodes: Array<{
				id: number
				type: string
				inputs?: Array<{ name: string; link: number | null }>
				outputs?: Array<{ name: string; type: string; links: (number | null)[] | null }>
				widgets_values?: any[]
				properties?: Record<string, any>
			}>
			links: any[]
			groups?: any[]
			extra?: any
	  }

// ---------------------------------------------------------------------------
// Pipeline definition (the full object the registry works with)
// ---------------------------------------------------------------------------

/** Source of a pipeline definition. */
export type PipelineSource = "builtin" | "global" | "project" | "comfyui"

/**
 * A fully-resolved pipeline definition.
 *
 * The registry produces these — they contain both metadata and the raw
 * workflow JSON ready for injection.
 */
export interface PipelineDefinition {
	/** Unique slug derived from the filename (e.g. "txt2img", "txt2img-flash") */
	slug: string
	/** Human-readable name */
	name: string
	/** Short description */
	description: string
	/** Task type */
	type: PipelineType
	/** Tags for auto-selection */
	tags: string[]
	/** Source of this pipeline */
	source: PipelineSource
	/** Whether this is the default for its type */
	isDefault: boolean
	/** The raw workflow JSON (object or legacy-array format) */
	workflow: ComfyUIWorkflow
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the `_pipeline` metadata header from a raw JSON object.
 * Returns `undefined` if no header is present.
 */
export function extractPipelineMetadata(raw: any): PipelineMetadata | undefined {
	if (!raw || typeof raw !== "object") return undefined
	const header = raw._pipeline
	if (!header || typeof header !== "object") return undefined
	if (!header.name || !header.type) return undefined
	return {
		name: String(header.name),
		description: header.description ? String(header.description) : "",
		type: header.type as PipelineType,
		tags: Array.isArray(header.tags) ? header.tags.map(String) : [],
		isDefault: header.isDefault === true,
	}
}

/**
 * Strip the `_pipeline` header from a raw JSON object, returning only the
 * workflow body.  Mutates and returns the same reference.
 */
export function stripPipelineHeader(raw: any): any {
	if (raw && typeof raw === "object") {
		delete raw._pipeline
	}
	return raw
}

/**
 * Guess the pipeline type from a workflow's node composition.
 * Useful when no `_pipeline` header is present.
 */
export function guessPipelineType(workflow: any): PipelineType {
	if (!workflow || typeof workflow !== "object") return "generate"

	const classTypes = new Set<string>()
	const collect = (obj: any) => {
		if (obj?.class_type) classTypes.add(obj.class_type)
	}

	if (workflow.nodes && Array.isArray(workflow.nodes)) {
		// Legacy array format
		for (const node of workflow.nodes) {
			if (node?.type) classTypes.add(node.type)
		}
	} else {
		// Object format
		for (const key of Object.keys(workflow)) {
			collect(workflow[key])
		}
	}

	if (classTypes.has("LoadImage") && classTypes.has("VAEEncode")) return "edit" as PipelineType
	if (classTypes.has("LoadImage") && classTypes.has("InpaintModelConditioning")) return "inpaint" as PipelineType
	if (classTypes.has("LoadImage") && classTypes.has("ImageUpscaleWithModel")) return "upscale" as PipelineType
	if (classTypes.has("LoadImage") && classTypes.has("OutpaintModelConditioning")) return "outpaint" as PipelineType
	if (classTypes.has("LoadImage") && classTypes.has("RMBG")) return "remove-bg" as PipelineType
	return "generate" as PipelineType
}

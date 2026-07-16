/**
 * WorkflowEngine — loads ComfyUI workflow JSON files and injects
 * prompt, model, seed, dimensions, sampler, scheduler, and other parameters.
 *
 * ## Node discovery strategy
 *
 * Prompt injection (positive / negative) uses **connection-based lookup**:
 * it finds the sampler node (KSampler or SamplerCustom), traces its
 * `positive` and `negative` connection inputs back to the CLIPTextEncode
 * nodes that feed them.  This follows the actual data flow — just like
 * ComfyUI itself — and correctly handles user-imported workflows where
 * `_meta.title` labels don't match the wiring.
 *
 * Other injectors (model, seed, sampler, scheduler, dimensions, etc.)
 * still discover nodes by **_meta.title** first, falling back to
 * **class_type** lookup.  This makes workflows resilient to re-ordering
 * or editing in ComfyUI's UI.
 *
 * ## Format support
 *
 * The engine supports both ComfyUI workflow formats:
 *   - **Object format** (newer): keys are numeric node IDs, values are nodes
 *   - **Legacy array format**: top-level `nodes` + `links` arrays
 *
 * Call `normalizeWorkflow()` before injection to convert legacy arrays to
 * the object format.  All injectors work on the normalized format.
 *
 * ## Flash / Turbo workflows
 *
 * Workflows using `SamplerCustom` + `SDTurboScheduler` (instead of `KSampler`)
 * are handled transparently: `injectSeed` falls back to `SamplerCustom.widgets_values[1]`
 * when no `KSampler` node is found.
 */
import fs from "fs"
import path from "path"

export type WorkflowType =
	| "txt2img"
	| "img2img"
	| "inpaint"
	| "outpaint"
	| "upscale"
	| "remove-bg"
	| "txt2audio"
	| "txt2video"

/**
 * Resolve the directory containing workflow JSON files.
 *
 * During development / testing engine.ts runs in its source location,
 * so workflows are in the same directory (`__dirname`).
 *
 * When esbuild bundles everything into `dist/extension.js`, `__dirname`
 * becomes `dist/`, and the esbuild copy step places workflow JSONs into
 * `dist/workflows/.  We try both locations.
 */
function resolveWorkflowsDir(): string {
	// 1) Dev / test path — __dirname = src/services/image-runtime/workflows/
	if (fs.existsSync(path.join(__dirname, "txt2img.json"))) {
		return __dirname
	}
	// 2) Bundled path — workflows copied to dist/workflows/
	const bundledPath = path.join(__dirname, "workflows")
	if (fs.existsSync(path.join(bundledPath, "txt2img.json"))) {
		return bundledPath
	}
	throw new Error(
		`Cannot locate workflow JSON files. Tried:\n  - ${path.join(__dirname, "txt2img.json")}\n  - ${path.join(bundledPath, "txt2img.json")}`,
	)
}

const WORKFLOWS_DIR = resolveWorkflowsDir()

/**
 * Default negative prompt appended when a user provides their own negative
 * prompt. Designed to catch common artefacts without interfering with the
 * user's creative intent.
 */
const DEFAULT_NEGATIVE_PROMPT = "blurry, low quality, watermark, logo, bad anatomy, deformed, extra fingers, cropped"

export class WorkflowEngine {
	/**
	 * Load a workflow JSON as a plain object.
	 * Throws if the file doesn't exist or is invalid JSON.
	 */
	static loadWorkflowSync(type: WorkflowType): any {
		const filePath = path.join(WORKFLOWS_DIR, `${type}.json`)
		const raw = fs.readFileSync(filePath, "utf-8")
		return JSON.parse(raw)
	}

	// --------------------------------------------------------------------------
	// Format normalization
	// --------------------------------------------------------------------------

	/**
	 * Normalize a workflow to the object format.
	 *
	 * If the workflow is in legacy array format (`nodes` + `links` arrays),
	 * it is converted to the object format that the injectors expect.
	 * If already in object format, it is returned as-is.
	 */
	static normalizeWorkflow(workflow: any): any {
		if (!workflow || typeof workflow !== "object") {
			throw new Error("Invalid workflow: expected an object")
		}
		if (Array.isArray(workflow.nodes)) {
			const converted = WorkflowEngine.convertLegacyToObject(workflow)
			// Populate inputs from widgets_values after legacy conversion too
			WorkflowEngine.populateWidgetInputs(converted)
			return converted
		}
		// Populate inputs from widgets_values for nodes where the /prompt API
		// expects values in inputs rather than relying on widgets_values.
		WorkflowEngine.populateWidgetInputs(workflow)
		return workflow
	}

	/**
	 * Build a lookup from link ID → { from_node, from_slot } using the legacy
	 * links array.  Each link entry has the format:
	 *
	 *     [link_id, from_node, from_slot, to_node, to_slot, type]
	 */
	private static buildLinkMap(links: any[]): Map<number, { fromNode: number; fromSlot: number }> {
		const map = new Map<number, { fromNode: number; fromSlot: number }>()
		if (!Array.isArray(links)) return map
		for (const link of links) {
			if (Array.isArray(link) && link.length >= 3) {
				map.set(link[0], { fromNode: link[1], fromSlot: link[2] })
			}
		}
		return map
	}

	/**
	 * Convert a legacy array-format workflow to the object format.
	 *
	 * Legacy format:
	 * ```json
	 * { "nodes": [{ "id": 6, "type": "CLIPTextEncode", ... }], "links": [...] }
	 * ```
	 *
	 * Object format:
	 * ```json
	 * { "6": { "class_type": "CLIPTextEncode", "inputs": {...}, "_meta": {...} } }
	 * ```
	 */
	static convertLegacyToObject(legacy: { nodes: any[]; links?: any[]; groups?: any[]; extra?: any }): any {
		const result: Record<string, any> = {}
		let clipTextEncodeCount = 0

		// Build a link map to resolve numeric link IDs into [source_node, source_slot] tuples.
		// ComfyUI's /prompt API expects connections as [source_node_id, source_slot], not raw link IDs.
		const linkMap = WorkflowEngine.buildLinkMap(legacy.links ?? [])

		for (const node of legacy.nodes) {
			const key = String(node.id)
			const obj: any = {
				class_type: node.type,
				inputs: {},
				widgets_values: node.widgets_values,
			}

			// Map legacy inputs (which reference links) to the object format.
			//
			// Legacy format:  inputs = [{ name: "clip", link: 38 }]
			// Object format:  inputs = { clip: ["20", 1] }
			//
			// The link ID must be resolved through the links array to find the
			// source node and slot, otherwise ComfyUI's /prompt API will reject
			// the connection (it expects [source_node_id, source_slot] tuples).
			if (node.inputs && Array.isArray(node.inputs)) {
				for (const inp of node.inputs) {
					if (inp.link != null) {
						const resolved = linkMap.get(inp.link)
						if (resolved) {
							obj.inputs[inp.name] = [String(resolved.fromNode), resolved.fromSlot]
						} else {
							// Unresolved link — keep the raw ID as a fallback
							obj.inputs[inp.name] = inp.link
						}
					}
				}
			}

			// Map widget values into inputs for nodes where ComfyUI's API expects
			// values under `inputs` rather than relying on `widgets_values`.
			//
			// CLIPTextEncode:  widgets_values[0] = prompt text → inputs.text
			if (node.type === "CLIPTextEncode" && node.widgets_values?.[0] !== undefined) {
				if (!("text" in obj.inputs)) {
					obj.inputs.text = node.widgets_values[0]
				}
			}

			// SaveImage:  widgets_values[0] = filename_prefix → inputs.filename_prefix
			if (node.type === "SaveImage" && node.widgets_values?.[0] !== undefined) {
				if (!("filename_prefix" in obj.inputs)) {
					obj.inputs.filename_prefix = node.widgets_values[0]
				}
			}

			// Determine the node title for _meta.
			//
			// For CLIPTextEncode nodes in legacy workflows, both positive and negative
			// nodes share the same properties["Node name for S&R"] = "CLIPTextEncode"
			// (or have generic titles like "CLIP Text Encode (Negative Prompt)"),
			// making them indistinguishable by title-based lookup. We always assign
			// standardized titles based on position so that injectPrompt /
			// injectNegativePrompt can find the correct node by title match.
			//
			// For all other node types, use node.title first, falling back to
			// properties["Node name for S&R"].
			let title: string | undefined
			if (node.type === "CLIPTextEncode") {
				clipTextEncodeCount++
				title = clipTextEncodeCount === 1 ? "Positive Prompt" : "Negative Prompt"
			} else {
				title = node.title ?? node.properties?.["Node name for S&R"]
			}

			if (title) {
				obj._meta = { title }
			}

			result[key] = obj
		}

		return result
	}

	/**
	 * Mapping from class_type to the order of widget value names.
	 * This mirrors what ComfyUI's frontend does when queuing a prompt:
	 * it fetches /object_info, reads the `input.required` order, and maps
	 * positional widgets_values into named inputs.
	 *
	 * Only widget inputs are listed here — connection inputs (which reference
	 * other nodes) are handled separately via the links array.
	 */
	private static WIDGET_INPUT_ORDER: Record<string, string[]> = {
		KSampler: ["seed", "steps", "cfg", "sampler_name", "scheduler", "denoise"],
		KSamplerSelect: ["sampler_name"],
		SDTurboScheduler: ["steps", "denoise"],
		EmptyLatentImage: ["width", "height", "batch_size"],
		SamplerCustom: ["add_noise", "noise_seed", "control_after_generate", "cfg"],
		CheckpointLoaderSimple: ["ckpt_name"],
		CLIPTextEncode: ["text"],
		SaveImage: ["filename_prefix"],
		VAELoader: ["vae_name"],
		LoraLoader: ["lora_name", "strength_model", "strength_clip"],
		ControlNetLoader: ["control_net_name"],
		DiffControlNetLoader: ["control_net_name"],
		ControlNetApply: ["strength"],
		ControlNetApplyAdvanced: ["strength", "start_percent", "end_percent"],
		ImageScale: ["upscale_method", "width", "height", "crop"],
		ImageScaleBy: ["upscale_method", "scale_by"],
		ImageUpscaleWithModel: ["upscale_by"],
		VAEDecode: [], // no widget values — all connections
		VAEDecodeTiled: [],
		VAEEncode: [],
		VAEEncodeTiled: [],
		CLIPSetLastLayer: ["stop_at_clip_layer"],
		CLIPVisionEncode: [],
		CLIPTextEncodeSDXL: [
			"width",
			"height",
			"crop_w",
			"crop_h",
			"target_width",
			"target_height",
			"text_g",
			"text_l",
		],
		DualCLIPLoader: ["ckpt_name", "type"],
		UNETLoader: ["unet_name"],
		UpscaleModelLoader: ["model_name"],
		CLIPVisionLoader: ["clip_name"],
		StyleModelLoader: ["style_model_name"],
		GLIGENLoader: ["gligen_name"],
		GLIGENTextBoxApply: ["gligen_textbox_model", "gligen_textbox_width", "gligen_textbox_height"],
		HypernetworkLoader: ["hypernetwork_name", "strength"],
		InpaintModelConditioning: ["noise_mask"],
		OutpaintModelConditioning: ["left", "top", "right", "bottom", "noise_mask"],
		FootageResize: ["width", "height"],
		ImageOnlyCheckpointLoader: ["ckpt_name"],
		PreviewImage: ["images"],
		Note: [],
	}

	/**
	 * Populate `inputs` from `widgets_values` for nodes where the ComfyUI
	 * /prompt API requires widget values in `inputs` rather than relying on
	 * the `widgets_values` array alone.
	 *
	 * ComfyUI's web frontend does this by fetching /object_info and reading
	 * the `input.required` field order.  We use a static mapping for known
	 * node types as a lightweight equivalent.
	 *
	 * This is called at the end of normalizeWorkflow() so that injectors
	 * (injectSeed, injectSampler, injectSteps, injectDimensions, etc.) and
	 * the final /prompt API call all see the populated inputs.
	 *
	 * Nodes without a known widget order are left untouched — their
	 * widgets_values will be sent as-is and handled by ComfyUI's fallback.
	 */
	static populateWidgetInputs(workflow: any): void {
		for (const key of Object.keys(workflow)) {
			const node = workflow[key]
			if (!node || typeof node !== "object") continue
			if (!node.class_type) continue

			const inputOrder = WorkflowEngine.WIDGET_INPUT_ORDER[node.class_type]
			if (!inputOrder) {
				// Unknown node type — we don't know how to map widget values to
				// named inputs, so leave widgets_values as-is. ComfyUI's /prompt
				// API can sometimes fall back to the array-based widget handling
				// when inputs are missing for custom nodes.
				continue
			}

			const widgets = node.widgets_values
			if (!Array.isArray(widgets) || widgets.length === 0) {
				// No widget values to map; strip the empty/no-array field so the
				// /prompt API doesn't choke on unexpected properties.
				delete node.widgets_values
				continue
			}

			if (!node.inputs || typeof node.inputs !== "object") {
				node.inputs = {}
			}

			// Map known widget values to named inputs based on the static order.
			for (let i = 0; i < Math.min(inputOrder.length, widgets.length); i++) {
				const inputName = inputOrder[i]
				// Only set if not already defined (connection inputs take priority)
				if (!(inputName in node.inputs)) {
					node.inputs[inputName] = widgets[i]
				}
			}

			// Strip widgets_values after mapping — the /prompt API expects values
			// under `inputs`, not as a separate array.
			delete node.widgets_values
		}
	}

	// --------------------------------------------------------------------------
	// Node discovery
	// --------------------------------------------------------------------------

	/**
	 * Find a workflow node whose `_meta.title` exactly matches the given title.
	 * Returns the node object, or `undefined` if no match is found.
	 */
	static findNodeByTitle(workflow: any, title: string): any | undefined {
		for (const key of Object.keys(workflow)) {
			const node = workflow[key]
			if (node?._meta?.title === title) {
				return node
			}
		}
		return undefined
	}

	/**
	 * Find a workflow node by its `class_type`. Useful for workflows that
	 * don't yet have `_meta.title` fields.
	 * Returns the node object, or `undefined` if no match is found.
	 */
	static findNodeByClassType(workflow: any, classType: string): any | undefined {
		for (const key of Object.keys(workflow)) {
			const node = workflow[key]
			if (node?.class_type === classType) {
				return node
			}
		}
		return undefined
	}

	/**
	 * Find the primary sampler node in a workflow — either KSampler (standard
	 * workflows) or SamplerCustom (flash/turbo workflows).  The sampler node
	 * has `positive` and `negative` connection inputs that tell us which
	 * CLIPTextEncode nodes feed the positive and negative conditionings.
	 *
	 * Returns the first matching node, or `undefined` if neither exists.
	 */
	private static findSamplerNode(workflow: any): any | undefined {
		return (
			WorkflowEngine.findNodeByClassType(workflow, "KSampler") ??
			WorkflowEngine.findNodeByClassType(workflow, "SamplerCustom")
		)
	}

	/**
	 * Find a CLIPTextEncode node by tracing a **connection** from a sampler
	 * node's named input.
	 *
	 * In ComfyUI's object-format workflow, connections are stored as
	 * `[sourceNodeId, sourceSlot]` tuples on the **target** node's inputs.
	 * For example, `KSampler.inputs.positive = ["2", 0]` means "node 2, slot 0".
	 *
	 * This is more reliable than title-based lookup because it follows the
	 * actual data flow — just like ComfyUI itself does.  The `_meta.title`
	 * field is only a UI label and may not reflect the actual wiring.
	 */
	private static findCLIPTextEncodeByConnection(workflow: any, samplerNode: any, inputName: string): any | undefined {
		if (!samplerNode?.inputs) return undefined

		const connection = samplerNode.inputs[inputName]
		if (!Array.isArray(connection) || connection.length < 1) return undefined

		const nodeId = String(connection[0])
		const node = workflow[nodeId]
		if (!node || node.class_type !== "CLIPTextEncode") return undefined

		return node
	}

	// --------------------------------------------------------------------------
	// Injectors — txt2img (connection-based with title fallback)
	// --------------------------------------------------------------------------

	/**
	 * Try to find a node by title first, then fall back to class_type.
	 * This ensures compatibility with both new (title-tagged) and legacy workflows.
	 */
	private static findNode(workflow: any, title: string, classType?: string): any | undefined {
		const byTitle = WorkflowEngine.findNodeByTitle(workflow, title)
		if (byTitle) return byTitle
		if (classType) return WorkflowEngine.findNodeByClassType(workflow, classType)
		return undefined
	}

	/**
	 * Inject a prompt (positive conditioning) into the correct CLIPTextEncode
	 * node by tracing the sampler's `positive` connection.
	 *
	 * Strategy (in priority order):
	 *  1. **Connection-based lookup** — find the sampler node (KSampler /
	 *     SamplerCustom), read its `inputs.positive` connection tuple, and
	 *     inject into the CLIPTextEncode node at the other end.
	 *  2. **Title-based fallback** — find a node titled "Positive Prompt",
	 *     or any CLIPTextEncode node as a last resort.
	 *
	 * Strategy 1 correctly handles user-imported workflows where the
	 * CLIPTextEncode `_meta.title` doesn't match the sampler wiring but the
	 * workflow works fine in ComfyUI (because ComfyUI follows connections,
	 * not titles).
	 */
	static injectPrompt(workflow: any, prompt: string): void {
		// 1) Connection-based lookup — trace from sampler's positive input
		const sampler = WorkflowEngine.findSamplerNode(workflow)
		const byConnection = sampler
			? WorkflowEngine.findCLIPTextEncodeByConnection(workflow, sampler, "positive")
			: undefined
		if (byConnection) {
			if (byConnection.inputs?.text !== undefined) {
				byConnection.inputs.text = prompt
				return
			}
		}

		// 2) Fallback: title-based lookup (backward compat)
		const node = WorkflowEngine.findNode(workflow, "Positive Prompt", "CLIPTextEncode")
		if (!node) {
			console.error(
				`[WorkflowEngine] injectPrompt: Could NOT find any CLIPTextEncode node — prompt "${prompt.slice(0, 50)}..." was NOT injected!`,
			)
			return
		}
		if (node.inputs?.text !== undefined) {
			node.inputs.text = prompt
		}
	}

	/**
	 * Inject a negative prompt into the correct CLIPTextEncode node by tracing
	 * the sampler's `negative` connection.
	 *
	 * **Mirror always appends a default negative prompt** (blurry, low quality,
	 * watermark, etc.) after the user's negative text, so common artefacts are
	 * suppressed without overriding the user's intent.
	 *
	 * Strategy (same priority as injectPrompt):
	 *  1. **Connection-based lookup** — trace from sampler's `negative` input
	 *  2. **Title-based fallback** — find a node titled "Negative Prompt",
	 *     or any CLIPTextEncode node as a last resort.
	 */
	static injectNegativePrompt(workflow: any, negativePrompt: string): void {
		const text = negativePrompt ? `${negativePrompt}, ${DEFAULT_NEGATIVE_PROMPT}` : DEFAULT_NEGATIVE_PROMPT

		// 1) Connection-based lookup — trace from sampler's negative input
		const sampler = WorkflowEngine.findSamplerNode(workflow)
		const byConnection = sampler
			? WorkflowEngine.findCLIPTextEncodeByConnection(workflow, sampler, "negative")
			: undefined
		if (byConnection) {
			if (byConnection.inputs?.text !== undefined) {
				byConnection.inputs.text = text
				return
			}
		}

		// 2) Fallback: title-based lookup (backward compat)
		const node = WorkflowEngine.findNode(workflow, "Negative Prompt", "CLIPTextEncode")
		if (!node) {
			console.error(
				`[WorkflowEngine] injectNegativePrompt: Could NOT find any CLIPTextEncode node — negative prompt was NOT injected!`,
			)
			return
		}
		if (node.inputs?.text !== undefined) {
			node.inputs.text = text
		}
	}

	/**
	 * Set the checkpoint / model via the "Load Checkpoint" node.
	 */
	static injectModel(workflow: any, model: string): void {
		const node = WorkflowEngine.findNode(workflow, "Load Checkpoint", "CheckpointLoaderSimple")
		if (node?.inputs) {
			// ComfyUI CheckpointLoaderSimple expects the exact filename including extension.
			const modelName =
				model.endsWith(".safetensors") || model.endsWith(".ckpt") || model.endsWith(".pt")
					? model
					: `${model}.safetensors`
			node.inputs.ckpt_name = modelName
		}
	}

	/**
	 * Set the random seed.
	 *
	 * Tries in order:
	 *  1. `KSampler` node (standard workflows) — `inputs.seed`
	 *  2. `SamplerCustom` node (flash/turbo workflows) — `inputs.noise_seed`
	 */
	static injectSeed(workflow: any, seed: number): void {
		// 1) Try KSampler (standard workflows)
		const ksampler = WorkflowEngine.findNode(workflow, "KSampler", "KSampler")
		if (ksampler?.inputs?.seed !== undefined) {
			ksampler.inputs.seed = seed
			return
		}

		// 2) Fall back to SamplerCustom (flash/turbo workflows)
		//    After populateWidgetInputs() the widget values are in inputs.noise_seed
		const custom = WorkflowEngine.findNodeByClassType(workflow, "SamplerCustom")
		if (custom?.inputs?.noise_seed !== undefined) {
			custom.inputs.noise_seed = seed
		}
	}

	/**
	 * Set image dimensions (width, height) on the "Empty Latent Image" node.
	 */
	static injectDimensions(workflow: any, width: number, height: number): void {
		const node = WorkflowEngine.findNode(workflow, "Empty Latent Image", "EmptyLatentImage")
		if (node?.inputs) {
			node.inputs.width = width
			node.inputs.height = height
		}
	}

	/**
	 * Set the sampler name on the "KSampler" node (e.g. "euler", "euler_ancestral", "dpmpp_2m").
	 *
	 * For flash/turbo workflows, the sampler is set via `KSamplerSelect.inputs.sampler_name`.
	 */
	static injectSampler(workflow: any, samplerName: string): void {
		// 1) Try KSampler (standard workflows)
		const ksampler = WorkflowEngine.findNode(workflow, "KSampler", "KSampler")
		if (ksampler?.inputs?.sampler_name !== undefined) {
			ksampler.inputs.sampler_name = samplerName
			return
		}

		// 2) Fall back to KSamplerSelect (flash/turbo workflows)
		//    After populateWidgetInputs() the widget value is in inputs.sampler_name
		const selector = WorkflowEngine.findNodeByClassType(workflow, "KSamplerSelect")
		if (selector?.inputs?.sampler_name !== undefined) {
			selector.inputs.sampler_name = samplerName
		}
	}

	/**
	 * Set the scheduler on the "KSampler" node (e.g. "normal", "sgm_uniform", "karras").
	 */
	static injectScheduler(workflow: any, scheduler: string): void {
		const node = WorkflowEngine.findNode(workflow, "KSampler", "KSampler")
		if (node?.inputs) {
			node.inputs.scheduler = scheduler
		}
	}

	/**
	 * Set the CFG scale on the "KSampler" node.
	 */
	static injectCFG(workflow: any, cfg: number): void {
		const node = WorkflowEngine.findNode(workflow, "KSampler", "KSampler")
		if (node?.inputs) {
			node.inputs.cfg = cfg
		}
	}

	/**
	 * Set the step count.
	 *
	 * Tries in order:
	 *  1. `KSampler` node (standard workflows) — `inputs.steps`
	 *  2. `SDTurboScheduler` node (flash/turbo workflows) — `inputs.steps`
	 */
	static injectSteps(workflow: any, steps: number): void {
		// 1) Try KSampler (standard workflows)
		const ksampler = WorkflowEngine.findNode(workflow, "KSampler", "KSampler")
		if (ksampler?.inputs?.steps !== undefined) {
			ksampler.inputs.steps = steps
			return
		}

		// 2) Fall back to SDTurboScheduler (flash/turbo workflows)
		//    After populateWidgetInputs() the widget value is in inputs.steps
		const turbo = WorkflowEngine.findNodeByClassType(workflow, "SDTurboScheduler")
		if (turbo?.inputs?.steps !== undefined) {
			turbo.inputs.steps = steps
		}
	}

	// --------------------------------------------------------------------------
	// Injectors — img2img / inpaint / upscale (title-based with class_type fallback)
	// --------------------------------------------------------------------------

	/**
	 * Inject an input image filename (for img2img workflows).
	 * Finds the "Load Image" node by title, falling back to class_type.
	 */
	static injectImage(workflow: any, imageName: string): void {
		const node =
			WorkflowEngine.findNodeByTitle(workflow, "Load Image") ??
			WorkflowEngine.findNodeByClassType(workflow, "LoadImage")
		if (node?.inputs) {
			node.inputs.image = imageName
		}
	}

	/**
	 * Inject a mask image filename (for inpaint workflows).
	 * Finds the "Load Mask" node by title, falling back to the second LoadImage node.
	 */
	static injectMask(workflow: any, maskName: string): void {
		// 1) Try title-based lookup
		const byTitle = WorkflowEngine.findNodeByTitle(workflow, "Load Mask")
		if (byTitle?.inputs) {
			byTitle.inputs.image = maskName
			return
		}

		// 2) Fallback: second LoadImage by class_type
		let foundFirst = false
		for (const key of Object.keys(workflow)) {
			const node = workflow[key]
			if (node?.class_type === "LoadImage") {
				if (!foundFirst) {
					foundFirst = true
					continue
				}
				if (node?.inputs) {
					node.inputs.image = maskName
				}
				return
			}
		}

		// 3) Last resort: single LoadImage
		const single = WorkflowEngine.findNodeByClassType(workflow, "LoadImage")
		if (single?.inputs) {
			single.inputs.image = maskName
		}
	}

	/**
	 * Inject upscale factor (for upscale workflows).
	 * Finds the "Upscale Image" node by title, falling back to class_type.
	 */
	static injectUpscaleFactor(workflow: any, factor: number): void {
		const node =
			WorkflowEngine.findNodeByTitle(workflow, "Upscale Image") ??
			WorkflowEngine.findNodeByClassType(workflow, "ImageUpscaleWithModel") ??
			WorkflowEngine.findNodeByClassType(workflow, "ImageScale")
		if (!node?.inputs) return

		if (node.inputs.upscale_by !== undefined) {
			node.inputs.upscale_by = factor
		} else if (node.inputs.width) {
			// If width/height based, scale them
			const dimNode = WorkflowEngine.findNodeByTitle(workflow, "Empty Latent Image")
			const origWidth = dimNode?.inputs?.width || 512
			const origHeight = dimNode?.inputs?.height || 512
			node.inputs.width = Math.round(origWidth * factor)
			node.inputs.height = Math.round((origWidth * factor) / (origWidth / origHeight))
		}
	}
}

/**
 * PipelineRegistry — discovers, caches, and resolves ComfyUI workflow pipelines.
 *
 * ## Discovery sources (precedence: project > global > comfyui > builtin)
 *
 *  1. **Built-in** — `src/services/image-runtime/workflows/*.json`
 *     Metadata comes from `pipeline-meta.json` manifest.
 *
 *  2. **ComfyUI** — `~/.mirror/pipelines/comfyui/*.json`
 *     Imported from ComfyUI's `user/default/workflows/` directory.
 *     Same format as global; overrides built-in with the same slug.
 *
 *  3. **Global** — `~/.mirror/pipelines/*.json`
 *     Metadata comes from `_pipeline` header inside each JSON file.
 *     Overrides comfyui & builtin.
 *
 *  4. **Project** — `<cwd>/.mirror/pipelines/*.json`
 *     Same format as global; overrides all others.
 *
 * ## Usage
 *
 * ```ts
 * const pipeline = PipelineRegistry.resolve("txt2img-flash", "generate")
 * const workflow = pipeline.workflow
 * WorkflowEngine.injectPrompt(workflow, prompt)
 * ```
 *
 * ## Auto-selection
 *
 * When no pipeline slug is specified, `autoSelect()` picks the best match
 * based on tags and task context:
 *   - Tags ["fast", "logo", "icon", "quick", "draft"] → flash pipeline
 *   - Otherwise → default pipeline for the type
 */
import * as fs from "fs"
import * as fsp from "fs/promises"
import * as path from "path"
import { getGlobalMirrorDirectory } from "../../services/mirror-config"
import { logger } from "../../utils/logging"
import type { PipelineDefinition, PipelineMetadata, PipelineSource, PipelineType, ComfyUIWorkflow } from "./pipeline"
import { extractPipelineMetadata, stripPipelineHeader, guessPipelineType } from "./pipeline"
import type { PipelineAllowlists } from "../../shared/allowlists"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PIPELINES_SUBDIR = "pipelines"

/** Keywords that hint at "fast / draft / logo" generation. */
const FAST_KEYWORDS = ["fast", "logo", "icon", "quick", "draft", "placeholder", "thumbnail"]

/** Model name keywords that hint a turbo/fast pipeline is required. */
const TURBO_KEYWORDS = ["turbo", "flash", "sdxl turbo", "sd_xl_turbo"]

// ---------------------------------------------------------------------------
// Built-in pipeline manifest
// ---------------------------------------------------------------------------

interface BuiltinManifest {
	[slug: string]: {
		name: string
		description: string
		type: PipelineType
		tags: string[]
		isDefault?: boolean
	}
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export class PipelineRegistry {
	/** Cache: slug → PipelineDefinition */
	private static cache = new Map<string, PipelineDefinition>()

	/** Reverse index: type → slug[] */
	private static byType = new Map<PipelineType, string[]>()

	/** Whether discovery has been run at least once. */
	private static initialized = false

	/** File watchers (vscode.FileSystemWatcher) — stored for disposal. */
	private static watchers: { dispose: () => void }[] = []

	/** User-defined default overrides: type → slug. Session-scoped. */
	private static userDefaults = new Map<PipelineType, string>()

	/**
	 * Pipelines the user has chosen to hide/remove from view.
	 * Built-in pipelines cannot be physically deleted, but they can be
	 * soft-deleted by adding their slug to this set.
	 * Persisted to global state as `hiddenPipelines`.
	 */
	private static hiddenPipelines = new Set<string>()

	// ------------------------------------------------------------------
	// Initialization & discovery
	// ------------------------------------------------------------------

	/**
	 * Initialize the registry: discover all pipelines from all sources.
	 * Safe to call multiple times — subsequent calls re-discover.
	 *
	 * @param defaults - Optional persisted user default overrides (type → slug)
	 *                   to restore after discovery. Typically from `comfyuiDefaultPipelines` global state.
	 * @param hidden   - Optional list of pipeline slugs to hide (soft-delete).
	 *                   Typically from `hiddenPipelines` global state.
	 */
	static async initialize(cwd?: string, defaults?: Record<string, string>, hidden?: string[]): Promise<void> {
		this.cache.clear()
		this.byType.clear()

		// 1) (Skipped: built-in pipelines no longer auto-loaded)
		//    Users import their own pipelines per channel manually.

		// 2) ComfyUI-imported pipelines (~/.mirror/pipelines/comfyui/)
		await this.discoverFromDirectory(this.getComfyuiPipelinesDir(), "comfyui")

		// 3) Global pipelines (~/.mirror/pipelines/)
		await this.discoverFromDirectory(this.getGlobalPipelinesDir(), "global")

		// 4) Project pipelines (.mirror/pipelines/)
		if (cwd) {
			await this.discoverFromDirectory(this.getProjectPipelinesDir(cwd), "project")
		}

		// 5) Restore user-defined default overrides from persisted state
		if (defaults) {
			this.userDefaults.clear()
			for (const [type, slug] of Object.entries(defaults)) {
				if (this.cache.has(slug)) {
					this.userDefaults.set(type as PipelineType, slug)
				}
			}
		}

		// 6) Restore hidden pipelines from persisted state
		if (hidden) {
			this.hiddenPipelines = new Set(hidden)
		}

		this.initialized = true
		logger.info(
			`[PipelineRegistry] Discovered ${this.cache.size} pipelines: ${Array.from(this.cache.keys()).join(", ")}`,
		)
	}

	/**
	 * Restore user-defined default overrides from persisted global state.
	 * Safe to call even after initialization — does not clear existing user defaults
	 * unless explicitly provided. Callers should pass the persisted
	 * `comfyuiDefaultPipelines` and `hiddenPipelines` from global state.
	 */
	static restorePersistedDefaults(defaults: Record<string, string>, hidden: string[]): void {
		// Restore user-defined default overrides
		this.userDefaults.clear()
		for (const [type, slug] of Object.entries(defaults)) {
			if (this.cache.has(slug)) {
				this.userDefaults.set(type as PipelineType, slug)
			}
		}

		// Restore hidden pipelines
		this.hiddenPipelines = new Set(hidden)

		logger.info(
			`[PipelineRegistry] Restored ${Object.keys(defaults).length} user defaults, ${hidden.length} hidden pipelines`,
		)
	}

	/**
	 * Discover built-in pipelines from the workflows directory.
	 * Uses `pipeline-meta.json` manifest for metadata.
	 */
	private static async discoverBuiltin(): Promise<void> {
		const workflowsDir = this.resolveWorkflowsDir()
		const manifestPath = path.join(workflowsDir, "pipeline-meta.json")

		let manifest: BuiltinManifest = {}
		try {
			const raw = await fsp.readFile(manifestPath, "utf-8")
			manifest = JSON.parse(raw)
		} catch {
			logger.warn("[PipelineRegistry] No pipeline-meta.json found — built-in pipelines will use guessed metadata")
		}

		let files: string[]
		try {
			files = await fsp.readdir(workflowsDir)
		} catch {
			logger.error(`[PipelineRegistry] Cannot read workflows directory: ${workflowsDir}`)
			return
		}

		for (const file of files) {
			if (!file.endsWith(".json") || file === "pipeline-meta.json") continue

			const slug = file.replace(/\.json$/, "")
			const filePath = path.join(workflowsDir, file)

			try {
				const raw = JSON.parse(await fsp.readFile(filePath, "utf-8"))
				const workflow = raw as ComfyUIWorkflow

				// Metadata: manifest > _pipeline header > guessed
				const metaFromManifest = manifest[slug]
				const metaFromHeader = extractPipelineMetadata(raw)
				const meta: PipelineMetadata = metaFromManifest
					? {
							name: metaFromManifest.name,
							description: metaFromManifest.description,
							type: metaFromManifest.type,
							tags: metaFromManifest.tags,
							isDefault: metaFromManifest.isDefault ?? false,
						}
					: (metaFromHeader ?? {
							name: slug,
							description: "",
							type: guessPipelineType(workflow),
							tags: [],
							isDefault: false,
						})

				const def: PipelineDefinition = {
					slug,
					name: meta.name,
					description: meta.description,
					type: meta.type,
					tags: meta.tags,
					source: "builtin",
					isDefault: meta.isDefault ?? false,
					workflow: stripPipelineHeader(raw),
				}

				this.cache.set(slug, def)
				this.indexByType(def)
			} catch (err) {
				logger.error(`[PipelineRegistry] Failed to load built-in pipeline ${file}: ${err}`)
			}
		}
	}

	/**
	 * Discover pipelines from a user directory (global or project).
	 * Metadata comes from `_pipeline` header inside each JSON file.
	 */
	private static async discoverFromDirectory(dir: string, source: PipelineSource): Promise<void> {
		let files: string[]
		try {
			await fsp.access(dir)
			files = await fsp.readdir(dir)
		} catch {
			// Directory doesn't exist — that's fine
			return
		}

		for (const file of files) {
			if (!file.endsWith(".json")) continue

			const slug = file.replace(/\.json$/, "")
			const filePath = path.join(dir, file)

			try {
				const raw = JSON.parse(await fsp.readFile(filePath, "utf-8"))
				const workflow = raw as ComfyUIWorkflow
				const meta = extractPipelineMetadata(raw) ?? {
					name: slug,
					description: "",
					type: guessPipelineType(workflow),
					tags: [],
					isDefault: false,
				}

				const def: PipelineDefinition = {
					slug,
					name: meta.name,
					description: meta.description,
					type: meta.type,
					tags: meta.tags,
					source,
					isDefault: meta.isDefault ?? false,
					workflow: stripPipelineHeader(raw),
				}

				// Project overrides global & builtin; global overrides builtin
				const existing = this.cache.get(slug)
				if (existing && this.getSourcePriority(source) <= this.getSourcePriority(existing.source)) {
					continue // existing has equal or higher priority
				}

				this.cache.set(slug, def)
				this.indexByType(def)
			} catch (err) {
				logger.error(`[PipelineRegistry] Failed to load ${source} pipeline ${file}: ${err}`)
			}
		}
	}

	// ------------------------------------------------------------------
	// Source priority
	// ------------------------------------------------------------------

	private static getSourcePriority(source: PipelineSource): number {
		switch (source) {
			case "project":
				return 4
			case "global":
				return 3
			case "comfyui":
				return 2
			case "builtin":
				return 1
		}
	}

	// ------------------------------------------------------------------
	// Indexing
	// ------------------------------------------------------------------

	private static indexByType(def: PipelineDefinition): void {
		const slugs = this.byType.get(def.type) ?? []
		if (!slugs.includes(def.slug)) {
			slugs.push(def.slug)
		}
		this.byType.set(def.type, slugs)
	}

	// ------------------------------------------------------------------
	// Public API
	// ------------------------------------------------------------------

	/**
	 * Resolve a pipeline by slug, optionally filtered by type.
	 * Throws if the pipeline is not found or the type doesn't match.
	 */
	static resolve(slug: string, expectedType?: PipelineType): PipelineDefinition {
		if (!this.initialized) {
			throw new Error("[PipelineRegistry] Not initialized. Call initialize() first.")
		}

		const def = this.cache.get(slug)
		if (!def) {
			throw new Error(
				`[PipelineRegistry] Pipeline "${slug}" not found. Available: ${Array.from(this.cache.keys()).join(", ")}`,
			)
		}

		if (expectedType && def.type !== expectedType) {
			throw new Error(
				`[PipelineRegistry] Pipeline "${slug}" is type "${def.type}", but "${expectedType}" was expected.`,
			)
		}

		return def
	}

	/**
	 * Auto-select the best pipeline for a given type and task description.
	 *
	 * Heuristics:
	 *  1. User-defined default overrides everything else.
	 *  2. Allowlist filtering (global + per-model) narrows candidates.
	 *  3. If the model name contains turbo/flash keywords → pick a pipeline tagged "fast" or "turbo".
	 *  4. If the task description contains fast/logo/icon keywords → pick a pipeline tagged "fast".
	 *  5. Otherwise → pick the default pipeline for the type.
	 *  6. Fallback → first pipeline of the type.
	 *
	 * @param modelName - Optional model name (e.g. "sd_xl_turbo") to auto-select a compatible pipeline.
	 * @param allowlists - Optional allowlists to restrict which pipelines are available.
	 */
	static autoSelect(
		taskDescription: string,
		type: PipelineType,
		modelName?: string,
		allowlists?: PipelineAllowlists,
	): PipelineDefinition {
		if (!this.initialized) {
			throw new Error("[PipelineRegistry] Not initialized. Call initialize() first.")
		}

		let candidates = this.listByType(type)
		if (candidates.length === 0) {
			throw new Error(`[PipelineRegistry] No pipelines available for type "${type}"`)
		}

		// 0) User-defined default overrides everything else
		const userDefaultSlug = this.userDefaults.get(type)
		if (userDefaultSlug) {
			const userDefault = this.cache.get(userDefaultSlug)
			if (userDefault && userDefault.type === type) return userDefault
		}

		// 0a) Apply global allowlist
		if (allowlists?.allowedPipelines?.length) {
			const allowed = allowlists.allowedPipelines
			candidates = candidates.filter((p) => allowed.includes(p.slug))
		}

		// 0b) Apply per-model allowlist
		if (modelName && allowlists?.modelPipelineAllowlist?.[modelName]?.length) {
			const modelAllowed = allowlists.modelPipelineAllowlist[modelName]
			candidates = candidates.filter((p) => modelAllowed.includes(p.slug))
		}

		// If no candidates remain after filtering and an explicit allowlist is active,
		// throw rather than silently falling back to defaults — that would defeat
		// the purpose of the allowlist.
		if (candidates.length === 0) {
			if (allowlists?.allowedPipelines) {
				throw new Error(
					`[PipelineRegistry] All pipelines for type "${type}" are blocked by the global allowlist. ` +
						"Unblock at least one pipeline or reset the allowlist to allow all.",
				)
			}
			// Fall back to unfiltered defaults (only when no allowlist is active)
			candidates = this.listByType(type).filter((p) => p.isDefault)
			if (candidates.length === 0) {
				candidates = this.listByType(type)
			}
		}

		// Check if the model name hints at turbo/fast generation (higher priority than prompt keywords)
		if (modelName) {
			const modelLower = modelName.toLowerCase()
			const isTurboModel = TURBO_KEYWORDS.some((kw) => modelLower.includes(kw))
			if (isTurboModel) {
				const turbo = candidates.find((p) => p.tags.some((t) => t === "turbo" || t === "fast"))
				if (turbo) return turbo
			}
		}

		// Check if task description hints at fast/draft generation
		const lower = taskDescription.toLowerCase()
		const wantsFast = FAST_KEYWORDS.some((kw) => lower.includes(kw))

		if (wantsFast) {
			const fast = candidates.find((p) => p.tags.some((t) => FAST_KEYWORDS.includes(t)))
			if (fast) return fast
		}

		// Default pipeline for the type
		const defaultPipeline = candidates.find((p) => p.isDefault)
		if (defaultPipeline) return defaultPipeline

		// Fallback: first candidate
		return candidates[0]
	}

	/**
	 * List all pipelines for a given type, excluding hidden (soft-deleted) ones.
	 */
	static listByType(type: PipelineType): PipelineDefinition[] {
		const slugs = this.byType.get(type) ?? []
		return slugs.map((slug) => this.cache.get(slug)!).filter((p) => !this.hiddenPipelines.has(p.slug))
	}

	/**
	 * List all discovered pipelines (including hidden ones when `includeHidden` is true).
	 */
	static listAll(includeHidden: boolean = false): PipelineDefinition[] {
		const all = Array.from(this.cache.values())
		return includeHidden ? all : all.filter((p) => !this.hiddenPipelines.has(p.slug))
	}

	/**
	 * Check if a pipeline slug exists.
	 */
	static exists(slug: string): boolean {
		return this.cache.has(slug)
	}

	// ------------------------------------------------------------------
	// Import / Export
	// ------------------------------------------------------------------

	/**
	 * Import a pipeline from raw JSON content.
	 * Saves to the project `.mirror/pipelines/` directory (or global if no workspace).
	 *
	 * @param jsonContent - The raw JSON string
	 * @param cwd - Current workspace directory (for project-level save)
	 * @returns The slug of the imported pipeline
	 */
	static async importPipeline(jsonContent: string, cwd?: string): Promise<string> {
		let raw: any
		try {
			raw = JSON.parse(jsonContent)
		} catch {
			throw new Error("Invalid JSON content")
		}

		// Extract or generate metadata
		const meta = extractPipelineMetadata(raw)
		const workflow = stripPipelineHeader(raw) as ComfyUIWorkflow
		const type = meta?.type ?? guessPipelineType(workflow)
		const slug = meta?.name ? this.slugify(meta.name) : `pipeline-${Date.now()}`

		// Determine save directory
		const saveDir = cwd ? this.getProjectPipelinesDir(cwd) : this.getGlobalPipelinesDir()

		await fsp.mkdir(saveDir, { recursive: true })

		// Add _pipeline header if not present
		const toSave: any = {
			_pipeline: {
				name: meta?.name ?? slug,
				description: meta?.description ?? "",
				type,
				tags: meta?.tags ?? [],
				isDefault: meta?.isDefault ?? false,
			},
			...(Array.isArray(workflow) ? {} : workflow),
		}

		// If workflow is legacy array format, spread nodes/links etc
		if (isLegacyArrayWorkflow(workflow)) {
			toSave.nodes = (workflow as any).nodes
			toSave.links = (workflow as any).links
			if ((workflow as any).groups) toSave.groups = (workflow as any).groups
			if ((workflow as any).extra) toSave.extra = (workflow as any).extra
		}

		const filePath = path.join(saveDir, `${slug}.json`)
		await fsp.writeFile(filePath, JSON.stringify(toSave, null, 2), "utf-8")

		// Add to cache
		const def: PipelineDefinition = {
			slug,
			name: meta?.name ?? slug,
			description: meta?.description ?? "",
			type,
			tags: meta?.tags ?? [],
			source: cwd ? "project" : "global",
			isDefault: meta?.isDefault ?? false,
			workflow,
		}
		this.cache.set(slug, def)
		this.indexByType(def)

		logger.info(`[PipelineRegistry] Imported pipeline "${slug}" to ${filePath}`)
		return slug
	}

	/**
	 * Delete a pipeline by slug.
	 * Only user-added pipelines (global or project) can be deleted.
	 * Built-in pipelines cannot be physically deleted; use `hidePipeline()` to soft-delete them.
	 */
	static async deletePipeline(slug: string, cwd?: string): Promise<void> {
		const def = this.cache.get(slug)
		if (!def) {
			throw new Error(`[PipelineRegistry] Pipeline "${slug}" not found`)
		}
		if (def.source === "builtin") {
			throw new Error(
				`[PipelineRegistry] Cannot delete built-in pipeline "${slug}". Use hidePipeline() to soft-delete instead.`,
			)
		}

		const dir = def.source === "project" && cwd ? this.getProjectPipelinesDir(cwd) : this.getGlobalPipelinesDir()

		const filePath = path.join(dir, `${slug}.json`)
		try {
			await fsp.unlink(filePath)
		} catch {
			// File may already be gone
		}

		this.cache.delete(slug)
		this.hiddenPipelines.delete(slug)
		// Rebuild type index
		this.byType.clear()
		for (const [, d] of this.cache) {
			this.indexByType(d)
		}

		logger.info(`[PipelineRegistry] Deleted pipeline "${slug}"`)
	}

	// ------------------------------------------------------------------
	// Hide / Unhide (soft-delete for built-in pipelines)
	// ------------------------------------------------------------------

	/**
	 * Hide (soft-delete) a pipeline. The pipeline remains in the cache but
	 * is excluded from `listByType()` and `autoSelect()` results.
	 * Useful for removing built-in pipelines from view without deleting them.
	 */
	static hidePipeline(slug: string): void {
		if (!this.cache.has(slug)) {
			throw new Error(`[PipelineRegistry] Pipeline "${slug}" not found`)
		}
		this.hiddenPipelines.add(slug)
		logger.info(`[PipelineRegistry] Hidden pipeline "${slug}"`)
	}

	/**
	 * Unhide a previously hidden pipeline, making it visible again.
	 */
	static unhidePipeline(slug: string): void {
		if (!this.hiddenPipelines.has(slug)) {
			throw new Error(`[PipelineRegistry] Pipeline "${slug}" is not hidden`)
		}
		this.hiddenPipelines.delete(slug)
		logger.info(`[PipelineRegistry] Unhidden pipeline "${slug}"`)
	}

	/**
	 * Check if a pipeline is hidden (soft-deleted).
	 */
	static isHidden(slug: string): boolean {
		return this.hiddenPipelines.has(slug)
	}

	/**
	 * Get the list of hidden pipeline slugs.
	 */
	static getHiddenPipelines(): string[] {
		return Array.from(this.hiddenPipelines)
	}

	// ------------------------------------------------------------------
	// Directory helpers
	// ------------------------------------------------------------------

	private static getComfyuiPipelinesDir(): string {
		return path.join(getGlobalMirrorDirectory(), PIPELINES_SUBDIR, "comfyui")
	}

	private static getGlobalPipelinesDir(): string {
		return path.join(getGlobalMirrorDirectory(), PIPELINES_SUBDIR)
	}

	private static getProjectPipelinesDir(cwd: string): string {
		return path.join(cwd, ".mirror", PIPELINES_SUBDIR)
	}

	/**
	 * Resolve the built-in workflows directory.
	 * Mirrors the logic in WorkflowEngine.resolveWorkflowsDir().
	 */
	private static resolveWorkflowsDir(): string {
		// During dev: __dirname = src/services/image-runtime/workflows/
		const devPath = path.join(__dirname, "..", "..", "..", "services", "image-runtime", "workflows")
		if (fs.existsSync(path.join(devPath, "txt2img.json"))) {
			return devPath
		}
		// During dev (alternative): __dirname = src/api/image/
		const devPath2 = path.join(__dirname, "..", "..", "..", "services", "image-runtime", "workflows")
		if (fs.existsSync(path.join(devPath2, "txt2img.json"))) {
			return devPath2
		}
		// Bundled: workflows copied to dist/workflows/
		const bundledPath = path.join(__dirname, "workflows")
		if (fs.existsSync(path.join(bundledPath, "txt2img.json"))) {
			return bundledPath
		}
		// Fallback: relative to cwd
		const cwdPath = path.join(process.cwd(), "src", "services", "image-runtime", "workflows")
		if (fs.existsSync(path.join(cwdPath, "txt2img.json"))) {
			return cwdPath
		}
		throw new Error(
			`[PipelineRegistry] Cannot locate built-in workflow directory. Tried: ${devPath}, ${bundledPath}, ${cwdPath}`,
		)
	}

	// ------------------------------------------------------------------
	// Utilities
	// ------------------------------------------------------------------

	/**
	 * Convert a human-readable name to a filesystem-safe slug.
	 */
	private static slugify(name: string): string {
		return (
			name
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "-")
				.replace(/^-+|-+$/g, "") || "pipeline"
		)
	}

	// ------------------------------------------------------------------
	// Lifecycle
	// ------------------------------------------------------------------

	/**
	 * Reset the registry (for testing).
	 */
	/**
	 * Set a user-defined default pipeline for a given type.
	 * Session-scoped — callers should also persist via global state if needed.
	 */
	static setUserDefault(type: PipelineType, slug: string): void {
		if (this.cache.has(slug)) {
			this.userDefaults.set(type, slug)
		}
	}

	/**
	 * Get the user-defined default pipeline slug for a given type.
	 * Returns undefined if no user preference has been set.
	 */
	static getUserDefault(type: PipelineType): string | undefined {
		return this.userDefaults.get(type)
	}

	static reset(): void {
		this.cache.clear()
		this.byType.clear()
		this.userDefaults.clear()
		this.hiddenPipelines.clear()
		this.initialized = false
		this.disposeWatchers()
	}

	/**
	 * Dispose file watchers.
	 */
	static dispose(): void {
		this.disposeWatchers()
		this.reset()
	}

	private static disposeWatchers(): void {
		for (const w of this.watchers) {
			try {
				w.dispose()
			} catch {
				/* ignore */
			}
		}
		this.watchers = []
	}

	/** Whether the registry has been initialized. */
	static isInitialized(): boolean {
		return this.initialized
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isLegacyArrayWorkflow(workflow: any): boolean {
	return workflow && typeof workflow === "object" && Array.isArray(workflow.nodes)
}

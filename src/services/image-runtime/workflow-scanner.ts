/**
 * workflow-scanner.ts — Scans a ComfyUI install directory for user-saved
 * workflow files and imports them into the PipelineRegistry's persistent
 * comfyui pipeline directory (~/.mirror/pipelines/comfyui/).
 *
 * ## Discovery path
 *
 * ComfyUI saves user workflows in:
 *   {comfyUISrcPath}/user/default/workflows/
 *
 * Where comfyUISrcPath is:
 *   - macOS/Linux: {installPath}/ComfyUI
 *   - Windows:     {installPath} (portable archive extracts directly)
 *
 * The scanner reads .json files from this directory, copies them to
 * ~/.mirror/pipelines/comfyui/ for persistence, and the PipelineRegistry
 * picks them up on the next initialize() call.
 */
import * as fsp from "fs/promises"
import * as path from "path"
import * as fs from "fs"
import { getGlobalMirrorDirectory } from "../mirror-config"
import { logger } from "../../utils/logging"
import type { PipelineType } from "../../api/image/pipeline"
import { guessPipelineType } from "../../api/image/pipeline"

/** A workflow discovered in the ComfyUI user workflows directory. */
export interface DiscoveredWorkflow {
	/** Filename (e.g. "my_sdxl_workflow.json") */
	filename: string
	/** Slug derived from filename (e.g. "my_sdxl_workflow") */
	slug: string
	/** Absolute path to the source file */
	path: string
	/** Guessed pipeline type (or "generate" if unknown) */
	guessedType: PipelineType
	/** Whether the workflow has a _pipeline metadata header */
	hasMetadata: boolean
}

/**
 * Scanner for ComfyUI user-saved workflows.
 */
export class WorkflowScanner {
	// ------------------------------------------------------------------
	// Path resolution
	// ------------------------------------------------------------------

	/**
	 * Resolve the ComfyUI source path from an install path.
	 *
	 * - macOS/Linux: `{installPath}/ComfyUI` (git clone creates subdirectory)
	 * - Windows: `{installPath}` (portable archive extracts directly)
	 */
	static getComfyUISrcPath(installPath: string): string {
		return process.platform === "win32" ? installPath : path.join(installPath, "ComfyUI")
	}

	/**
	 * Resolve the user workflows directory from a ComfyUI source path.
	 *
	 * ComfyUI saves user workflows in `{comfyUISrcPath}/user/default/workflows/`.
	 */
	static getUserWorkflowDir(comfyUISrcPath: string): string {
		return path.join(comfyUISrcPath, "user", "default", "workflows")
	}

	/**
	 * Resolve the persistent comfyui pipelines directory.
	 * Returns `~/.mirror/pipelines/comfyui/`.
	 */
	static getComfyuiPipelinesDir(): string {
		return path.join(getGlobalMirrorDirectory(), "pipelines", "comfyui")
	}

	// ------------------------------------------------------------------
	// Scanning & importing
	// ------------------------------------------------------------------

	/**
	 * Scan the ComfyUI user workflows directory for .json workflow files.
	 * Returns metadata about each discovered workflow without modifying anything.
	 *
	 * @param comfyUISrcPath - Path to the ComfyUI source directory
	 *   (or install path; this method computes the src path internally).
	 * @returns Array of discovered workflow metadata
	 */
	static async scan(comfyUISrcPath: string): Promise<DiscoveredWorkflow[]> {
		const workflowsDir = this.getUserWorkflowDir(comfyUISrcPath)

		let files: string[]
		try {
			await fsp.access(workflowsDir)
			files = await fsp.readdir(workflowsDir)
		} catch {
			logger.info(`[WorkflowScanner] No user workflows directory found at ${workflowsDir}`)
			return []
		}

		const results: DiscoveredWorkflow[] = []

		for (const file of files) {
			if (!file.endsWith(".json")) continue

			const filePath = path.join(workflowsDir, file)
			const slug = file.replace(/\.json$/, "")

			try {
				const raw = JSON.parse(await fsp.readFile(filePath, "utf-8"))
				const hasMetadata = !!(raw && typeof raw === "object" && raw._pipeline)
				const guessedType = guessPipelineType(raw)

				results.push({
					filename: file,
					slug,
					path: filePath,
					guessedType,
					hasMetadata,
				})
			} catch (err) {
				logger.warn(`[WorkflowScanner] Failed to parse workflow ${file}: ${err}`)
				// Include it anyway so the user can see it in the UI
				results.push({
					filename: file,
					slug,
					path: filePath,
					guessedType: "generate" as PipelineType,
					hasMetadata: false,
				})
			}
		}

		// Sort by filename for deterministic order
		results.sort((a, b) => a.filename.localeCompare(b.filename))
		return results
	}

	/**
	 * Import a single workflow from the ComfyUI user workflows directory
	 * into the persistent comfyui pipelines directory.
	 *
	 * Copies the .json file to `~/.mirror/pipelines/comfyui/{slug}.json`.
	 *
	 * @param comfyUISrcPath - ComfyUI source path
	 * @param filename - The workflow filename (e.g. "my_sdxl_workflow.json")
	 * @returns The slug of the imported pipeline
	 */
	/**
	 * Import a single workflow from the ComfyUI user workflows directory
	 * into the persistent comfyui pipelines directory.
	 *
	 * Copies the .json file to `~/.mirror/pipelines/comfyui/{slug}.json`.
	 * If `pipelineType` is provided, a `_pipeline` header with that type
	 * is injected into the copied file (overriding any existing header).
	 *
	 * @param comfyUISrcPath - ComfyUI source path
	 * @param filename - The workflow filename (e.g. "my_sdxl_workflow.json")
	 * @param pipelineType - Optional pipeline type to assign (e.g. "generate", "edit", "inpaint")
	 *                       When provided, a _pipeline header is injected into the file.
	 *                       When omitted, the existing header (if any) is preserved.
	 * @returns The slug of the imported pipeline
	 */
	static async importOne(comfyUISrcPath: string, filename: string, pipelineType?: PipelineType): Promise<string> {
		const srcPath = path.join(this.getUserWorkflowDir(comfyUISrcPath), filename)
		const slug = filename.replace(/\.json$/, "")
		const destDir = this.getComfyuiPipelinesDir()

		// Ensure destination directory exists
		await fsp.mkdir(destDir, { recursive: true })

		const destPath = path.join(destDir, `${slug}.json`)

		if (pipelineType) {
			// Inject a _pipeline header with the specified type
			const raw = JSON.parse(await fsp.readFile(srcPath, "utf-8"))
			const existingHeader = raw._pipeline
			const toSave: any = {
				_pipeline: {
					name: existingHeader?.name ?? slug,
					description: existingHeader?.description ?? "",
					type: pipelineType,
					tags: existingHeader?.tags ?? [],
					isDefault: existingHeader?.isDefault ?? false,
				},
			}
			// Spread remaining keys (skip _pipeline if present)
			for (const key of Object.keys(raw)) {
				if (key !== "_pipeline") {
					toSave[key] = raw[key]
				}
			}
			await fsp.writeFile(destPath, JSON.stringify(toSave, null, 2), "utf-8")
			logger.info(`[WorkflowScanner] Imported workflow "${filename}" → ${destPath} with type "${pipelineType}"`)
		} else {
			// Copy the file as-is
			await fsp.copyFile(srcPath, destPath)
			logger.info(`[WorkflowScanner] Imported workflow "${filename}" → ${destPath}`)
		}

		return slug
	}

	/**
	 * Bulk import: scan the ComfyUI user workflows directory and import
	 * all discovered .json files into the persistent comfyui pipelines dir.
	 *
	 * @param comfyUISrcPath - ComfyUI source path
	 * @returns Array of imported pipeline slugs
	 */
	static async importAll(comfyUISrcPath: string): Promise<string[]> {
		const discovered = await this.scan(comfyUISrcPath)
		const slugs: string[] = []

		for (const wf of discovered) {
			try {
				const slug = await this.importOne(comfyUISrcPath, wf.filename)
				slugs.push(slug)
			} catch (err) {
				logger.error(`[WorkflowScanner] Failed to import workflow ${wf.filename}: ${err}`)
			}
		}

		return slugs
	}

	// ------------------------------------------------------------------
	// Utilities
	// ------------------------------------------------------------------

	/**
	 * Check whether a ComfyUI install exists at the given path by
	 * checking for the presence of the user workflows directory.
	 */
	static async hasUserWorkflows(comfyUISrcPath: string): Promise<boolean> {
		const workflowsDir = this.getUserWorkflowDir(comfyUISrcPath)
		try {
			await fsp.access(workflowsDir)
			const files = await fsp.readdir(workflowsDir)
			return files.some((f) => f.endsWith(".json"))
		} catch {
			return false
		}
	}

	/**
	 * Seed default workflow .json files into:
	 *   1. {comfyUISrcPath}/user/default/workflows/ (so ComfyUI sees them)
	 *   2. ~/.mirror/pipelines/comfyui/ (so Mirror VS has them)
	 */
	static async seedDefaultWorkflows(comfyUISrcPath: string): Promise<void> {
		const workflowsSrcDir = resolveWorkflowsDir()
		const userWorkflowsDir = this.getUserWorkflowDir(comfyUISrcPath)
		const persistentDir = this.getComfyuiPipelinesDir()

		await fsp.mkdir(userWorkflowsDir, { recursive: true })
		await fsp.mkdir(persistentDir, { recursive: true })

		try {
			const files = await fsp.readdir(workflowsSrcDir)
			const jsonFiles = files.filter((f) => f.endsWith(".json") && f !== "pipeline-meta.json")

			for (const file of jsonFiles) {
				const srcPath = path.join(workflowsSrcDir, file)
				const userDestPath = path.join(userWorkflowsDir, file)
				const persistentDestPath = path.join(persistentDir, file)

				// Copy to user default workflows dir
				try {
					await fsp.copyFile(srcPath, userDestPath)
				} catch (err) {
					logger.warn(`[WorkflowScanner] Failed to copy workflow to user workflows: ${err}`)
				}

				// Copy to persistent mirror pipelines dir
				try {
					await fsp.copyFile(srcPath, persistentDestPath)
				} catch (err) {
					logger.warn(`[WorkflowScanner] Failed to copy workflow to persistent pipelines: ${err}`)
				}
			}
			logger.info(`[WorkflowScanner] Successfully seeded default workflows.`)
		} catch (err) {
			logger.error(`[WorkflowScanner] Error seeding default workflows: ${err}`)
		}
	}

	/**
	 * Automatically provision custom nodes (like ComfyUI-Manager) if not already installed.
	 */
	static async provisionCustomNodes(comfyUISrcPath: string): Promise<void> {
		const { execSync } = await import("child_process")
		const customNodesDir = path.join(comfyUISrcPath, "custom_nodes")
		await fsp.mkdir(customNodesDir, { recursive: true })

		const nodes = [
			{
				name: "ComfyUI-Manager",
				url: "https://github.com/ltdrdata/ComfyUI-Manager.git",
			},
		]

		for (const node of nodes) {
			const nodePath = path.join(customNodesDir, node.name)
			if (!fs.existsSync(nodePath)) {
				logger.info(`[WorkflowScanner] Auto-installing custom node: ${node.name}`)
				try {
					execSync(`git clone --depth 1 ${node.url} "${nodePath}"`, { stdio: "ignore" })
				} catch (err) {
					logger.warn(`[WorkflowScanner] Failed to clone custom node ${node.name}: ${err}`)
				}
			}
		}
	}
}

function resolveWorkflowsDir(): string {
	const devOrBundled = path.join(__dirname, "workflows")
	if (fs.existsSync(devOrBundled)) {
		return devOrBundled
	}
	const testPath = path.join(__dirname, "..", "workflows")
	if (fs.existsSync(testPath)) {
		return testPath
	}
	return __dirname
}

/**
 * CustomToolRegistry - A reusable class for dynamically loading and managing TypeScript tools.
 *
 * Features:
 * - Dynamic TypeScript/JavaScript tool loading with esbuild transpilation.
 * - Runtime validation of tool definitions.
 * - Tool execution with context.
 * - JSON Schema generation for LLM integration.
 */

import fs from "fs"
import path from "path"
import { createHash } from "crypto"
import os from "os"

import type { CustomToolDefinition } from "@mirror-vs/types"

import type { LoadResult } from "./types.js"
import { ToolRegistry } from "./tool-registry.js"
import { runEsbuild, NODE_BUILTIN_MODULES, COMMONJS_REQUIRE_BANNER } from "./esbuild-runner.js"

export interface RegistryOptions {
	/** Directory for caching compiled TypeScript files. */
	cacheDir?: string
	/** Additional paths for resolving node modules (useful for tools outside node_modules). */
	nodePaths?: string[]
	/** Path to the extension root directory (for finding bundled esbuild binary in production). */
	extensionPath?: string
}

export class CustomToolRegistry extends ToolRegistry {
	private tsCache = new Map<string, string>()
	private cacheDir: string
	private nodePaths: string[]
	private extensionPath?: string
	private lastLoaded: Map<string, number> = new Map()

	constructor(options?: RegistryOptions) {
		super()
		this.cacheDir = options?.cacheDir ?? path.join(os.tmpdir(), "dynamic-tools-cache")
		// Default to current working directory's node_modules.
		this.nodePaths = options?.nodePaths ?? [path.join(process.cwd(), "node_modules")]
		this.extensionPath = options?.extensionPath
	}

	/**
	 * Load all tools from a directory.
	 * Supports both .ts and .js files.
	 *
	 * @param toolDir - Absolute path to the tools directory
	 * @returns LoadResult with lists of loaded and failed tools
	 */
	async loadFromDirectory(toolDir: string): Promise<LoadResult> {
		const result: LoadResult = { loaded: [], failed: [] }

		try {
			if (!fs.existsSync(toolDir)) {
				return result
			}

			const files = fs.readdirSync(toolDir).filter((f) => f.endsWith(".ts") || f.endsWith(".js"))

			for (const file of files) {
				const filePath = path.join(toolDir, file)

				try {
					console.log(`[CustomToolRegistry] importing tool from ${filePath}`)
					const mod = await this.import(filePath)

					for (const [exportName, value] of Object.entries(mod)) {
						const def = this.validate(exportName, value)

						if (!def) {
							continue
						}

						this.tools.set(def.name, { ...def, source: filePath })
						console.log(`[CustomToolRegistry] loaded tool ${def.name} from ${filePath}`)
						result.loaded.push(def.name)
					}
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error)
					console.error(`[CustomToolRegistry] import(${filePath}) failed: ${message}`)
					result.failed.push({ file, error: message })
				}
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			console.error(`[CustomToolRegistry] loadFromDirectory(${toolDir}) failed: ${message}`)
		}

		return result
	}

	async loadFromDirectoryIfStale(toolDir: string): Promise<LoadResult> {
		if (!fs.existsSync(toolDir)) {
			return { loaded: [], failed: [] }
		}

		const lastLoaded = this.lastLoaded.get(toolDir)
		const stat = fs.statSync(toolDir)
		const isStale = lastLoaded ? stat.mtimeMs > lastLoaded : true

		if (isStale) {
			this.lastLoaded.set(toolDir, stat.mtimeMs)
			return this.loadFromDirectory(toolDir)
		}

		return { loaded: this.list(), failed: [] }
	}

	/**
	 * Load all tools from multiple directories.
	 * Directories are processed in order, so later directories can override tools from earlier ones.
	 * Supports both .ts and .js files.
	 *
	 * @param toolDirs - Array of absolute paths to tools directories
	 * @returns LoadResult with lists of loaded and failed tools from all directories
	 */
	async loadFromDirectories(toolDirs: string[]): Promise<LoadResult> {
		const result: LoadResult = { loaded: [], failed: [] }

		for (const toolDir of toolDirs) {
			const dirResult = await this.loadFromDirectory(toolDir)
			result.loaded.push(...dirResult.loaded)
			result.failed.push(...dirResult.failed)
		}

		return result
	}

	/**
	 * Load all tools from multiple directories if any has become stale.
	 * Directories are processed in order, so later directories can override tools from earlier ones.
	 *
	 * @param toolDirs - Array of absolute paths to tools directories
	 * @returns LoadResult with lists of loaded and failed tools
	 */
	async loadFromDirectoriesIfStale(toolDirs: string[]): Promise<LoadResult> {
		const result: LoadResult = { loaded: [], failed: [] }

		for (const toolDir of toolDirs) {
			const dirResult = await this.loadFromDirectoryIfStale(toolDir)
			result.loaded.push(...dirResult.loaded)
			result.failed.push(...dirResult.failed)
		}

		return result
	}

	/**
	 * Set the extension path for finding bundled esbuild binary.
	 * This should be called with context.extensionPath when the extension activates.
	 */
	setExtensionPath(extensionPath: string): void {
		this.extensionPath = extensionPath
	}

	/**
	 * Get the current extension path.
	 */
	getExtensionPath(): string | undefined {
		return this.extensionPath
	}

	/**
	 * Clear the TypeScript compilation cache (both in-memory and on disk).
	 * This removes all tool-specific subdirectories and their contents.
	 */
	clearCache(): void {
		this.tsCache.clear()

		if (fs.existsSync(this.cacheDir)) {
			try {
				const entries = fs.readdirSync(this.cacheDir, { withFileTypes: true })
				for (const entry of entries) {
					const entryPath = path.join(this.cacheDir, entry.name)
					if (entry.isDirectory()) {
						// Remove tool-specific subdirectory and all its contents.
						fs.rmSync(entryPath, { recursive: true, force: true })
					} else if (entry.name.endsWith(".mjs")) {
						// Also clean up any legacy flat .mjs files from older cache format.
						fs.unlinkSync(entryPath)
					}
				}
			} catch (error) {
				console.error(
					`[CustomToolRegistry] clearCache failed to clean disk cache: ${error instanceof Error ? error.message : String(error)}`,
				)
			}
		}
	}

	/**
	 * Dynamically import a TypeScript or JavaScript file.
	 * TypeScript files are transpiled on-the-fly using esbuild.
	 */
	private async import(filePath: string): Promise<Record<string, CustomToolDefinition>> {
		const absolutePath = path.resolve(filePath)
		const ext = path.extname(absolutePath)

		if (ext === ".js" || ext === ".mjs") {
			return import(`file://${absolutePath}`)
		}

		const stat = fs.statSync(absolutePath)
		const cacheKey = `${absolutePath}:${stat.mtimeMs}`

		// Check if we have a cached version in memory.
		if (this.tsCache.has(cacheKey)) {
			const cachedPath = this.tsCache.get(cacheKey)!
			return import(`file://${cachedPath}`)
		}

		const hash = createHash("sha256").update(cacheKey).digest("hex").slice(0, 16)

		// Use a tool-specific subdirectory to avoid .env file conflicts between tools.
		const toolCacheDir = path.join(this.cacheDir, hash)
		fs.mkdirSync(toolCacheDir, { recursive: true })

		const tempFile = path.join(toolCacheDir, "bundle.mjs")

		// Check if we have a cached version on disk (from a previous run/instance).
		if (fs.existsSync(tempFile)) {
			this.tsCache.set(cacheKey, tempFile)
			return import(`file://${tempFile}`)
		}

		// Get the tool's directory to include its node_modules in resolution path.
		const toolDir = path.dirname(absolutePath)
		const toolNodeModules = path.join(toolDir, "node_modules")

		// Combine default nodePaths with tool-specific node_modules.
		// Tool's node_modules takes priority (listed first).
		const nodePaths = fs.existsSync(toolNodeModules) ? [toolNodeModules, ...this.nodePaths] : this.nodePaths

		// Bundle the TypeScript file with dependencies using esbuild CLI.
		await runEsbuild(
			{
				entryPoint: absolutePath,
				outfile: tempFile,
				format: "esm",
				platform: "node",
				target: "node18",
				bundle: true,
				sourcemap: "inline",
				packages: "bundle",
				nodePaths,
				external: NODE_BUILTIN_MODULES,
				banner: COMMONJS_REQUIRE_BANNER,
			},
			this.extensionPath,
		)

		this.copyEnvFiles(toolDir, toolCacheDir)

		this.tsCache.set(cacheKey, tempFile)
		return import(`file://${tempFile}`)
	}

	/**
	 * Copy .env files from the tool's source directory to the tool-specific cache directory.
	 */
	private copyEnvFiles(toolDir: string, destDir: string): void {
		try {
			const files = fs.readdirSync(toolDir)
			const envFiles = files.filter((f) => f === ".env" || f.startsWith(".env."))

			for (const envFile of envFiles) {
				const srcPath = path.join(toolDir, envFile)
				const destPath = path.join(destDir, envFile)

				const stat = fs.statSync(srcPath)
				if (stat.isFile()) {
					fs.copyFileSync(srcPath, destPath)
					console.log(`[CustomToolRegistry] copied ${envFile} to tool cache directory`)
				}
			}
		} catch (error) {
			console.warn(
				`[CustomToolRegistry] failed to copy .env files: ${error instanceof Error ? error.message : String(error)}`,
			)
		}
	}
}

export const customToolRegistry = new CustomToolRegistry()

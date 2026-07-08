import * as path from "path"
import * as os from "os"
import fs from "fs/promises"

/**
 * Gets the global .mirror directory path based on the current platform
 *
 * @returns The absolute path to the global .mirror directory
 */
export function getGlobalMirrorDirectory(): string {
	const homeDir = os.homedir()
	return path.join(homeDir, ".mirror")
}

/**
 * Gets the global .agents directory path based on the current platform.
 * This is a shared directory for agent skills across different AI coding tools.
 *
 * @returns The absolute path to the global .agents directory
 */
export function getGlobalAgentsDirectory(): string {
	const homeDir = os.homedir()
	return path.join(homeDir, ".agents")
}

/**
 * Gets the project-local .agents directory path for a given cwd.
 * This is a shared directory for agent skills across different AI coding tools.
 *
 * @param cwd - Current working directory (project path)
 * @returns The absolute path to the project-local .agents directory
 */
export function getProjectAgentsDirectoryForCwd(cwd: string): string {
	return path.join(cwd, ".agents")
}

/**
 * Gets the project-local .mirror directory path for a given cwd
 *
 * @param cwd - Current working directory (project path)
 * @returns The absolute path to the project-local .mirror directory
 */
export function getProjectMirrorDirectoryForCwd(cwd: string): string {
	return path.join(cwd, ".mirror")
}


/**
 * Checks if a directory exists
 */
export async function directoryExists(dirPath: string): Promise<boolean> {
	try {
		const stat = await fs.stat(dirPath)
		return stat.isDirectory()
	} catch (error: any) {
		if (error.code === "ENOENT" || error.code === "ENOTDIR") {
			return false
		}
		throw error
	}
}

/**
 * Checks if a file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
	try {
		const stat = await fs.stat(filePath)
		return stat.isFile()
	} catch (error: any) {
		if (error.code === "ENOENT" || error.code === "ENOTDIR") {
			return false
		}
		throw error
	}
}

/**
 * Reads a file safely, returning null if it doesn't exist
 */
export async function readFileIfExists(filePath: string): Promise<string | null> {
	try {
		return await fs.readFile(filePath, "utf-8")
	} catch (error: any) {
		if (error.code === "ENOENT" || error.code === "ENOTDIR" || error.code === "EISDIR") {
			return null
		}
		throw error
	}
}

/**
 * Discovers all .mirror directories in subdirectories of the workspace
 *
 * @param cwd - Current working directory (workspace root)
 * @returns Array of absolute paths to .mirror directories found in subdirectories,
 *          sorted alphabetically. Does not include the root .mirror directory.
 */
export async function discoverSubfolderMirrorDirectories(cwd: string): Promise<string[]> {
	try {
		const { executeRipgrep } = await import("../search/file-search")

		const args = [
			"--files",
			"--hidden",
			"--follow",
			"-g",
			"**/.mirror/**",
			"-g",
			"!node_modules/**",
			"-g",
			"!.git/**",
			cwd,
		]

		const results = await executeRipgrep({ args, workspacePath: cwd })

		const mirrorDirs = new Set<string>()
		const rootMirrorDir = path.join(cwd, ".mirror")

		for (const result of results) {
			const match = result.path.match(/^(.+?)[/\\]\.mirror[/\\]/)
			if (match) {
				const mirrorDir = path.join(cwd, match[1], ".mirror")
				if (mirrorDir !== rootMirrorDir) {
					mirrorDirs.add(mirrorDir)
				}
			}
		}

		return Array.from(mirrorDirs).sort()
	} catch (error) {
		return []
	}
}


/**
 * Gets the ordered list of .mirror directories to check (global first, then project-local)
 *
 * @param cwd - Current working directory (project path)
 * @returns Array of directory paths to check in order [global, project-local]
 */
export function getMirrorDirectoriesForCwd(cwd: string): string[] {
	const directories: string[] = []
	directories.push(getGlobalMirrorDirectory())
	directories.push(getProjectMirrorDirectoryForCwd(cwd))
	return directories
}


/**
 * Gets the ordered list of all .mirror directories including subdirectories
 *
 * @param cwd - Current working directory (project path)
 * @returns Array of directory paths in order: [global, project-local, ...subfolders (alphabetically)]
 */
export async function getAllMirrorDirectoriesForCwd(cwd: string): Promise<string[]> {
	const directories: string[] = []
	directories.push(getGlobalMirrorDirectory())
	directories.push(getProjectMirrorDirectoryForCwd(cwd))

	const subfolderDirs = await discoverSubfolderMirrorDirectories(cwd)
	directories.push(...subfolderDirs)

	return directories
}


/**
 * Gets parent directories containing .mirror folders, in order from root to subfolders
 *
 * @param cwd - Current working directory (project path)
 * @returns Array of parent directory paths (not .mirror paths) containing AGENTS.md or .mirror
 */
export async function getAgentsDirectoriesForCwd(cwd: string): Promise<string[]> {
	const directories: string[] = []
	directories.push(cwd)

	const subfolderMirrorDirs = await discoverSubfolderMirrorDirectories(cwd)

	for (const mirrorDir of subfolderMirrorDirs) {
		const parentDir = path.dirname(mirrorDir)
		directories.push(parentDir)
	}

	return directories
}

/**
 * Loads configuration from multiple .mirror directories with project overriding global
 *
 * @param relativePath - The relative path within each .mirror directory (e.g., 'rules/rules.md')
 * @param cwd - Current working directory (project path)
 * @returns Object with global and project content, plus merged content
 */
export async function loadConfiguration(
	relativePath: string,
	cwd: string,
): Promise<{
	global: string | null
	project: string | null
	merged: string
}> {
	const globalDir = getGlobalMirrorDirectory()
	const projectDir = getProjectMirrorDirectoryForCwd(cwd)

	const globalFilePath = path.join(globalDir, relativePath)
	const projectFilePath = path.join(projectDir, relativePath)

	const globalContent = await readFileIfExists(globalFilePath)
	const projectContent = await readFileIfExists(projectFilePath)

	let merged = ""

	if (globalContent) {
		merged += globalContent
	}

	if (projectContent) {
		if (merged) {
			merged += "\n\n# Project-specific rules (override global):\n\n"
		}
		merged += projectContent
	}

	return {
		global: globalContent,
		project: projectContent,
		merged: merged || "",
	}
}

// Backward compatibility alias
export const loadMirrorConfiguration = loadConfiguration

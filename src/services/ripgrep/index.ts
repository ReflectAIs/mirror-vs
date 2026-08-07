import * as childProcess from "child_process"
import * as path from "path"
import * as readline from "readline"

import * as vscode from "vscode"

import { MirrorIgnoreController } from "../../core/ignore/MirrorIgnoreController"
import { fileExistsAtPath } from "../../utils/fs"
/*
This file provides functionality to perform regex searches on files using ripgrep.
Inspired by: https://github.com/DiscreteTom/vscode-ripgrep-utils

Key components:
1. getBinPath: Locates the ripgrep binary within the VSCode installation.
2. execRipgrep: Executes the ripgrep command and returns the output.
3. regexSearchFiles: The main function that performs regex searches on files.
   - Parameters:
     * cwd: The current working directory (for relative path calculation)
     * directoryPath: The directory to search in
     * regex: The regular expression to search for (Rust regex syntax)
     * filePattern: Optional glob pattern to filter files (default: '*')
   - Returns: A formatted string containing search results with context

The search results include:
- Relative file paths
- 2 lines of context before and after each match
- Matches formatted with pipe characters for easy reading

Usage example:
const results = await regexSearchFiles('/path/to/cwd', '/path/to/search', 'TODO:', '*.ts');

rel/path/to/app.ts
│----
│function processData(data: any) {
│  // Some processing logic here
│  // TODO: Implement error handling
│  return processedData;
│}
│----

rel/path/to/helper.ts
│----
│  let result = 0;
│  for (let i = 0; i < input; i++) {
│    // TODO: Optimize this function for performance
│    result += Math.pow(i, 2);
│  }
│----
*/

const isWindows = process.platform.startsWith("win")
const binName = isWindows ? "rg.exe" : "rg"

interface SearchFileResult {
	file: string
	searchResults: SearchResult[]
}

interface SearchResult {
	lines: SearchLineResult[]
}

interface SearchLineResult {
	line: number
	text: string
	isMatch: boolean
	column?: number
}
// Constants
const MAX_RESULTS = 300
const MAX_LINE_LENGTH = 500

/**
 * Truncates a line if it exceeds the maximum length
 * @param line The line to truncate
 * @param maxLength The maximum allowed length (defaults to MAX_LINE_LENGTH)
 * @returns The truncated line, or the original line if it's shorter than maxLength
 */
export function truncateLine(line: string, maxLength: number = MAX_LINE_LENGTH): string {
	return line.length > maxLength ? line.substring(0, maxLength) + " [truncated...]" : line
}
import * as fs from "fs"

/**
 * Ensures the binary has execute permissions on Unix/macOS systems.
 */
function ensureExecutable(binPath: string): string {
	if (!isWindows && binPath) {
		try {
			fs.chmodSync(binPath, 0o755)
		} catch {
			// Ignore errors on read-only filesystems or restricted permissions
		}
	}
	return binPath
}

/**
 * Get the path to the ripgrep binary.
 *
 * Resolution order:
 * 1. The bundled binary at `dist/ripgrep/rg` (or `rg.exe` on Windows).
 * 2. `@vscode/ripgrep` via Node module resolution.
 * 3. Well-known locations relative to VS Code application root (`vscode.env.appRoot`).
 * 4. System PATH resolution (e.g. `/opt/homebrew/bin/rg`, `/usr/local/bin/rg`, `which rg`).
 */
export async function getBinPath(vscodeAppRoot?: string): Promise<string | undefined> {
	// 1) Bundled binary (production + F5 debug where __dirname is dist/ or src/).
	const bundledCandidates = [
		path.join(__dirname, "ripgrep", binName),
		path.join(__dirname, "dist", "ripgrep", binName),
		path.join(__dirname, "..", "ripgrep", binName),
		path.join(__dirname, "..", "..", "..", "ripgrep", binName),
	]
	for (const candidate of bundledCandidates) {
		if (await fileExistsAtPath(candidate)) {
			return ensureExecutable(candidate)
		}
	}

	// 2) Resolve from the @vscode/ripgrep package when it's available to this module.
	try {
		const rgPath = require("@vscode/ripgrep").rgPath as string
		if (rgPath && (await fileExistsAtPath(rgPath))) {
			return ensureExecutable(rgPath)
		}
	} catch {
		// @vscode/ripgrep is not resolvable from this module - fall through.
	}

	// 3) Well-known locations relative to the provided roots (appRoot / extension dir).
	const candidateRoots = [
		vscodeAppRoot,
		vscodeAppRoot ? path.dirname(vscodeAppRoot) : undefined,
		path.join(__dirname, "..", "..", ".."),
	].filter((root): root is string => Boolean(root))

	const checkPath = async (pkgFolder: string) => {
		for (const root of candidateRoots) {
			const fullPath = path.join(root, pkgFolder, binName)
			if (await fileExistsAtPath(fullPath)) {
				return ensureExecutable(fullPath)
			}
		}
		return undefined
	}

	const appRootPath =
		(await checkPath("node_modules/@vscode/ripgrep/bin/")) ||
		(await checkPath("node_modules/vscode-ripgrep/bin")) ||
		(await checkPath("node_modules.asar.unpacked/vscode-ripgrep/bin/")) ||
		(await checkPath("node_modules.asar.unpacked/@vscode/ripgrep/bin/")) ||
		(await checkPath("app/node_modules.asar.unpacked/@vscode/ripgrep/bin/"))

	if (appRootPath) {
		return appRootPath
	}

	// 4) System PATH fallback (Homebrew, system install, PATH).
	const systemCandidates = isWindows
		? ["C:\\Program Files\\ripgrep\\rg.exe"]
		: ["/opt/homebrew/bin/rg", "/usr/local/bin/rg", "/usr/bin/rg"]

	for (const candidate of systemCandidates) {
		if (await fileExistsAtPath(candidate)) {
			return ensureExecutable(candidate)
		}
	}

	// Try resolving via system command (which / where)
	try {
		const whichCmd = isWindows ? "where rg" : "which rg"
		const resolvedPath = childProcess.execSync(whichCmd, { encoding: "utf8" }).trim().split("\n")[0]?.trim()
		if (resolvedPath && (await fileExistsAtPath(resolvedPath))) {
			return ensureExecutable(resolvedPath)
		}
	} catch {
		// system which/where failed or rg not in PATH
	}

	return undefined
}

async function execRipgrep(bin: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		const rgProcess = childProcess.spawn(bin, args)
		// cross-platform alternative to head, which is ripgrep author's recommendation for limiting output.
		const rl = readline.createInterface({
			input: rgProcess.stdout,
			crlfDelay: Infinity, // treat \r\n as a single line break even if it's split across chunks.
		})

		let output = ""
		let lineCount = 0
		let exitCode: number | null = null
		const maxLines = MAX_RESULTS * 5

		rl.on("line", (line) => {
			if (lineCount < maxLines) {
				output += line + "\n"
				lineCount++
			} else {
				rl.close()
				rgProcess.kill()
			}
		})

		let errorOutput = ""
		rgProcess.stderr.on("data", (data) => {
			errorOutput += data.toString()
		})

		rgProcess.on("exit", (code) => {
			exitCode = code
		})

		rl.on("close", () => {
			// ripgrep exit code 0 = matches found, 1 = no matches found, 143 = killed by SIGTERM (max lines)
			// Do not treat non-fatal stderr warnings (e.g. unreadable files) as hard errors if exit code is 0 or 1 or output was produced.
			const isSuccess = exitCode === 0 || exitCode === 1 || exitCode === 143 || output.length > 0
			if (!isSuccess && errorOutput) {
				reject(new Error(`ripgrep process error: ${errorOutput}`))
			} else {
				resolve(output)
			}
		})

		rgProcess.on("error", (error) => {
			reject(new Error(`ripgrep process error: ${error.message}`))
		})
	})
}

export async function regexSearchFiles(
	cwd: string,
	directoryPath: string,
	regex: string,
	filePattern?: string,
	mirrorIgnoreController?: MirrorIgnoreController,
): Promise<string> {
	const vscodeAppRoot = vscode.env.appRoot
	const rgPath = await getBinPath(vscodeAppRoot)

	if (!rgPath) {
		throw new Error("Could not find ripgrep binary")
	}

	const args = ["--json", "-e", regex]

	// Only add --glob if a specific file pattern is provided
	// Using --glob "*" overrides .gitignore behavior, so we omit it when no pattern is specified
	if (filePattern) {
		args.push("--glob", filePattern)
	}

	args.push("--context", "1", "--no-messages", directoryPath)

	let output: string
	try {
		output = await execRipgrep(rgPath, args)
	} catch (error) {
		console.error("Error executing ripgrep:", error)
		return "No results found"
	}

	const results: SearchFileResult[] = []
	let currentFile: SearchFileResult | null = null

	output.split("\n").forEach((line) => {
		if (line) {
			try {
				const parsed = JSON.parse(line)
				if (parsed.type === "begin") {
					currentFile = {
						file: parsed.data.path.text.toString(),
						searchResults: [],
					}
				} else if (parsed.type === "end") {
					// Reset the current result when a new file is encountered
					results.push(currentFile as SearchFileResult)
					currentFile = null
				} else if ((parsed.type === "match" || parsed.type === "context") && currentFile) {
					const line = {
						line: parsed.data.line_number,
						text: truncateLine(parsed.data.lines.text),
						isMatch: parsed.type === "match",
						...(parsed.type === "match" && { column: parsed.data.absolute_offset }),
					}

					const lastResult = currentFile.searchResults[currentFile.searchResults.length - 1]
					if (lastResult?.lines.length > 0) {
						const lastLine = lastResult.lines[lastResult.lines.length - 1]

						// If this line is contiguous with the last result, add to it
						if (parsed.data.line_number <= lastLine.line + 1) {
							lastResult.lines.push(line)
						} else {
							// Otherwise create a new result
							currentFile.searchResults.push({
								lines: [line],
							})
						}
					} else {
						// First line in file
						currentFile.searchResults.push({
							lines: [line],
						})
					}
				}
			} catch (error) {
				console.error("Error parsing ripgrep output:", error)
			}
		}
	})

	// console.log(results)

	// Filter results using MirrorIgnoreController if provided
	const filteredResults = mirrorIgnoreController
		? results.filter((result) => mirrorIgnoreController.validateAccess(result.file))
		: results

	return formatResults(filteredResults, cwd)
}

function formatResults(fileResults: SearchFileResult[], cwd: string): string {
	const groupedResults: { [key: string]: SearchResult[] } = {}

	let totalResults = fileResults.reduce((sum, file) => sum + file.searchResults.length, 0)
	let output = ""
	if (totalResults >= MAX_RESULTS) {
		output += `Showing first ${MAX_RESULTS} of ${MAX_RESULTS}+ results. Use a more specific search if necessary.\n\n`
	} else {
		output += `Found ${totalResults === 1 ? "1 result" : `${totalResults.toLocaleString()} results`}.\n\n`
	}

	// Group results by file name
	fileResults.slice(0, MAX_RESULTS).forEach((file) => {
		const relativeFilePath = path.relative(cwd, file.file)
		if (!groupedResults[relativeFilePath]) {
			groupedResults[relativeFilePath] = []

			groupedResults[relativeFilePath].push(...file.searchResults)
		}
	})

	for (const [filePath, fileResults] of Object.entries(groupedResults)) {
		output += `# ${filePath.toPosix()}\n`

		fileResults.forEach((result) => {
			// Only show results with at least one line
			if (result.lines.length > 0) {
				// Show all lines in the result
				result.lines.forEach((line) => {
					const lineNumber = String(line.line).padStart(3, " ")
					output += `${lineNumber} | ${line.text.trimEnd()}\n`
				})
				output += "----\n"
			}
		})

		output += "\n"
	}

	return output.trim()
}

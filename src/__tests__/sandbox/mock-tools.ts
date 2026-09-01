/**
 * Sandboxed Mock Tools Executor
 *
 * Creates a temp project directory and executes tool calls against it
 * with real filesystem operations. Captures all invocations for analysis.
 */
import fs from "fs"
import path from "path"
import os from "os"

export interface ToolInvocation {
	name: string
	args: Record<string, unknown>
	result: string
	durationMs: number
	timestamp: number
}

export interface SandboxProject {
	rootDir: string
	files: Record<string, string>
}

/**
 * Creates a sandboxed project directory with the given file structure.
 */
export function createSandboxProject(files: Record<string, string>): SandboxProject {
	const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "mirror-sandbox-"))

	for (const [filePath, content] of Object.entries(files)) {
		const fullPath = path.join(rootDir, filePath)
		fs.mkdirSync(path.dirname(fullPath), { recursive: true })
		fs.writeFileSync(fullPath, content, "utf-8")
	}

	return { rootDir, files }
}

/**
 * Cleans up a sandbox project directory.
 */
export function cleanupSandbox(project: SandboxProject): void {
	try {
		fs.rmSync(project.rootDir, { recursive: true, force: true })
	} catch {
		// Best effort cleanup
	}
}

/**
 * Executes a tool call against the sandbox project directory.
 */
export function executeTool(
	toolName: string,
	args: Record<string, unknown>,
	project: SandboxProject,
): { result: string; invocation: ToolInvocation } {
	const start = performance.now()
	let result: string

	try {
		switch (toolName) {
			case "read_file":
				result = handleReadFile(args, project)
				break
			case "write_to_file":
				result = handleWriteToFile(args, project)
				break
			case "apply_diff":
				result = handleApplyDiff(args, project)
				break
			case "search_replace":
			case "edit_file":
				result = handleSearchReplace(args, project)
				break
			case "list_files":
				result = handleListFiles(args, project)
				break
			case "search_files":
				result = handleSearchFiles(args, project)
				break
			case "execute_command":
				result = handleExecuteCommand(args, project)
				break
			case "attempt_completion":
				result = `[TASK_COMPLETED] ${String(args.result || "Task completed.")}`
				break
			case "ask_followup_question":
				result = `User response: "Yes, proceed."`
				break
			case "codebase_search":
				result = handleSearchFiles({ regex: args.query }, project)
				break
			case "web_search":
				result = `Search results for "${args.query}": No results (sandbox).`
				break
			case "get_workspace_file_tree":
				result = Object.keys(project.files).sort().join("\n")
				break
			case "get_workspace_pulse":
				result = `Files: ${Object.keys(project.files).length}\nBranch: main\nDiagnostics: 0 errors, 0 warnings`
				break
			case "get_git_status":
				result = "On branch main\nnothing to commit, working tree clean"
				break
			case "update_todo_list":
				result = "Todo list updated."
				break
			case "switch_mode":
				result = "Mode switched."
				break
			case "sleep":
				result = "Slept."
				break
			default:
				result = `Tool "${toolName}" executed (sandbox stub).`
		}
	} catch (e: any) {
		result = `Error: ${e.message}`
	}

	const durationMs = performance.now() - start
	const invocation: ToolInvocation = { name: toolName, args, result, durationMs, timestamp: Date.now() }

	return { result, invocation }
}

// ────────────────────────────────────────────────────────────
//  Tool Handlers
// ────────────────────────────────────────────────────────────

function handleReadFile(args: Record<string, unknown>, project: SandboxProject): string {
	const filePath = String(args.path || "")
	const fullPath = path.join(project.rootDir, filePath)

	if (!fs.existsSync(fullPath)) {
		return `Error: File not found: ${filePath}\nAvailable files:\n${Object.keys(project.files).join("\n")}`
	}

	const content = fs.readFileSync(fullPath, "utf-8")
	const lines = content.split("\n")
	const startLine = Number(args.start_line) || 1
	const endLine = Number(args.end_line) || lines.length

	const sliced = lines.slice(startLine - 1, endLine)
	const numbered = sliced.map((line, i) => `${startLine + i} | ${line}`).join("\n")

	let output = numbered
	if (endLine < lines.length) {
		output += `\n\n[Truncated. Showing lines ${startLine}-${endLine} of ${lines.length}.]`
	}
	return output
}

function handleWriteToFile(args: Record<string, unknown>, project: SandboxProject): string {
	const filePath = String(args.path || "")
	const content = String(args.content || "")
	const fullPath = path.join(project.rootDir, filePath)

	fs.mkdirSync(path.dirname(fullPath), { recursive: true })
	fs.writeFileSync(fullPath, content, "utf-8")
	project.files[filePath] = content

	return `File written successfully to ${filePath} (${content.split("\n").length} lines).`
}

function handleApplyDiff(args: Record<string, unknown>, project: SandboxProject): string {
	const filePath = String(args.path || "")
	const diff = String(args.diff || "")
	const fullPath = path.join(project.rootDir, filePath)

	if (!fs.existsSync(fullPath)) return `Error: File not found: ${filePath}`

	const searchReplaceRegex = /<<<<<<< SEARCH\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> REPLACE/g
	let content = fs.readFileSync(fullPath, "utf-8")
	let match
	let applied = 0

	while ((match = searchReplaceRegex.exec(diff)) !== null) {
		const search = match[1]
		const replace = match[2]
		if (content.includes(search)) {
			content = content.replace(search, replace)
			applied++
		} else {
			// Fallback: trimmed-line matching (handles indentation / leading whitespace variations)
			const searchLines = search.split(/\r?\n/)
			const contentLines = content.split(/\r?\n/)
			const trimmedSearch = searchLines.map((l) => l.trim()).filter((l) => l.length > 0)

			for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
				const candidate = contentLines.slice(i, i + searchLines.length)
				const trimmedCandidate = candidate.map((l) => l.trim()).filter((l) => l.length > 0)
				if (
					trimmedCandidate.length === trimmedSearch.length &&
					trimmedCandidate.every((l, idx) => l === trimmedSearch[idx])
				) {
					contentLines.splice(i, searchLines.length, replace)
					content = contentLines.join("\n")
					applied++
					break
				}
			}
		}
	}

	if (applied > 0) {
		fs.writeFileSync(fullPath, content, "utf-8")
		project.files[filePath] = content
		return `Applied ${applied} diff hunk(s) to ${filePath}.`
	}
	return `Error: Could not apply diff to ${filePath}. Search content not found.`
}

function handleSearchReplace(args: Record<string, unknown>, project: SandboxProject): string {
	const filePath = String(args.path || "")
	const fullPath = path.join(project.rootDir, filePath)

	if (!fs.existsSync(fullPath)) return `Error: File not found: ${filePath}`

	let content = fs.readFileSync(fullPath, "utf-8")
	const operations = (args.operations as any[]) || []

	// Support single search/replace in args directly
	if (operations.length === 0 && args.search !== undefined) {
		operations.push({ search: args.search, replace: args.replace || "" })
	}

	let applied = 0
	for (const op of operations) {
		const search = String(op.search || "")
		const replace = String(op.replace || "")
		if (content.includes(search)) {
			content = content.replace(search, replace)
			applied++
		}
	}

	if (applied > 0) {
		fs.writeFileSync(fullPath, content, "utf-8")
		project.files[filePath] = content
		return `Applied ${applied} search/replace operation(s) to ${filePath}.`
	}
	return `Error: No matching content found in ${filePath}.`
}

function handleListFiles(args: Record<string, unknown>, project: SandboxProject): string {
	const dirPath = String(args.path || ".")
	const recursive = args.recursive !== false
	const targetDir = path.join(project.rootDir, dirPath)

	if (!fs.existsSync(targetDir)) return `Error: Directory not found: ${dirPath}`

	const files: string[] = []
	function walk(dir: string, prefix: string) {
		const entries = fs.readdirSync(dir, { withFileTypes: true })
		for (const entry of entries) {
			const relPath = path.join(prefix, entry.name).replace(/\\/g, "/")
			if (entry.isDirectory()) {
				files.push(relPath + "/")
				if (recursive) walk(path.join(dir, entry.name), relPath)
			} else {
				files.push(relPath)
			}
		}
	}

	walk(targetDir, dirPath === "." ? "" : dirPath)
	return files.join("\n") || "(empty directory)"
}

function handleSearchFiles(args: Record<string, unknown>, project: SandboxProject): string {
	const regex = String(args.regex || args.pattern || args.query || "")
	const results: string[] = []

	// Re-read files from disk to catch any edits
	for (const [filePath] of Object.entries(project.files)) {
		const fullPath = path.join(project.rootDir, filePath)
		if (!fs.existsSync(fullPath)) continue
		const content = fs.readFileSync(fullPath, "utf-8")
		const lines = content.split("\n")

		for (let i = 0; i < lines.length; i++) {
			try {
				if (new RegExp(regex, "i").test(lines[i])) {
					results.push(`${filePath}:${i + 1}: ${lines[i].trim()}`)
				}
			} catch {
				if (lines[i].toLowerCase().includes(regex.toLowerCase())) {
					results.push(`${filePath}:${i + 1}: ${lines[i].trim()}`)
				}
			}
		}
	}

	if (results.length === 0) return `No matches found for "${regex}".`
	return results.slice(0, 50).join("\n")
}

function handleExecuteCommand(args: Record<string, unknown>, project: SandboxProject): string {
	const command = String(args.command || "")

	if (command.includes("npm install") || command.includes("pnpm install")) return "added 0 packages in 0.1s"
	if (command.includes("npm test") || command.includes("pnpm test")) return "All tests passed."
	if (command.includes("npm run build") || command.includes("tsc")) return "Build completed successfully."
	if (command.includes("cat ") || command.includes("type ")) {
		const filePath = command.split(/\s+/).pop() || ""
		const fullPath = path.join(project.rootDir, filePath)
		if (fs.existsSync(fullPath)) return fs.readFileSync(fullPath, "utf-8")
		return `Error: File not found: ${filePath}`
	}

	return `Command executed: ${command}\n(Simulated output in sandbox mode)`
}

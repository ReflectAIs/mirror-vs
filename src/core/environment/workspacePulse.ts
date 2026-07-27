import path from "path"
import { exec } from "child_process"
import { promisify } from "util"

import * as vscode from "vscode"

import { TerminalRegistry } from "../../integrations/terminal/TerminalRegistry"
import { getGitDiffForRelativeFile } from "../../utils/git"
import { diagnosticsToProblemsString } from "../../integrations/diagnostics"

import { Task } from "../task/Task"
import { getGitStatus } from "../../utils/git"

const execAsync = promisify(exec)
const MAX_PULSE_LENGTH = 5000

/**
 * Builds a mode-appropriate "Workspace Pulse" — a compact, proactive context bundle
 * injected into environment details so the model can skip 2-4 probing tool calls.
 *
 * Design constraints:
 * - All git calls are async (promisify(exec)) — never block the VS Code Extension Host
 * - Each block is budget-checked against MAX_PULSE_LENGTH before appending to avoid
 *   mid-code-block truncation that would corrupt the model's Markdown parser
 * - Stale diffs are cleared per-turn via getAndClearRecentlyModifiedFiles()
 */
export async function buildWorkspacePulse(mirror: Task, currentMode: string): Promise<string> {
	const state = await mirror.providerRef.deref()?.getState()
	const includeDiagnosticMessages = state?.includeDiagnosticMessages ?? true
	const maxDiagnosticMessages = state?.maxDiagnosticMessages ?? 50

	let pulse = "\n\n# Workspace Pulse\n"

	// ── 1. Diagnostic summary (all modes) ──
	const allDiagnostics = vscode.languages.getDiagnostics()
	let totalErrors = 0
	let totalWarnings = 0
	const errorFiles: string[] = []

	for (const [uri, diags] of allDiagnostics) {
		for (const d of diags) {
			if (d.severity === vscode.DiagnosticSeverity.Error) {
				totalErrors++
				const relPath = path.relative(mirror.cwd, uri.fsPath)
				if (!errorFiles.includes(relPath) && errorFiles.length < 3) {
					errorFiles.push(relPath)
				}
			}
			if (d.severity === vscode.DiagnosticSeverity.Warning) {
				totalWarnings++
			}
		}
	}

	if (totalErrors > 0 || totalWarnings > 0) {
		pulse += `- **Problems:** ${totalErrors} error(s), ${totalWarnings} warning(s)`
		if (errorFiles.length > 0) {
			pulse += ` in ${errorFiles.join(", ")}${totalErrors > 3 ? " (+more)" : ""}`
		}
		pulse += "\n"
	}

	// ── 2. Git pulse (all modes) — async, never blocking the UI thread ──
	try {
		const [{ stdout: branch }, { stdout: status }] = await Promise.all([
			execAsync("git rev-parse --abbrev-ref HEAD", { cwd: mirror.cwd }),
			execAsync("git status --short | head -5", { cwd: mirror.cwd }),
		])

		pulse += `- **Git:** branch \`${branch.trim()}\``
		const statusLines = status.trim().split("\n").filter(Boolean)
		if (statusLines.length > 0) {
			pulse += `, ${statusLines.length} uncommitted change(s)`
		}
		pulse += "\n"
	} catch {
		// Gracefully ignore if not a git repository
	}

	// ── 3. Active terminals (all modes) ──
	const busyTerminals = TerminalRegistry.getTerminals(true, mirror.taskId)
	if (busyTerminals.length > 0) {
		const lastCmd = busyTerminals[0].getLastCommand()
		if (lastCmd) {
			pulse += `- **Active Terminal:** \`${lastCmd.substring(0, 100)}\`\n`
		}
	}

	// ── Mode-specific additions (budgeted to prevent Markdown corruption) ──

	if (currentMode === "debug" || currentMode === "code") {
		// Full diagnostics (budget-checked)
		if (includeDiagnosticMessages && maxDiagnosticMessages > 0) {
			const problemsStr = await diagnosticsToProblemsString(
				allDiagnostics,
				[vscode.DiagnosticSeverity.Error, vscode.DiagnosticSeverity.Warning],
				mirror.cwd,
				true,
				Math.min(maxDiagnosticMessages, 30),
			)
			if (problemsStr && pulse.length + problemsStr.length < MAX_PULSE_LENGTH) {
				pulse += `\n### Diagnostics\n${problemsStr}\n`
			}
		}

		// Git diffs for recently modified files
		const modifiedFiles = mirror.fileContextTracker.getAndClearRecentlyModifiedFiles()
		if (modifiedFiles.length > 0) {
			pulse += "\n### Recent Changes\n"
			for (const filePath of modifiedFiles.slice(0, 5)) {
				const diff = await getGitDiffForRelativeFile(mirror.cwd, filePath)
				if (diff) {
					const diffSnippet = diff.substring(0, 2000)
					const block = `\n**${filePath}**\n\`\`\`diff\n${diffSnippet}${diff.length > 2000 ? "\n... [Truncated]" : ""}\n\`\`\`\n`
					// Budget check: don't append if it pushes us over the hard limit
					if (pulse.length + block.length > MAX_PULSE_LENGTH) {
						break
					}
					pulse += block
				}
			}
		}
	}

	if (currentMode === "architect") {
		const gitStatus = await getGitStatus(mirror.cwd, 50)
		if (gitStatus && pulse.length + gitStatus.length < MAX_PULSE_LENGTH) {
			pulse += `\n### Git Status\n${gitStatus}\n`
		}
	}

	return pulse
}

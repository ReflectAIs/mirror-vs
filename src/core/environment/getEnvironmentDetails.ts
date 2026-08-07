import path from "path"
import os from "os"

import * as vscode from "vscode"
import pWaitFor from "p-wait-for"
import delay from "delay"

import { formatLanguage } from "../../shared/language"
import { defaultModeSlug, getFullModeDetails } from "../../shared/modes"
import { getApiMetrics } from "../../shared/getApiMetrics"
import { listFiles } from "../../services/glob/list-files"
import { TerminalRegistry } from "../../integrations/terminal/TerminalRegistry"
import { Terminal } from "../../integrations/terminal/Terminal"
import { arePathsEqual } from "../../utils/path"
import { formatResponse } from "../prompts/responses"
import { getGitStatus } from "../../utils/git"

import { Task } from "../task/Task"
import { formatReminderSection } from "./reminder"
import { buildWorkspacePulse } from "./workspacePulse"

export async function getEnvironmentDetails(mirror: Task, includeFileDetails: boolean = false, modeSlug?: string) {
	let details = ""
	let volatileDetails = ""

	const mirrorProvider = mirror.providerRef.deref()
	const state = await mirrorProvider?.getState()
	const { maxWorkspaceFiles = 200 } = state ?? {}

	const { mode, customModes, customModePrompts, customInstructions: globalCustomInstructions, language } = state ?? {}
	const { id: modelId } = mirror.api.getModel()
	const effectiveMode = modeSlug ?? mode ?? defaultModeSlug

	// ── SEMI-STATIC BLOCK (cacheable — changes infrequently) ──────────────

	// 1. Current Mode (changes only on mode switch)
	const modeDetails = await getFullModeDetails(effectiveMode, customModes, customModePrompts, {
		cwd: mirror.cwd,
		globalCustomInstructions,
		language: language ?? formatLanguage(vscode.env.language),
	})

	details += `# Current Mode\n`
	details += `<slug>${effectiveMode}</slug>\n`
	details += `<name>${modeDetails.name}</name>\n`
	details += `<model>${modelId}</model>\n`

	// 2. Workspace File Tree (semi-static — changes on file create/delete)
	if (includeFileDetails) {
		details += `\n\n# Current Workspace Directory (${mirror.cwd.toPosix()}) Files\n`
		const isDesktop = arePathsEqual(mirror.cwd, path.join(os.homedir(), "Desktop"))

		if (isDesktop) {
			details += "(Desktop files not shown automatically. Use list_files to explore if needed.)"
		} else {
			const maxFiles = maxWorkspaceFiles ?? 200

			if (maxFiles === 0) {
				details += "(Workspace files context disabled. Use list_files to explore if needed.)"
			} else {
				const [files, didHitLimit] = await listFiles(mirror.cwd, true, maxFiles)
				const { showMirrorIgnoredFiles = false } = state ?? {}

				const result = formatResponse.formatFilesList(
					mirror.cwd,
					files,
					didHitLimit,
					mirror.mirrorIgnoreController,
					showMirrorIgnoredFiles,
				)
				details += result
			}
		}
	}

	// 3. VSCode Visible Files (semi-static)
	const visibleFilePaths = vscode.window.visibleTextEditors
		?.map((editor) => editor.document?.uri?.fsPath)
		.filter(Boolean)
		.map((absolutePath) => path.relative(mirror.cwd, absolutePath))
		.slice(0, maxWorkspaceFiles)

	const allowedVisibleFiles = mirror.mirrorIgnoreController
		? mirror.mirrorIgnoreController.filterPaths(visibleFilePaths)
		: visibleFilePaths.map((p) => p.toPosix()).join("\n")

	if (allowedVisibleFiles) {
		details += "\n\n# VSCode Visible Files"
		details += `\n${allowedVisibleFiles}`
	}

	// 4. VSCode Open Tabs (semi-static)
	const { maxOpenTabsContext } = state ?? {}
	const maxTabs = maxOpenTabsContext ?? 20
	const openTabPaths = vscode.window.tabGroups.all
		.flatMap((group) => group.tabs)
		.filter((tab) => tab.input instanceof vscode.TabInputText)
		.map((tab) => (tab.input as vscode.TabInputText).uri.fsPath)
		.filter(Boolean)
		.map((absolutePath) => path.relative(mirror.cwd, absolutePath).toPosix())
		.slice(0, maxTabs)

	const allowedOpenTabs = mirror.mirrorIgnoreController
		? mirror.mirrorIgnoreController.filterPaths(openTabPaths)
		: openTabPaths.map((p) => p.toPosix()).join("\n")

	if (allowedOpenTabs) {
		details += "\n\n# VSCode Open Tabs"
		details += `\n${allowedOpenTabs}`
	}

	// 5. Recently Modified Files (semi-static — changes on edit)
	const recentlyModifiedFiles = mirror.fileContextTracker.getAndClearRecentlyModifiedFiles()

	if (recentlyModifiedFiles.length > 0) {
		details +=
			"\n\n# Recently Modified Files\nThese files have been modified since you last accessed them (file was just edited so you may need to re-read it before editing):"
		for (const filePath of recentlyModifiedFiles) {
			details += `\n${filePath}`
		}
	}

	// 6. Workspace Pulse (semi-static signal about project health)
	if (includeFileDetails) {
		const pulse = await buildWorkspacePulse(mirror, effectiveMode)
		details += pulse
	} else {
		details += `\n\n# Workspace Pulse\n(Use \`get_workspace_pulse\` for live project health data — diagnostics, git branch, terminals, recent changes.)`
	}

	// ── VOLATILE BLOCK (cache-busting — changes every turn) ───────────────

	// 7. Terminal Output (volatile)
	const busyTerminals = [
		...TerminalRegistry.getTerminals(true, mirror.taskId),
		...TerminalRegistry.getBackgroundTerminals(true),
	]

	const inactiveTerminals = [
		...TerminalRegistry.getTerminals(false, mirror.taskId),
		...TerminalRegistry.getBackgroundTerminals(false),
	]

	if (busyTerminals.length > 0) {
		if (mirror.didEditFile) {
			await delay(300)
		}

		await pWaitFor(() => busyTerminals.every((t) => !TerminalRegistry.isProcessHot(t.id)), {
			interval: 100,
			timeout: 5_000,
		}).catch(() => {})
	}

	mirror.didEditFile = false

	if (busyTerminals.length > 0) {
		volatileDetails += "\n\n# Actively Running Terminals"

		for (const busyTerminal of busyTerminals) {
			const cwd = busyTerminal.getCurrentWorkingDirectory()
			volatileDetails += `\n## Terminal ${busyTerminal.id} (Active)`
			volatileDetails += `\n### Working Directory: \`${cwd}\``
			volatileDetails += `\n### Original command: \`${busyTerminal.getLastCommand()}\``
			let newOutput = TerminalRegistry.getUnretrievedOutput(busyTerminal.id)

			if (newOutput) {
				newOutput = Terminal.compressTerminalOutput(newOutput)
				volatileDetails += `\n### New Output\n${newOutput}`
			}
		}
	}

	const terminalsWithOutput = inactiveTerminals.filter((terminal) => {
		const completedProcesses = terminal.getProcessesWithOutput()
		return completedProcesses.length > 0
	})

	if (terminalsWithOutput.length > 0) {
		volatileDetails += "\n\n# Inactive Terminals with Completed Process Output"

		for (const inactiveTerminal of terminalsWithOutput) {
			const completedProcesses = inactiveTerminal.getProcessesWithOutput()
			const terminalOutputs: string[] = []

			for (const process of completedProcesses) {
				let output = process.getUnretrievedOutput()

				if (output) {
					output = Terminal.compressTerminalOutput(output)
					terminalOutputs.push(`Command: \`${process.command}\`\n${output}`)
				}
			}

			inactiveTerminal.cleanCompletedProcessQueue()

			if (terminalOutputs.length > 0) {
				const cwd = inactiveTerminal.getCurrentWorkingDirectory()
				volatileDetails += `\n## Terminal ${inactiveTerminal.id} (Inactive)`
				volatileDetails += `\n### Working Directory: \`${cwd}\``
				terminalOutputs.forEach((output) => {
					volatileDetails += `\n### New Output\n${output}`
				})
			}
		}
	}

	// 8. Git Status (volatile — changes on edit/commit)
	const { maxGitStatusFiles = 0 } = state ?? {}

	if (maxGitStatusFiles > 0) {
		const gitStatus = await getGitStatus(mirror.cwd, maxGitStatusFiles)
		if (gitStatus) {
			volatileDetails += `\n\n# Git Status\n${gitStatus}`
		}
	}

	// 9. Current Cost (volatile — changes on every turn)
	const { includeCurrentCost = true } = state ?? {}

	if (includeCurrentCost) {
		const { totalCost } = getApiMetrics(mirror.mirrorMessages)
		volatileDetails += `\n\n# Current Cost\n${totalCost !== null ? `$${totalCost.toFixed(2)}` : "(Not available)"}`
	}

	// 10. Current Time (volatile — changes on every second)
	const { includeCurrentTime = true } = state ?? {}

	if (includeCurrentTime) {
		const now = new Date()
		// Round to nearest minute for prompt caching optimization
		const roundedIso = new Date(Math.floor(now.getTime() / 60000) * 60000).toISOString()
		const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
		const timeZoneOffset = -now.getTimezoneOffset() / 60
		const timeZoneOffsetHours = Math.floor(Math.abs(timeZoneOffset))
		const timeZoneOffsetMinutes = Math.abs(Math.round((Math.abs(timeZoneOffset) - timeZoneOffsetHours) * 60))
		const timeZoneOffsetStr = `${timeZoneOffset >= 0 ? "+" : "-"}${timeZoneOffsetHours}:${timeZoneOffsetMinutes.toString().padStart(2, "0")}`
		volatileDetails += `\n\n# Current Time\nCurrent time in ISO 8601 UTC format: ${roundedIso}\nUser time zone: ${timeZone}, UTC${timeZoneOffsetStr}`
	}

	if (volatileDetails) {
		details += volatileDetails
	}

	// 11. Reminder Section (moderately volatile)
	const todoListEnabled =
		state && typeof state.apiConfiguration?.todoListEnabled === "boolean"
			? state.apiConfiguration.todoListEnabled
			: true
	const reminderSection = todoListEnabled ? formatReminderSection(mirror.todoList) : ""

	return `<environment_details>\n${details.trim()}\n${reminderSection}\n</environment_details>`
}

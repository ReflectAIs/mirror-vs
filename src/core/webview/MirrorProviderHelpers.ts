import fs from "fs/promises"
import path from "path"
import os from "os"

import * as vscode from "vscode"
import delay from "delay"

import { OrganizationAllowListViolationError } from "../../utils/errors"
import { Package } from "../../shared/package"
import { findLast } from "../../shared/array"
import { supportPrompt } from "../../shared/support-prompt"
import { t } from "../../i18n"

import type { CodeActionId, CodeActionName, TerminalActionId, TerminalActionPromptType } from "@mirror-vs/types"

import type { MirrorProvider } from "./MirrorProvider"

/**
 * Static helpers and utilities for MirrorProvider.
 *
 * Contains:
 * - Static instance resolution (getVisibleInstance, getInstance, isActiveTask)
 * - Code/terminal action handlers
 * - State resets
 * - Directory path utilities (MCP servers, settings)
 */
export class Helpers {
	constructor(private provider: MirrorProvider) {}

	// ── Static helpers (delegated from MirrorProvider static methods) ──

	public static getVisibleInstance(activeInstances: Set<MirrorProvider>): MirrorProvider | undefined {
		return findLast(Array.from(activeInstances), (instance) => instance.getView()?.visible === true)
	}

	public static async getInstance(
		activeInstances: Set<MirrorProvider>,
		providerClass: typeof MirrorProvider,
	): Promise<MirrorProvider | undefined> {
		let visibleProvider = Helpers.getVisibleInstance(activeInstances)

		// If no visible provider, try to show the sidebar view
		if (!visibleProvider) {
			await vscode.commands.executeCommand(`${Package.name}.SidebarProvider.focus`)
			// Wait briefly for the view to become visible
			await delay(100)
			visibleProvider = Helpers.getVisibleInstance(activeInstances)
		}

		return visibleProvider
	}

	public static async isActiveTask(
		activeInstances: Set<MirrorProvider>,
		providerClass: typeof MirrorProvider,
	): Promise<boolean> {
		const visibleProvider = await Helpers.getInstance(activeInstances, providerClass)

		if (!visibleProvider) {
			return false
		}

		// Check if there is a mirror instance in the stack
		if (visibleProvider.getCurrentTask()) {
			return true
		}

		return false
	}

	public static async handleCodeAction(
		activeInstances: Set<MirrorProvider>,
		providerClass: typeof MirrorProvider,
		command: CodeActionId,
		promptType: CodeActionName,
		params: Record<string, string | any[]>,
	): Promise<void> {
		const visibleProvider = await Helpers.getInstance(activeInstances, providerClass)

		if (!visibleProvider) {
			return
		}

		const { customSupportPrompts } = await visibleProvider.getState()

		const prompt = supportPrompt.create(promptType, params, customSupportPrompts)

		if (command === "addToContext") {
			await visibleProvider.postMessageToWebview({
				type: "invoke",
				invoke: "setChatBoxMessage",
				text: `${prompt}\n\n`,
			})
			await visibleProvider.postMessageToWebview({ type: "action", action: "focusInput" })
			return
		}

		await visibleProvider.createTask(prompt)
	}

	public static async handleTerminalAction(
		activeInstances: Set<MirrorProvider>,
		providerClass: typeof MirrorProvider,
		command: TerminalActionId,
		promptType: TerminalActionPromptType,
		params: Record<string, string | any[]>,
	): Promise<void> {
		const visibleProvider = await Helpers.getInstance(activeInstances, providerClass)

		if (!visibleProvider) {
			return
		}

		const { customSupportPrompts } = await visibleProvider.getState()
		const prompt = supportPrompt.create(promptType, params, customSupportPrompts)

		if (command === "terminalAddToContext") {
			await visibleProvider.postMessageToWebview({
				type: "invoke",
				invoke: "setChatBoxMessage",
				text: `${prompt}\n\n`,
			})
			await visibleProvider.postMessageToWebview({ type: "action", action: "focusInput" })
			return
		}

		try {
			await visibleProvider.createTask(prompt)
		} catch (error) {
			if (error instanceof OrganizationAllowListViolationError) {
				vscode.window.showErrorMessage(error.message)
			}

			throw error
		}
	}

	// ── Instance-level helpers ──

	async resetState(): Promise<void> {
		const answer = await vscode.window.showInformationMessage(
			t("common:confirmation.reset_state"),
			{ modal: true },
			t("common:answers.yes"),
		)

		if (answer !== t("common:answers.yes")) {
			return
		}

		await this.provider.contextProxy.resetAllState()
		await this.provider.providerSettingsManager.resetAllConfigs()
		await this.provider.customModesManager.resetCustomModes()
		await this.provider.removeMirrorFromStack()
		await this.provider.postStateToWebview()
		await this.provider.postMessageToWebview({ type: "action", action: "chatButtonClicked" })
	}

	async ensureMcpServersDirectoryExists(): Promise<string> {
		// Get platform-specific application data directory
		let mcpServersDir: string
		if (process.platform === "win32") {
			// Windows: %APPDATA%\Mirror-VS\MCP
			mcpServersDir = path.join(os.homedir(), "AppData", "Roaming", "Mirror-VS", "MCP")
		} else if (process.platform === "darwin") {
			// macOS: ~/Documents/Mirror/MCP
			mcpServersDir = path.join(os.homedir(), "Documents", "Mirror", "MCP")
		} else {
			// Linux: ~/.local/share/Mirror/MCP
			mcpServersDir = path.join(os.homedir(), ".local", "share", "Mirror-VS", "MCP")
		}

		try {
			await fs.mkdir(mcpServersDir, { recursive: true })
		} catch (error) {
			// Fallback to a relative path if directory creation fails
			return path.join(os.homedir(), ".mirror-vs", "mcp")
		}
		return mcpServersDir
	}

	async ensureSettingsDirectoryExists(): Promise<string> {
		const { getSettingsDirectoryPath } = await import("../../utils/storage")
		const globalStoragePath = this.provider.contextProxy.globalStorageUri.fsPath
		return getSettingsDirectoryPath(globalStoragePath)
	}
}

import * as vscode from "vscode"

import { type Language, MirrorVSSettings, ExperimentId } from "@mirror-vs/types"

import type { MirrorProvider } from "../MirrorProvider"
import { getGlobalState, updateGlobalState, getCurrentCwd } from "./_helpers"
import { changeLanguage, t } from "../../../i18n"
import { Package } from "../../../shared/package"
import { Terminal } from "../../../integrations/terminal/Terminal"
import { setTtsEnabled, setTtsSpeed, playTts, stopTts } from "../../../utils/tts"

const ALLOWED_VSCODE_SETTINGS = new Set(["terminal.integrated.inheritEnv"])

/**
 * Handles the updateSettings message - batch update of multiple settings.
 */
export async function handleUpdateSettings(
	provider: MirrorProvider,
	updatedSettings: Record<string, any>,
): Promise<void> {
	if (!updatedSettings) {
		return
	}

	for (const [key, value] of Object.entries(updatedSettings)) {
		let newValue = value

		if (key === "language") {
			newValue = value ?? "en"
			changeLanguage(newValue as Language)
		} else if (key === "allowedCommands") {
			const commands = value ?? []
			newValue = Array.isArray(commands)
				? commands.filter((cmd) => typeof cmd === "string" && cmd.trim().length > 0)
				: []

			await vscode.workspace
				.getConfiguration(Package.name)
				.update("allowedCommands", newValue, vscode.ConfigurationTarget.Global)
		} else if (key === "deniedCommands") {
			const commands = value ?? []

			newValue = Array.isArray(commands)
				? commands.filter((cmd) => typeof cmd === "string" && cmd.trim().length > 0)
				: []

			await vscode.workspace
				.getConfiguration(Package.name)
				.update("deniedCommands", newValue, vscode.ConfigurationTarget.Global)
		} else if (key === "ttsEnabled") {
			newValue = value ?? true
			setTtsEnabled(newValue as boolean)
		} else if (key === "ttsSpeed") {
			newValue = value ?? 1.0
			setTtsSpeed(newValue as number)
		} else if (key === "terminalShellIntegrationTimeout") {
			if (value !== undefined) {
				Terminal.setShellIntegrationTimeout(value as number)
			}
		} else if (key === "terminalShellIntegrationDisabled") {
			if (value !== undefined) {
				Terminal.setShellIntegrationDisabled(value as boolean)
			}
		} else if (key === "terminalCommandDelay") {
			if (value !== undefined) {
				Terminal.setCommandDelay(value as number)
			}
		} else if (key === "terminalPowershellCounter") {
			if (value !== undefined) {
				Terminal.setPowershellCounter(value as boolean)
			}
		} else if (key === "terminalZshClearEolMark") {
			if (value !== undefined) {
				Terminal.setTerminalZshClearEolMark(value as boolean)
			}
		} else if (key === "terminalZshOhMy") {
			if (value !== undefined) {
				Terminal.setTerminalZshOhMy(value as boolean)
			}
		} else if (key === "terminalZshP10k") {
			if (value !== undefined) {
				Terminal.setTerminalZshP10k(value as boolean)
			}
		} else if (key === "terminalZdotdir") {
			if (value !== undefined) {
				Terminal.setTerminalZdotdir(value as boolean)
			}
		} else if (key === "execaShellPath") {
			Terminal.setExecaShellPath(value as string | undefined)
		} else if (key === "mcpEnabled") {
			newValue = value ?? true
			const mcpHub = provider.getMcpHub()

			if (mcpHub) {
				await mcpHub.handleMcpEnabledChange(newValue as boolean)
			}
		} else if (key === "experiments") {
			if (!value) {
				continue
			}

			const { experimentDefault } = await import("../../../shared/experiments")

			newValue = {
				...(getGlobalState(provider, "experiments") ?? experimentDefault),
				...(value as Record<ExperimentId, boolean>),
			}
		} else if (key === "customSupportPrompts") {
			if (!value) {
				continue
			}
		}

		await provider.contextProxy.setValue(key as keyof MirrorVSSettings, newValue)
	}

	await provider.postStateToWebview()
}

/**
 * Handles the ttsEnabled message.
 */
export async function handleTtsEnabled(provider: MirrorProvider, bool?: boolean): Promise<void> {
	const ttsEnabled = bool ?? true
	await updateGlobalState(provider, "ttsEnabled", ttsEnabled)
	setTtsEnabled(ttsEnabled)
	await provider.postStateToWebview()
}

/**
 * Handles the ttsSpeed message.
 */
export async function handleTtsSpeed(provider: MirrorProvider, value?: number): Promise<void> {
	const ttsSpeed = value ?? 1.0
	await updateGlobalState(provider, "ttsSpeed", ttsSpeed)
	setTtsSpeed(ttsSpeed)
	await provider.postStateToWebview()
}

/**
 * Handles the playTts message.
 */
export async function handlePlayTts(provider: MirrorProvider, text?: string): Promise<void> {
	if (text) {
		playTts(text, {
			onStart: () => provider.postMessageToWebview({ type: "ttsStart", text }),
			onStop: () => provider.postMessageToWebview({ type: "ttsStop", text }),
		})
	}
}

/**
 * Handles the stopTts message.
 */
export function handleStopTts(): void {
	stopTts()
}

/**
 * Handles the updateVSCodeSetting message.
 */
export async function handleUpdateVSCodeSetting(setting: string | undefined, value: any | undefined): Promise<void> {
	if (setting !== undefined && value !== undefined) {
		if (ALLOWED_VSCODE_SETTINGS.has(setting)) {
			await vscode.workspace.getConfiguration().update(setting, value, true)
		} else {
			vscode.window.showErrorMessage(`Cannot update restricted VSCode setting: ${setting}`)
		}
	}
}

/**
 * Handles the getVSCodeSetting message.
 */
export async function handleGetVSCodeSetting(provider: MirrorProvider, setting: string | undefined): Promise<void> {
	if (setting) {
		try {
			await provider.postMessageToWebview({
				type: "vsCodeSetting",
				setting,
				value: vscode.workspace.getConfiguration().get(setting),
			})
		} catch (error) {
			console.error(`Failed to get VSCode setting ${setting}:`, error)

			await provider.postMessageToWebview({
				type: "vsCodeSetting",
				setting,
				error: `Failed to get setting: ${(error as any).message}`,
				value: undefined,
			})
		}
	}
}

/**
 * Handles the allowedCommands message.
 */
export async function handleAllowedCommands(provider: MirrorProvider, commands?: string[]): Promise<void> {
	const validCommands = Array.isArray(commands)
		? commands.filter((cmd) => typeof cmd === "string" && cmd.trim().length > 0)
		: []

	await updateGlobalState(provider, "allowedCommands", validCommands)

	await vscode.workspace
		.getConfiguration(Package.name)
		.update("allowedCommands", validCommands, vscode.ConfigurationTarget.Global)
}

/**
 * Handles the deniedCommands message.
 */
export async function handleDeniedCommands(provider: MirrorProvider, commands?: string[]): Promise<void> {
	const validCommands = Array.isArray(commands)
		? commands.filter((cmd) => typeof cmd === "string" && cmd.trim().length > 0)
		: []

	await updateGlobalState(provider, "deniedCommands", validCommands)

	await vscode.workspace
		.getConfiguration(Package.name)
		.update("deniedCommands", validCommands, vscode.ConfigurationTarget.Global)
}

/**
 * Handles the debugSetting message.
 */
export async function handleDebugSetting(provider: MirrorProvider, bool?: boolean): Promise<void> {
	await vscode.workspace
		.getConfiguration(Package.name)
		.update("debug", bool ?? false, vscode.ConfigurationTarget.Global)
	await provider.postStateToWebview()
}

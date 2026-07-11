import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs/promises"

import type { WebviewMessage } from "@mirror-vs/types"

import type { MirrorProvider } from "../MirrorProvider"
import { getCurrentCwd } from "./_helpers"
import { t } from "../../../i18n"

/**
 * Handles the openMcpSettings message.
 */
export async function handleOpenMcpSettings(provider: MirrorProvider): Promise<void> {
	const mcpSettingsFilePath = await provider.getMcpHub()?.getMcpSettingsFilePath()

	if (mcpSettingsFilePath) {
		const { openFile } = await import("../../../integrations/misc/open-file")
		openFile(mcpSettingsFilePath)
	}
}

/**
 * Handles the openProjectMcpSettings message.
 */
export async function handleOpenProjectMcpSettings(provider: MirrorProvider): Promise<void> {
	if (!vscode.workspace.workspaceFolders?.length) {
		vscode.window.showErrorMessage(t("common:errors.no_workspace"))
		return
	}

	const workspaceFolder = getCurrentCwd(provider)
	const mirrorDir = path.join(workspaceFolder, ".mirror")
	const mcpPath = path.join(mirrorDir, "mcp.json")

	try {
		await fs.mkdir(mirrorDir, { recursive: true })
		const { fileExistsAtPath } = await import("../../../utils/fs")
		const exists = await fileExistsAtPath(mcpPath)

		if (!exists) {
			const { safeWriteJson } = await import("../../../utils/safeWriteJson")
			await safeWriteJson(mcpPath, { mcpServers: {} }, { prettyPrint: true })
		}

		const { openFile } = await import("../../../integrations/misc/open-file")
		await openFile(mcpPath)
	} catch (error) {
		vscode.window.showErrorMessage(t("mcp:errors.create_json", { error: `${error}` }))
	}
}

/**
 * Handles the deleteMcpServer message.
 */
export async function handleDeleteMcpServer(
	provider: MirrorProvider,
	serverName?: string,
	source?: string,
): Promise<void> {
	if (!serverName) {
		return
	}

	try {
		provider.log(`Attempting to delete MCP server: ${serverName}`)
		await provider.getMcpHub()?.deleteServer(serverName, source as "global" | "project")
		provider.log(`Successfully deleted MCP server: ${serverName}`)

		await provider.postStateToWebview()
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error)
		provider.log(`Failed to delete MCP server: ${errorMessage}`)
	}
}

/**
 * Handles the restartMcpServer message.
 */
export async function handleRestartMcpServer(
	provider: MirrorProvider,
	serverName?: string,
	source?: string,
): Promise<void> {
	try {
		await provider.getMcpHub()?.restartConnection(serverName!, source as "global" | "project")
	} catch (error) {
		provider.log(
			`Failed to retry connection for ${serverName}: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
		)
	}
}

/**
 * Handles the toggleToolAlwaysAllow message.
 */
export async function handleToggleToolAlwaysAllow(provider: MirrorProvider, message: WebviewMessage): Promise<void> {
	try {
		await provider
			.getMcpHub()
			?.toggleToolAlwaysAllow(
				message.serverName!,
				message.source as "global" | "project",
				message.toolName!,
				Boolean(message.alwaysAllow),
			)
	} catch (error) {
		provider.log(
			`Failed to toggle auto-approve for tool ${message.toolName}: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
		)
	}
}

/**
 * Handles the toggleToolEnabledForPrompt message.
 */
export async function handleToggleToolEnabledForPrompt(
	provider: MirrorProvider,
	message: WebviewMessage,
): Promise<void> {
	try {
		await provider
			.getMcpHub()
			?.toggleToolEnabledForPrompt(
				message.serverName!,
				message.source as "global" | "project",
				message.toolName!,
				Boolean(message.isEnabled),
			)
	} catch (error) {
		provider.log(
			`Failed to toggle enabled for prompt for tool ${message.toolName}: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
		)
	}
}

/**
 * Handles the toggleMcpServer message.
 */
export async function handleToggleMcpServer(provider: MirrorProvider, message: WebviewMessage): Promise<void> {
	try {
		await provider
			.getMcpHub()
			?.toggleServerDisabled(message.serverName!, message.disabled!, message.source as "global" | "project")
	} catch (error) {
		provider.log(
			`Failed to toggle MCP server ${message.serverName}: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
		)
	}
}

/**
 * Handles the refreshAllMcpServers message.
 */
export async function handleRefreshAllMcpServers(provider: MirrorProvider): Promise<void> {
	const mcpHub = provider.getMcpHub()

	if (mcpHub) {
		await mcpHub.refreshAllConnections()
	}
}

/**
 * Handles the updateMcpTimeout message.
 */
export async function handleUpdateMcpTimeout(
	provider: MirrorProvider,
	serverName?: string,
	timeout?: number,
	source?: string,
): Promise<void> {
	if (serverName && typeof timeout === "number") {
		try {
			await provider.getMcpHub()?.updateServerTimeout(serverName, timeout, source as "global" | "project")
		} catch (error) {
			provider.log(
				`Failed to update timeout for ${serverName}: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
			)
			vscode.window.showErrorMessage(t("common:errors.update_server_timeout"))
		}
	}
}

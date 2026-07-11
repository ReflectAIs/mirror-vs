import * as vscode from "vscode"
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"

import { type WebviewMessage } from "@mirror-vs/types"

import { MirrorProvider } from "../MirrorProvider"
import { t } from "../../../i18n"
import { openFile } from "../../../integrations/misc/open-file"
import { getCurrentCwd, getDiscoveredCommands } from "./_helpers"

/**
 * Handles requesting the list of slash commands and skill-backed commands.
 */
export async function handleRequestCommands(provider: MirrorProvider): Promise<void> {
	try {
		const commandList = await getDiscoveredCommands(provider)
		await provider.postMessageToWebview({ type: "commands", commands: commandList })
	} catch (error) {
		provider.log(`Error fetching commands: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`)
		await provider.postMessageToWebview({ type: "commands", commands: [] })
	}
}

/**
 * Handles opening a command file by name.
 */
export async function handleOpenCommandFile(provider: MirrorProvider, message: WebviewMessage): Promise<void> {
	try {
		if (message.text) {
			const { getCommand } = await import("../../../services/command/commands")
			const command = await getCommand(getCurrentCwd(provider), message.text)

			if (command && command.filePath) {
				openFile(command.filePath)
			} else {
				vscode.window.showErrorMessage(t("common:errors.command_not_found", { name: message.text }))
			}
		}
	} catch (error) {
		provider.log(`Error opening command file: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`)
		vscode.window.showErrorMessage(t("common:errors.open_command_file"))
	}
}

/**
 * Handles deleting a command file by name.
 */
export async function handleDeleteCommand(provider: MirrorProvider, message: WebviewMessage): Promise<void> {
	try {
		if (message.text && message.values?.source) {
			const { getCommand } = await import("../../../services/command/commands")
			const command = await getCommand(getCurrentCwd(provider), message.text)

			if (command && command.filePath) {
				await fs.unlink(command.filePath)
				provider.log(`Deleted command file: ${command.filePath}`)
			} else {
				vscode.window.showErrorMessage(t("common:errors.command_not_found", { name: message.text }))
			}
		}
	} catch (error) {
		provider.log(`Error deleting command: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`)
		vscode.window.showErrorMessage(t("common:errors.delete_command"))
	}
}

/**
 * Handles creating a new command file.
 */
export async function handleCreateCommand(provider: MirrorProvider, message: WebviewMessage): Promise<void> {
	try {
		const source = message.values?.source as "global" | "project"
		const fileName = message.text

		if (!source) {
			provider.log("Missing source for createCommand")
			return
		}

		let commandsDir: string
		if (source === "global") {
			const globalConfigDir = path.join(os.homedir(), ".mirror")
			commandsDir = path.join(globalConfigDir, "commands")
		} else {
			if (!vscode.workspace.workspaceFolders?.length) {
				vscode.window.showErrorMessage(t("common:errors.no_workspace"))
				return
			}
			const workspaceMirrorDir = getCurrentCwd(provider)
			if (!workspaceMirrorDir) {
				vscode.window.showErrorMessage(t("common:errors.no_workspace_for_project_command"))
				return
			}
			commandsDir = path.join(workspaceMirrorDir, ".mirror", "commands")
		}

		await fs.mkdir(commandsDir, { recursive: true })

		let commandName: string
		if (fileName && fileName.trim()) {
			let cleanFileName = fileName.trim()

			if (cleanFileName.startsWith("/")) {
				cleanFileName = cleanFileName.substring(1)
			}

			if (cleanFileName.toLowerCase().endsWith(".md")) {
				cleanFileName = cleanFileName.slice(0, -3)
			}

			commandName = cleanFileName
				.toLowerCase()
				.replace(/\s+/g, "-")
				.replace(/[^a-z0-9-]/g, "")
				.replace(/-+/g, "-")
				.replace(/^-|-$/g, "")

			if (!commandName || commandName.length === 0) {
				commandName = "new-command"
			}
		} else {
			commandName = "new-command"
			let counter = 1
			let filePath = path.join(commandsDir, `${commandName}.md`)

			while (
				await fs
					.access(filePath)
					.then(() => true)
					.catch(() => false)
			) {
				commandName = `new-command-${counter}`
				filePath = path.join(commandsDir, `${commandName}.md`)
				counter++
			}
		}

		const filePath = path.join(commandsDir, `${commandName}.md`)

		if (
			await fs
				.access(filePath)
				.then(() => true)
				.catch(() => false)
		) {
			vscode.window.showErrorMessage(t("common:errors.command_already_exists", { commandName }))
			return
		}

		const templateContent = t("common:errors.command_template_content")

		await fs.writeFile(filePath, templateContent, "utf8")
		provider.log(`Created new command file: ${filePath}`)

		openFile(filePath)

		const { getCommands } = await import("../../../services/command/commands")
		const commands = await getCommands(getCurrentCwd(provider) || "")
		const commandList = commands.map((command) => ({
			name: command.name,
			source: command.source,
			filePath: command.filePath,
			description: command.description,
			argumentHint: command.argumentHint,
		}))
		await provider.postMessageToWebview({
			type: "commands",
			commands: commandList,
		})
	} catch (error) {
		provider.log(`Error creating command: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`)
		vscode.window.showErrorMessage(t("common:errors.create_command_failed"))
	}
}

/**
 * Handles requesting the list of available modes.
 */
export async function handleRequestModes(provider: MirrorProvider): Promise<void> {
	try {
		const modes = await provider.getModes()
		await provider.postMessageToWebview({ type: "modes", modes })
	} catch (error) {
		provider.log(`Error fetching modes: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`)
		await provider.postMessageToWebview({ type: "modes", modes: [] })
	}
}

import * as vscode from "vscode"

import { Package } from "../shared/package"
import { MirrorProvider } from "../core/webview/MirrorProvider"
import { t } from "../i18n"

export const handleNewTask = async (params: { prompt?: string } | null | undefined) => {
	let prompt = params?.prompt

	if (!prompt) {
		prompt = await vscode.window.showInputBox({
			prompt: t("common:input.task_prompt"),
			placeHolder: t("common:input.task_placeholder"),
		})
	}

	if (!prompt) {
		await vscode.commands.executeCommand(`${Package.name}.SidebarProvider.focus`)
		return
	}

	await MirrorProvider.handleCodeAction("newTask", "NEW_TASK", { userInput: prompt })
}

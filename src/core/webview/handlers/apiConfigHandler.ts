import * as vscode from "vscode"

import type { WebviewMessage } from "@mirror-vs/types"

import type { MirrorProvider } from "../MirrorProvider"
import { t } from "../../../i18n"

/**
 * Handles the saveApiConfiguration message.
 */
export async function handleSaveApiConfiguration(
	provider: MirrorProvider,
	name?: string,
	apiConfiguration?: any,
): Promise<void> {
	if (name && apiConfiguration) {
		try {
			await provider.providerSettingsManager.saveConfig(name, apiConfiguration)
			const listApiConfig = await provider.providerSettingsManager.listConfig()
			await provider.contextProxy.setValue("listApiConfigMeta", listApiConfig)
		} catch (error) {
			provider.log(`Error save api configuration: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`)
			vscode.window.showErrorMessage(t("common:errors.save_api_config"))
		}
	}
}

/**
 * Handles the upsertApiConfiguration message.
 */
export async function handleUpsertApiConfiguration(
	provider: MirrorProvider,
	name?: string,
	apiConfiguration?: any,
): Promise<void> {
	if (name && apiConfiguration) {
		await provider.upsertProviderProfile(name, apiConfiguration)
	}
}

/**
 * Handles the renameApiConfiguration message.
 */
export async function handleRenameApiConfiguration(
	provider: MirrorProvider,
	values?: { oldName?: string; newName?: string },
	apiConfiguration?: any,
): Promise<void> {
	if (values && apiConfiguration) {
		try {
			const { oldName, newName } = values

			if (oldName === newName) {
				return
			}

			const { id } = await provider.providerSettingsManager.getProfile({ name: oldName! })
			await provider.providerSettingsManager.saveConfig(newName!, { ...apiConfiguration, id })
			await provider.providerSettingsManager.deleteConfig(oldName!)
			await provider.activateProviderProfile({ name: newName! })
		} catch (error) {
			provider.log(
				`Error rename api configuration: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
			)
			vscode.window.showErrorMessage(t("common:errors.rename_api_config"))
		}
	}
}

/**
 * Handles the loadApiConfiguration message.
 */
export async function handleLoadApiConfiguration(provider: MirrorProvider, name?: string): Promise<void> {
	if (name) {
		try {
			await provider.activateProviderProfile({ name })
		} catch (error) {
			provider.log(`Error load api configuration: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`)
			vscode.window.showErrorMessage(t("common:errors.load_api_config"))
		}
	}
}

/**
 * Handles the loadApiConfigurationById message.
 */
export async function handleLoadApiConfigurationById(provider: MirrorProvider, id?: string): Promise<void> {
	if (id) {
		try {
			await provider.activateProviderProfile({ id })
		} catch (error) {
			provider.log(
				`Error load api configuration by ID: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
			)
			vscode.window.showErrorMessage(t("common:errors.load_api_config"))
		}
	}
}

/**
 * Handles the deleteApiConfiguration message.
 */
export async function handleDeleteApiConfiguration(provider: MirrorProvider, name?: string): Promise<void> {
	if (name) {
		const answer = await vscode.window.showInformationMessage(
			t("common:confirmation.delete_config_profile"),
			{ modal: true },
			t("common:answers.yes"),
		)

		if (answer !== t("common:answers.yes")) {
			return
		}

		const newName = (await provider.providerSettingsManager.listConfig()).filter((c) => c.name !== name)[0]?.name

		if (!newName) {
			vscode.window.showErrorMessage(t("common:errors.delete_api_config"))
			return
		}

		try {
			await provider.providerSettingsManager.deleteConfig(name)
			await provider.activateProviderProfile({ name: newName })
		} catch (error) {
			provider.log(
				`Error delete api configuration: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
			)
			vscode.window.showErrorMessage(t("common:errors.delete_api_config"))
		}
	}
}

/**
 * Handles the getListApiConfiguration message.
 */
export async function handleGetListApiConfiguration(provider: MirrorProvider): Promise<void> {
	try {
		const listApiConfig = await provider.providerSettingsManager.listConfig()
		await provider.contextProxy.setValue("listApiConfigMeta", listApiConfig)
		provider.postMessageToWebview({ type: "listApiConfig", listApiConfig })
	} catch (error) {
		provider.log(`Error get list api configuration: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`)
		vscode.window.showErrorMessage(t("common:errors.list_api_config"))
	}
}

/**
 * Handles the modelChange message.
 *
 * IMPORTANT: This handler intentionally does NOT call postStateToWebview().
 * The webview already updates its local state (via setApiConfigurationField)
 * before sending this message. Pushing state back causes a race condition:
 * setProviderSettings() clears all non-secret ProviderSettings keys to
 * undefined first, then applies only the partial fields from the modelChange
 * message. When that partial state reaches mergeExtensionState(), it replaces
 * the webview's complete apiConfiguration, causing useSelectedModel() to
 * recompute and potentially snap the dropdown back to a different model.
 */
export async function handleModelChange(provider: MirrorProvider, apiConfiguration?: any): Promise<void> {
	if (apiConfiguration) {
		const currentTask = provider.getCurrentTask()
		if (currentTask) {
			currentTask.updateApiConfiguration(apiConfiguration)
		}
		if (provider.contextProxy) {
			await provider.contextProxy.setProviderSettings(apiConfiguration)
			const currentProfileName = provider.contextProxy.getValue("currentApiConfigName")
			if (currentProfileName) {
				await provider.providerSettingsManager.saveConfig(currentProfileName, apiConfiguration)
			}
		}
	}
}

/**
 * Handles the lockApiConfigAcrossModes message.
 */
export async function handleLockApiConfigAcrossModes(provider: MirrorProvider, bool?: boolean): Promise<void> {
	const enabled = bool ?? false
	await provider.context.workspaceState.update("lockApiConfigAcrossModes", enabled)
	await provider.postStateToWebview()
}

/**
 * Handles the toggleApiConfigPin message.
 */
export async function handleToggleApiConfigPin(provider: MirrorProvider, name?: string): Promise<void> {
	if (name) {
		const currentPinned = provider.contextProxy.getValue("pinnedApiConfigs") ?? {}
		const updatedPinned: Record<string, boolean> = { ...currentPinned }

		if (currentPinned[name]) {
			delete updatedPinned[name]
		} else {
			updatedPinned[name] = true
		}

		await provider.contextProxy.setValue("pinnedApiConfigs", updatedPinned)
		await provider.postStateToWebview()
	}
}

/**
 * Handles the enhancementApiConfigId message.
 */
export async function handleEnhancementApiConfigId(provider: MirrorProvider, id?: string): Promise<void> {
	await provider.contextProxy.setValue("enhancementApiConfigId", id)
	await provider.postStateToWebview()
}

/**
 * Handles the autoApprovalEnabled message.
 */
export async function handleAutoApprovalEnabled(provider: MirrorProvider, bool?: boolean): Promise<void> {
	await provider.contextProxy.setValue("autoApprovalEnabled", bool ?? false)
	await provider.postStateToWebview()
}

/**
 * Handles the importSettings message.
 */
export async function handleImportSettings(provider: MirrorProvider): Promise<void> {
	const { importSettingsWithFeedback } = await import("../../config/importExport")
	await importSettingsWithFeedback({
		providerSettingsManager: provider.providerSettingsManager,
		contextProxy: provider.contextProxy,
		customModesManager: provider.customModesManager,
		provider,
	})
}

/**
 * Handles the exportSettings message.
 */
export async function handleExportSettings(provider: MirrorProvider): Promise<void> {
	const { exportSettings } = await import("../../config/importExport")
	await exportSettings({
		providerSettingsManager: provider.providerSettingsManager,
		contextProxy: provider.contextProxy,
	})
}

/**
 * Handles the resetState message.
 */
export async function handleResetState(provider: MirrorProvider): Promise<void> {
	await provider.resetState()
}

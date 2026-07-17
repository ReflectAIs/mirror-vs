import * as vscode from "vscode"
import axios from "axios"

import {
	type ProviderSettings,
	type ProviderSettingsEntry,
	type MirrorVSSettings,
	MirrorVSEventName,
	openRouterDefaultModelId,
	requestyDefaultModelId,
	getModelId,
	isRetiredProvider,
} from "@mirror-vs/types"

import { REQUESTY_BASE_URL } from "../../shared/utils/requesty"
import { ProfileValidator } from "../../shared/ProfileValidator"

import { OrganizationAllowListViolationError } from "../../utils/errors"
import { Package } from "../../shared/package"
import { t } from "../../i18n"

import type { MirrorProvider } from "./MirrorProvider"

/**
 * Manages provider profile CRUD — saving, activating, deleting, and updating
 * provider configurations for MirrorProvider.
 *
 * Extracted from MirrorProvider.ts to reduce the monolithic class.
 */
export class ProfileManager {
	constructor(private provider: MirrorProvider) {}

	// ── API handler sync ──────────────────────────────────────────────────────

	private updateTaskApiHandlerIfNeeded(
		providerSettings: ProviderSettings,
		options: { forceRebuild?: boolean } = {},
	): void {
		const task = this.provider.getCurrentTask()
		if (!task) return

		const { forceRebuild = false } = options

		// Determine if we need to rebuild using the previous configuration snapshot
		const prevConfig = task.apiConfiguration
		const prevProvider = prevConfig?.apiProvider
		const prevModelId = prevConfig ? getModelId(prevConfig) : undefined
		const newProvider = providerSettings.apiProvider
		const newModelId = getModelId(providerSettings)

		const needsRebuild = forceRebuild || prevProvider !== newProvider || prevModelId !== newModelId

		if (needsRebuild) {
			// Use updateApiConfiguration which handles both API handler rebuild and parser sync.
			// Note: updateApiConfiguration is declared async but has no actual async operations,
			// so we can safely call it without awaiting.
			task.updateApiConfiguration(providerSettings)
		} else {
			// No rebuild needed, just sync apiConfiguration
			;(task as any).apiConfiguration = providerSettings
		}
	}

	// ── Profile queries ───────────────────────────────────────────────────────

	getProviderProfileEntries(): ProviderSettingsEntry[] {
		return this.provider.contextProxy.getValues().listApiConfigMeta || []
	}

	getProviderProfileEntry(name: string): ProviderSettingsEntry | undefined {
		return this.getProviderProfileEntries().find((profile) => profile.name === name)
	}

	hasProviderProfileEntry(name: string): boolean {
		return !!this.getProviderProfileEntry(name)
	}

	// ── Upsert ────────────────────────────────────────────────────────────────

	async upsertProviderProfile(
		name: string,
		providerSettings: ProviderSettings,
		activate: boolean = true,
	): Promise<string | undefined> {
		try {
			// TODO: Do we need to be calling `activateProfile`? It's not
			// clear to me what the source of truth should be; in some cases
			// we rely on the `ContextProxy`'s data store and in other cases
			// we rely on the `ProviderSettingsManager`'s data store. It might
			// be simpler to unify these two.
			const id = await this.provider.providerSettingsManager.saveConfig(name, providerSettings)

			if (activate) {
				const { mode } = await this.provider.getState()

				// These promises do the following:
				// 1. Adds or updates the list of provider profiles.
				// 2. Sets the current provider profile.
				// 3. Sets the current mode's provider profile.
				// 4. Copies the provider settings to the context.
				//
				// Note: 1, 2, and 4 can be done in one `ContextProxy` call:
				// this.contextProxy.setValues({ ...providerSettings, listApiConfigMeta: ..., currentApiConfigName: ... })
				// We should probably switch to that and verify that it works.
				// I left the original implementation in just to be safe.
				await Promise.all([
					this.provider.contextProxy.setValue(
						"listApiConfigMeta",
						await this.provider.providerSettingsManager.listConfig(),
					),
					this.provider.contextProxy.setValue("currentApiConfigName", name),
					this.provider.providerSettingsManager.setModeConfig(mode, id),
					this.provider.contextProxy.setProviderSettings(providerSettings),
				])

				// Change the provider for the current task.
				// TODO: We should rename `buildApiHandler` for clarity (e.g. `getProviderClient`).
				this.updateTaskApiHandlerIfNeeded(providerSettings, { forceRebuild: true })

				// Keep the current task's sticky provider profile in sync with the newly-activated profile.
				await this.persistStickyProviderProfileToCurrentTask(name)
			} else {
				await this.provider.contextProxy.setValue(
					"listApiConfigMeta",
					await this.provider.providerSettingsManager.listConfig(),
				)
			}

			await this.provider.postStateToWebview()
			return id
		} catch (error) {
			this.provider.log(
				`Error create new api configuration: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
			)

			vscode.window.showErrorMessage(t("common:errors.create_api_config"))
			return undefined
		}
	}

	// ── Delete ────────────────────────────────────────────────────────────────

	async deleteProviderProfile(profileToDelete: ProviderSettingsEntry) {
		const globalSettings = this.provider.contextProxy.getValues()
		let profileToActivate: string | undefined = globalSettings.currentApiConfigName

		if (profileToDelete.name === profileToActivate) {
			profileToActivate = this.getProviderProfileEntries().find(({ name }) => name !== profileToDelete.name)?.name
		}

		if (!profileToActivate) {
			throw new Error("You cannot delete the last profile")
		}

		const entries = this.getProviderProfileEntries().filter(({ name }) => name !== profileToDelete.name)

		await this.provider.contextProxy.setValues({
			...globalSettings,
			currentApiConfigName: profileToActivate,
			listApiConfigMeta: entries,
		})

		await this.provider.postStateToWebview()
	}

	// ── Sticky provider profile ───────────────────────────────────────────────

	private async persistStickyProviderProfileToCurrentTask(apiConfigName: string): Promise<void> {
		const task = this.provider.getCurrentTask()
		if (!task) {
			return
		}

		try {
			// Update in-memory state immediately so sticky behavior works even before the task has
			// been persisted into taskHistory (it will be captured on the next save).
			task.setTaskApiConfigName(apiConfigName)

			const taskHistoryItem =
				this.provider.taskHistoryStore.get(task.taskId) ??
				(this.provider.contextProxy.getValue("taskHistory") ?? []).find((item: any) => item.id === task.taskId)

			if (taskHistoryItem) {
				await this.provider.updateTaskHistory({ ...taskHistoryItem, apiConfigName })
			}
		} catch (error) {
			// If persistence fails, log the error but don't fail the profile switch.
			this.provider.log(
				`Failed to persist provider profile switch for task ${task.taskId}: ${
					error instanceof Error ? error.message : String(error)
				}`,
			)
		}
	}

	// ── Activate ──────────────────────────────────────────────────────────────

	async activateProviderProfile(
		args: { name: string } | { id: string },
		options?: { persistModeConfig?: boolean; persistTaskHistory?: boolean },
	) {
		const { name, id, ...providerSettings } = await this.provider.providerSettingsManager.activateProfile(args)

		const persistModeConfig = options?.persistModeConfig ?? true
		const persistTaskHistory = options?.persistTaskHistory ?? true

		// See `upsertProviderProfile` for a description of what this is doing.
		await Promise.all([
			this.provider.contextProxy.setValue(
				"listApiConfigMeta",
				await this.provider.providerSettingsManager.listConfig(),
			),
			this.provider.contextProxy.setValue("currentApiConfigName", name),
			this.provider.contextProxy.setProviderSettings(providerSettings),
		])

		const { mode } = await this.provider.getState()

		if (id && persistModeConfig) {
			await this.provider.providerSettingsManager.setModeConfig(mode, id)
		}

		// Change the provider for the current task.
		this.updateTaskApiHandlerIfNeeded(providerSettings, { forceRebuild: true })

		// Update the current task's sticky provider profile, unless this activation is
		// being used purely as a non-persisting restoration (e.g., reopening a task from history).
		if (persistTaskHistory) {
			await this.persistStickyProviderProfileToCurrentTask(name)
		}

		await this.provider.postStateToWebview()

		if (providerSettings.apiProvider) {
			this.provider.emit(MirrorVSEventName.ProviderProfileChanged, {
				name,
				provider: providerSettings.apiProvider,
			})
		}
	}

	// ── Custom instructions ───────────────────────────────────────────────────

	async updateCustomInstructions(instructions?: string) {
		// User may be clearing the field.
		await this.provider.contextProxy.setValue("customInstructions", instructions || undefined)
		await this.provider.postStateToWebview()
	}

	// ── OpenRouter callback ───────────────────────────────────────────────────

	async handleOpenRouterCallback(code: string) {
		let { apiConfiguration, currentApiConfigName = "default" } = await this.provider.getState()

		let apiKey: string

		try {
			const baseUrl = apiConfiguration.openRouterBaseUrl || "https://openrouter.ai/api/v1"
			// Extract the base domain for the auth endpoint.
			const baseUrlDomain = baseUrl.match(/^(https?:\/\/[^/]+)/)?.[1] || "https://openrouter.ai"
			const response = await axios.post(`${baseUrlDomain}/api/v1/auth/keys`, { code })

			if (response.data && response.data.key) {
				apiKey = response.data.key
			} else {
				throw new Error("Invalid response from OpenRouter API")
			}
		} catch (error) {
			this.provider.log(
				`Error exchanging code for API key: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
			)

			throw error
		}

		const newConfiguration: ProviderSettings = {
			...apiConfiguration,
			apiProvider: "openrouter",
			openRouterApiKey: apiKey,
			openRouterModelId: apiConfiguration?.openRouterModelId || openRouterDefaultModelId,
		}

		await this.upsertProviderProfile(currentApiConfigName, newConfiguration)
	}

	// ── Requesty callback ─────────────────────────────────────────────────────

	async handleRequestyCallback(code: string, baseUrl: string | null) {
		let { apiConfiguration } = await this.provider.getState()

		const newConfiguration: ProviderSettings = {
			...apiConfiguration,
			apiProvider: "requesty",
			requestyApiKey: code,
			requestyModelId: apiConfiguration?.requestyModelId || requestyDefaultModelId,
		}

		// set baseUrl as undefined if we don't provide one
		// or if it is the default requesty url
		if (!baseUrl || baseUrl === REQUESTY_BASE_URL) {
			newConfiguration.requestyBaseUrl = undefined
		} else {
			newConfiguration.requestyBaseUrl = baseUrl
		}

		const profileName = `Requesty (${new Date().toLocaleString()})`
		await this.upsertProviderProfile(profileName, newConfiguration)
	}
}

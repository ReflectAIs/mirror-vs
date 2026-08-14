import * as vscode from "vscode"

import { type WebviewMessage } from "@mirror-vs/types"

import { MirrorProvider } from "../MirrorProvider"
import { CodeIndexManager } from "../../../services/code-index/manager"
import { t } from "../../../i18n"
import { getGlobalState, updateGlobalState } from "./_helpers"

/**
 * Handles saving code index settings atomically — persists global config,
 * secrets, then optionally reinitializes the index manager.
 */
export async function handleSaveCodeIndexSettingsAtomic(
	provider: MirrorProvider,
	message: WebviewMessage,
): Promise<void> {
	if (!message.codeIndexSettings) {
		return
	}

	const settings = message.codeIndexSettings

	try {
		const currentConfig = getGlobalState(provider, "codebaseIndexConfig") || {}
		const embedderProviderChanged =
			currentConfig.codebaseIndexEmbedderProvider !== settings.codebaseIndexEmbedderProvider

		const globalStateConfig = {
			...currentConfig,
			codebaseIndexEnabled: settings.codebaseIndexEnabled,
			codebaseIndexQdrantUrl: settings.codebaseIndexQdrantUrl,
			codebaseIndexEmbedderProvider: settings.codebaseIndexEmbedderProvider,
			codebaseIndexEmbedderBaseUrl: settings.codebaseIndexEmbedderBaseUrl,
			codebaseIndexEmbedderModelId: settings.codebaseIndexEmbedderModelId,
			codebaseIndexEmbedderModelDimension: settings.codebaseIndexEmbedderModelDimension,
			codebaseIndexOpenAiCompatibleBaseUrl: settings.codebaseIndexOpenAiCompatibleBaseUrl,
			codebaseIndexBedrockRegion: settings.codebaseIndexBedrockRegion,
			codebaseIndexBedrockProfile: settings.codebaseIndexBedrockProfile,
			codebaseIndexSearchMaxResults: settings.codebaseIndexSearchMaxResults,
			codebaseIndexSearchMinScore: settings.codebaseIndexSearchMinScore,
			codebaseIndexOpenRouterSpecificProvider: settings.codebaseIndexOpenRouterSpecificProvider,
		}

		await updateGlobalState(provider, "codebaseIndexConfig", globalStateConfig)

		if (settings.codeIndexOpenAiKey !== undefined) {
			await provider.contextProxy.storeSecret("codeIndexOpenAiKey", settings.codeIndexOpenAiKey)
		}
		if (settings.codeIndexQdrantApiKey !== undefined) {
			await provider.contextProxy.storeSecret("codeIndexQdrantApiKey", settings.codeIndexQdrantApiKey)
		}
		if (settings.codebaseIndexOpenAiCompatibleApiKey !== undefined) {
			await provider.contextProxy.storeSecret(
				"codebaseIndexOpenAiCompatibleApiKey",
				settings.codebaseIndexOpenAiCompatibleApiKey,
			)
		}
		if (settings.codebaseIndexGeminiApiKey !== undefined) {
			await provider.contextProxy.storeSecret("codebaseIndexGeminiApiKey", settings.codebaseIndexGeminiApiKey)
		}
		if (settings.codebaseIndexMistralApiKey !== undefined) {
			await provider.contextProxy.storeSecret("codebaseIndexMistralApiKey", settings.codebaseIndexMistralApiKey)
		}
		if (settings.codebaseIndexVercelAiGatewayApiKey !== undefined) {
			await provider.contextProxy.storeSecret(
				"codebaseIndexVercelAiGatewayApiKey",
				settings.codebaseIndexVercelAiGatewayApiKey,
			)
		}
		if (settings.codebaseIndexOpenRouterApiKey !== undefined) {
			await provider.contextProxy.storeSecret(
				"codebaseIndexOpenRouterApiKey",
				settings.codebaseIndexOpenRouterApiKey,
			)
		}

		await provider.postMessageToWebview({
			type: "codeIndexSettingsSaved",
			success: true,
			settings: globalStateConfig,
		})

		await provider.postStateToWebview()

		const currentCodeIndexManager = provider.getCurrentWorkspaceCodeIndexManager()
		if (currentCodeIndexManager) {
			if (embedderProviderChanged) {
				try {
					await currentCodeIndexManager.handleSettingsChange()
				} catch (error) {
					provider.log(
						`Embedder validation failed after provider change: ${error instanceof Error ? error.message : String(error)}`,
					)
					await provider.postMessageToWebview({
						type: "indexingStatusUpdate",
						values: currentCodeIndexManager.getCurrentStatus(),
					})
					return
				}
			} else {
				try {
					await currentCodeIndexManager.handleSettingsChange()
				} catch (error) {
					provider.log(
						`Settings change handling error: ${error instanceof Error ? error.message : String(error)}`,
					)
				}
			}

			await new Promise((resolve) => setTimeout(resolve, 200))

			if (currentCodeIndexManager.isFeatureEnabled && currentCodeIndexManager.isFeatureConfigured) {
				if (!currentCodeIndexManager.isInitialized) {
					try {
						await currentCodeIndexManager.initialize(provider.contextProxy)
						provider.log("Code index manager initialized after settings save")
					} catch (error) {
						provider.log(
							`Code index initialization failed: ${error instanceof Error ? error.message : String(error)}`,
						)
						await provider.postMessageToWebview({
							type: "indexingStatusUpdate",
							values: currentCodeIndexManager.getCurrentStatus(),
						})
					}
				}
			}
		} else {
			provider.log("Cannot save code index settings: No workspace folder open")
			await provider.postMessageToWebview({
				type: "indexingStatusUpdate",
				values: {
					systemStatus: "Error",
					message: t("embeddings:orchestrator.indexingRequiresWorkspace"),
					processedItems: 0,
					totalItems: 0,
					currentItemUnit: "items",
				},
			})
		}
	} catch (error: any) {
		provider.log(`Error saving code index settings: ${error.message || error}`)
		await provider.postMessageToWebview({
			type: "codeIndexSettingsSaved",
			success: false,
			error: error.message || "Failed to save settings",
		})
	}
}

/**
 * Requests the current indexing status and posts it to the webview.
 */
export async function handleRequestIndexingStatus(provider: MirrorProvider): Promise<void> {
	const manager = provider.getCurrentWorkspaceCodeIndexManager()
	if (!manager) {
		provider.postMessageToWebview({
			type: "indexingStatusUpdate",
			values: {
				systemStatus: "Error",
				message: t("embeddings:orchestrator.indexingRequiresWorkspace"),
				processedItems: 0,
				totalItems: 0,
				currentItemUnit: "items",
				workspacePath: undefined,
			},
		})
		return
	}

	const status = manager.getCurrentStatus()

	provider.postMessageToWebview({
		type: "indexingStatusUpdate",
		values: status,
	})
}

/**
 * Requests the secret status for code index API keys.
 */
export async function handleRequestCodeIndexSecretStatus(provider: MirrorProvider): Promise<void> {
	const hasOpenAiKey = !!(await provider.context.secrets.get("codeIndexOpenAiKey"))
	const hasQdrantApiKey = !!(await provider.context.secrets.get("codeIndexQdrantApiKey"))
	const hasOpenAiCompatibleApiKey = !!(await provider.context.secrets.get("codebaseIndexOpenAiCompatibleApiKey"))
	const hasGeminiApiKey = !!(await provider.context.secrets.get("codebaseIndexGeminiApiKey"))
	const hasMistralApiKey = !!(await provider.context.secrets.get("codebaseIndexMistralApiKey"))
	const hasVercelAiGatewayApiKey = !!(await provider.context.secrets.get("codebaseIndexVercelAiGatewayApiKey"))
	const hasOpenRouterApiKey = !!(await provider.context.secrets.get("codebaseIndexOpenRouterApiKey"))

	provider.postMessageToWebview({
		type: "codeIndexSecretStatus",
		values: {
			hasOpenAiKey,
			hasQdrantApiKey,
			hasOpenAiCompatibleApiKey,
			hasGeminiApiKey,
			hasMistralApiKey,
			hasVercelAiGatewayApiKey,
			hasOpenRouterApiKey,
		},
	})
}

/**
 * Starts indexing for the current workspace.
 */
export async function handleStartIndexing(provider: MirrorProvider): Promise<void> {
	try {
		const manager = provider.getCurrentWorkspaceCodeIndexManager()
		if (!manager) {
			provider.postMessageToWebview({
				type: "indexingStatusUpdate",
				values: {
					systemStatus: "Error",
					message: t("embeddings:orchestrator.indexingRequiresWorkspace"),
					processedItems: 0,
					totalItems: 0,
					currentItemUnit: "items",
				},
			})
			provider.log("Cannot start indexing: No workspace folder open")
			return
		}

		await manager.setWorkspaceEnabled(true)

		if (manager.isFeatureEnabled && manager.isFeatureConfigured) {
			await manager.initialize(provider.contextProxy)

			const currentState = manager.state
			if (currentState === "Standby" || currentState === "Error") {
				manager.startIndexing()
				if (!manager.isInitialized) {
					await manager.initialize(provider.contextProxy)
					if (manager.state === "Standby" || manager.state === "Error") {
						manager.startIndexing()
					}
				}
			}
		}
	} catch (error) {
		provider.log(`Error starting indexing: ${error instanceof Error ? error.message : String(error)}`)
	}
}

/**
 * Stops indexing for the current workspace.
 */
export async function handleStopIndexing(provider: MirrorProvider): Promise<void> {
	try {
		const manager = provider.getCurrentWorkspaceCodeIndexManager()
		if (!manager) {
			provider.log("Cannot stop indexing: No workspace folder open")
			return
		}
		manager.stopIndexing()
		provider.postMessageToWebview({
			type: "indexingStatusUpdate",
			values: manager.getCurrentStatus(),
		})
	} catch (error) {
		provider.log(`Error stopping indexing: ${error instanceof Error ? error.message : String(error)}`)
	}
}

/**
 * Toggles workspace indexing on/off.
 */
export async function handleToggleWorkspaceIndexing(provider: MirrorProvider, message: WebviewMessage): Promise<void> {
	try {
		const manager = provider.getCurrentWorkspaceCodeIndexManager()
		if (!manager) {
			provider.log("Cannot toggle workspace indexing: No workspace folder open")
			return
		}
		const enabled = message.bool ?? false
		await manager.setWorkspaceEnabled(enabled)
		if (enabled && manager.isFeatureEnabled && manager.isFeatureConfigured) {
			await manager.initialize(provider.contextProxy)
			manager.startIndexing()
		} else if (!enabled) {
			manager.stopIndexing()
		}
		provider.postMessageToWebview({
			type: "indexingStatusUpdate",
			values: manager.getCurrentStatus(),
		})
	} catch (error) {
		provider.log(`Error toggling workspace indexing: ${error instanceof Error ? error.message : String(error)}`)
	}
}

/**
 * Sets the auto-enable default for workspace indexing across all workspaces.
 */
export async function handleSetAutoEnableDefault(provider: MirrorProvider, message: WebviewMessage): Promise<void> {
	try {
		const manager = provider.getCurrentWorkspaceCodeIndexManager()
		if (!manager) {
			provider.log("Cannot set auto-enable default: No workspace folder open")
			return
		}

		const allManagers = CodeIndexManager.getAllInstances()
		const priorStates = new Map(allManagers.map((m) => [m, m.isWorkspaceEnabled]))
		await manager.setAutoEnableDefault(message.bool ?? true)

		for (const m of allManagers) {
			const wasEnabled = priorStates.get(m)!
			const isNowEnabled = m.isWorkspaceEnabled
			if (wasEnabled && !isNowEnabled) {
				m.stopIndexing()
			} else if (!wasEnabled && isNowEnabled && m.isFeatureEnabled && m.isFeatureConfigured) {
				await m.initialize(provider.contextProxy)
				m.startIndexing()
			}
		}

		provider.postMessageToWebview({
			type: "indexingStatusUpdate",
			values: manager.getCurrentStatus(),
		})
	} catch (error) {
		provider.log(`Error setting auto-enable default: ${error instanceof Error ? error.message : String(error)}`)
	}
}

/**
 * Clears all index data for the current workspace.
 */
export async function handleClearIndexData(provider: MirrorProvider): Promise<void> {
	try {
		const manager = provider.getCurrentWorkspaceCodeIndexManager()
		if (!manager) {
			provider.log("Cannot clear index data: No workspace folder open")
			provider.postMessageToWebview({
				type: "indexCleared",
				values: {
					success: false,
					error: t("embeddings:orchestrator.indexingRequiresWorkspace"),
				},
			})
			return
		}
		await manager.clearIndexData()
		provider.postMessageToWebview({ type: "indexCleared", values: { success: true } })
	} catch (error) {
		provider.log(`Error clearing index data: ${error instanceof Error ? error.message : String(error)}`)
		provider.postMessageToWebview({
			type: "indexCleared",
			values: {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			},
		})
	}
}

/**
 * Auto-configures Codebase Indexing based on active LLM settings.
 */
export async function handleAutoSetupCodeIndex(provider: MirrorProvider): Promise<void> {
	try {
		const state = await provider.getState()
		const apiConfig = state.apiConfiguration

		let embedderProvider: any = "openai"
		let modelId = ""
		let secretKey = ""
		let secretKeyName = ""

		const providerName = apiConfig?.apiProvider

		if (providerName === "gemini") {
			embedderProvider = "gemini"
			modelId = "gemini-embedding-001"
			secretKey = (await provider.context.secrets.get("geminiApiKey")) ?? ""
			secretKeyName = "codebaseIndexGeminiApiKey"
		} else if (providerName === "openai") {
			embedderProvider = "openai"
			modelId = "text-embedding-3-small"
			secretKey = (await provider.context.secrets.get("openAiApiKey")) ?? ""
			secretKeyName = "codeIndexOpenAiKey"
		} else if (providerName === "openrouter") {
			embedderProvider = "openrouter"
			modelId = "openai/text-embedding-3-small"
			secretKey = (await provider.context.secrets.get("openRouterApiKey")) ?? ""
			secretKeyName = "codebaseIndexOpenRouterApiKey"
		} else if (providerName === "mistral") {
			embedderProvider = "mistral"
			modelId = "codestral-embed-2505"
			secretKey = (await provider.context.secrets.get("mistralApiKey")) ?? ""
			secretKeyName = "codebaseIndexMistralApiKey"
		} else if (providerName === "anthropic") {
			embedderProvider = "anthropic"
			modelId = "voyage-code-2"
			secretKey = (await provider.context.secrets.get("apiKey")) ?? ""
			secretKeyName = "codebaseIndexAnthropicApiKey"
		} else if (providerName === "ollama") {
			embedderProvider = "ollama"
			modelId = "nomic-embed-text"
			secretKey = ""
			secretKeyName = ""

			// Auto-detect installed embedding models from local Ollama service
			try {
				const response = await fetch("http://localhost:11434/api/tags")
				if (response.ok) {
					const data = (await response.json()) as any
					const models = data.models || []
					const hasNomic = models.some((m: any) => m.name.startsWith("nomic-embed-text"))
					if (!hasNomic) {
						const foundEmbedModel = models.find((m: any) => {
							const nameLower = m.name.toLowerCase()
							const capabilities = m.capabilities || []
							const families = m.details?.families || []
							return (
								nameLower.includes("embed") ||
								capabilities.includes("embedding") ||
								families.some((f: string) => f.toLowerCase().includes("embed"))
							)
						})
						if (foundEmbedModel) {
							modelId = foundEmbedModel.name
						}
					}
				}
			} catch (e) {
				// Ignore error, fallback to default
			}
		} else {
			// Fallback: search for any available keys
			const geminiKey = await provider.context.secrets.get("geminiApiKey")
			const openAiKey = await provider.context.secrets.get("openAiApiKey")
			const openRouterKey = await provider.context.secrets.get("openRouterApiKey")
			const anthropicKey = await provider.context.secrets.get("apiKey")

			if (geminiKey) {
				embedderProvider = "gemini"
				modelId = "gemini-embedding-001"
				secretKey = geminiKey
				secretKeyName = "codebaseIndexGeminiApiKey"
			} else if (openAiKey) {
				embedderProvider = "openai"
				modelId = "text-embedding-3-small"
				secretKey = openAiKey
				secretKeyName = "codeIndexOpenAiKey"
			} else if (openRouterKey) {
				embedderProvider = "openrouter"
				modelId = "openai/text-embedding-3-small"
				secretKey = openRouterKey
				secretKeyName = "codebaseIndexOpenRouterApiKey"
			} else if (anthropicKey) {
				embedderProvider = "anthropic"
				modelId = "voyage-code-2"
				secretKey = anthropicKey
				secretKeyName = "codebaseIndexAnthropicApiKey"
			}
		}

		if (!secretKey && embedderProvider !== "ollama") {
			vscode.window.showErrorMessage("No active API keys found. Please configure an API key in settings first.")
			return
		}

		const currentConfig = getGlobalState(provider, "codebaseIndexConfig") || {}
		const globalStateConfig = {
			...currentConfig,
			codebaseIndexEnabled: true,
			codebaseIndexQdrantUrl: "http://localhost:6333",
			codebaseIndexEmbedderProvider: embedderProvider,
			codebaseIndexEmbedderModelId: modelId,
			codebaseIndexEmbedderModelDimension: undefined,
			codebaseIndexSearchMaxResults: 5,
			codebaseIndexSearchMinScore: 0.3,
		}

		await updateGlobalState(provider, "codebaseIndexConfig", globalStateConfig)
		if (secretKeyName) {
			await provider.contextProxy.storeSecret(secretKeyName as any, secretKey)
		}

		await provider.postMessageToWebview({
			type: "codeIndexSettingsSaved",
			success: true,
			settings: globalStateConfig,
		})

		await provider.postStateToWebview()

		const currentCodeIndexManager = provider.getCurrentWorkspaceCodeIndexManager()
		if (currentCodeIndexManager) {
			await currentCodeIndexManager.handleSettingsChange()
			if (currentCodeIndexManager.isFeatureEnabled && currentCodeIndexManager.isFeatureConfigured) {
				await currentCodeIndexManager.initialize(provider.contextProxy)
				currentCodeIndexManager.startIndexing()
			}
		}

		vscode.window.showInformationMessage("✅ Codebase Indexing auto-configured and started successfully!")
	} catch (error: any) {
		provider.log(`Error auto setting up codebase indexing: ${error.message || error}`)
		vscode.window.showErrorMessage(`Failed to auto-setup Codebase Indexing: ${error.message || error}`)
	}
}

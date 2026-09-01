import * as vscode from "vscode"

import { type WebviewMessage } from "@mirror-vs/types"

import { MirrorProvider } from "../MirrorProvider"
import { CodeIndexManager } from "../../../services/code-index/manager"
import { type EmbedderProvider } from "../../../services/code-index/interfaces/manager"
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
	const sendProgress = (step: string, progress: number, label: string) => {
		provider.postMessageToWebview({
			type: "autoSetupProgress",
			values: { step, progress, label },
		} as any)
	}

	try {
		const { spawn, execSync } = await import("child_process")
		const { LocalQdrantManager } = await import("../../../services/code-index/local-qdrant")

		// 1. Setup Ollama
		sendProgress("ollama", 0, "Checking Ollama...")

		let ollamaRunning = false
		try {
			const res = await fetch("http://localhost:11434/api/tags")
			ollamaRunning = res.ok
		} catch {
			ollamaRunning = false
		}

		if (!ollamaRunning) {
			// Check if ollama command is available
			let hasOllamaCmd = false
			try {
				execSync(process.platform === "win32" ? "where ollama" : "which ollama", { stdio: "ignore" })
				hasOllamaCmd = true
			} catch {
				hasOllamaCmd = false
			}

			if (hasOllamaCmd) {
				sendProgress("ollama", 10, "Starting Ollama service...")
				provider.log("Ollama is installed but not running. Launching 'ollama serve'...")
				const proc = spawn("ollama", ["serve"], { detached: true, stdio: "ignore" })
				proc.unref()

				// Wait up to 10s for Ollama to start
				for (let i = 0; i < 40; i++) {
					await new Promise((resolve) => setTimeout(resolve, 250))
					try {
						const res = await fetch("http://localhost:11434/api/tags")
						if (res.ok) {
							ollamaRunning = true
							break
						}
					} catch {}
				}
			}
		}

		if (!ollamaRunning) {
			sendProgress("error", 0, "Ollama not found. Please install from https://ollama.com")
			vscode.window.showErrorMessage(
				"Ollama service is not running on http://localhost:11434. Please install and launch Ollama from https://ollama.com before continuing.",
			)
			return
		}

		sendProgress("ollama", 20, "Ollama running ✓")

		// 2. Check and pull nomic-embed-text
		let hasModel = false
		try {
			const res = await fetch("http://localhost:11434/api/tags")
			if (res.ok) {
				const data = (await res.json()) as any
				const models = data.models || []
				hasModel = models.some(
					(m: any) =>
						m.name === "nomic-embed-text" ||
						m.name === "nomic-embed-text:latest" ||
						m.name.startsWith("nomic-embed-text:"),
				)
			}
		} catch (e) {
			provider.log(`Error checking Ollama models: ${e}`)
		}

		if (!hasModel) {
			sendProgress("model", 25, "Pulling nomic-embed-text...")
			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: "Ollama: Pulling nomic-embed-text (this might take a few minutes)...",
					cancellable: false,
				},
				async (progress) => {
					const pullRes = await fetch("http://localhost:11434/api/pull", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ name: "nomic-embed-text" }),
					})

					if (!pullRes.ok) {
						throw new Error(`Ollama model pull failed with status ${pullRes.status}`)
					}

					const reader = pullRes.body?.getReader()
					if (!reader) {
						throw new Error("Failed to read Ollama pull stream")
					}

					const decoder = new TextDecoder()
					let buffer = ""
					while (true) {
						const { done, value } = await reader.read()
						if (done) break

						buffer += decoder.decode(value, { stream: true })
						const lines = buffer.split("\n")
						buffer = lines.pop() || ""

						for (const line of lines) {
							if (line.trim()) {
								try {
									const data = JSON.parse(line)
									if (data.completed && data.total) {
										const pct = Math.round((data.completed / data.total) * 100)
										const webviewPct = 25 + Math.round(pct * 0.3) // maps 0-100% to 25-55%
										progress.report({ message: `${data.status || "Downloading"}... ${pct}%` })
										sendProgress("model", webviewPct, `Pulling nomic-embed-text... ${pct}%`)
									} else if (data.status) {
										progress.report({ message: data.status })
										sendProgress("model", 30, data.status)
									}
								} catch {}
							}
						}
					}
				},
			)
		}

		sendProgress("model", 55, "nomic-embed-text ready ✓")

		// 3. Setup Qdrant
		sendProgress("qdrant", 55, "Checking Qdrant...")
		const localQdrant = LocalQdrantManager.getInstance(provider.context)
		if (!(await localQdrant.isRunning())) {
			sendProgress("qdrant", 60, "Starting local vector database...")
			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: "Qdrant: Starting local vector database...",
					cancellable: false,
				},
				async (progress) => {
					await localQdrant.start((p) => {
						progress.report({ message: `Downloading Qdrant database binary (${p}%)...` })
						const webviewPct = 60 + Math.round(p * 0.3) // maps 0-100% to 60-90%
						sendProgress("qdrant", webviewPct, `Downloading Qdrant... ${p}%`)
					})
				},
			)
		}

		sendProgress("qdrant", 90, "Qdrant running ✓")

		// 4. Save configuration settings
		sendProgress("config", 92, "Saving configuration...")
		const currentConfig = getGlobalState(provider, "codebaseIndexConfig") || {}
		const globalStateConfig = {
			...currentConfig,
			codebaseIndexEnabled: true,
			codebaseIndexQdrantUrl: "http://localhost:6333",
			codebaseIndexEmbedderProvider: "ollama" as EmbedderProvider,
			codebaseIndexEmbedderModelId: "nomic-embed-text",
			codebaseIndexEmbedderModelDimension: 768,
			codebaseIndexSearchMaxResults: 5,
			codebaseIndexSearchMinScore: 0.3,
		}

		await updateGlobalState(provider, "codebaseIndexConfig", globalStateConfig)

		await provider.postMessageToWebview({
			type: "codeIndexSettingsSaved",
			success: true,
			settings: globalStateConfig,
		})

		await provider.postStateToWebview()

		sendProgress("indexing", 95, "Starting indexing...")

		const currentCodeIndexManager = provider.getCurrentWorkspaceCodeIndexManager()
		if (currentCodeIndexManager) {
			await currentCodeIndexManager.handleSettingsChange()
			if (currentCodeIndexManager.isFeatureEnabled && currentCodeIndexManager.isFeatureConfigured) {
				await currentCodeIndexManager.initialize(provider.contextProxy)
				currentCodeIndexManager.startIndexing()
			}
		}

		sendProgress("done", 100, "Setup complete ✓")
		vscode.window.showInformationMessage("✅ Local Codebase Indexing auto-configured and started successfully!")
	} catch (error: any) {
		sendProgress("error", 0, `Setup failed: ${error.message || error}`)
		provider.log(`Error auto setting up codebase indexing: ${error.message || error}`)
		vscode.window.showErrorMessage(`Failed to auto-setup Codebase Indexing: ${error.message || error}`)
	}
}

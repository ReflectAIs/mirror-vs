/**
 * Auto-setup flow for local image generation runtimes.
 *
 * When a user selects ComfyUI as their image provider, this module:
 *  1. Detects hardware
 *  2. Checks if the runtime is already installed
 *  3. Downloads + installs if missing
 *  4. Downloads a default model
 *  5. Launches and health-checks the runtime
 *  6. Registers the provider
 */
import fs from "fs/promises"
import path from "path"
import * as vscode from "vscode"
import { ImageProviderRegistry } from "../../api/image/registry"
import { ImageProviderRouter, setActiveProviderSelector } from "../../api/image/router"
import {
	OpenRouterImageProvider,
	ComfyUIProvider,
	ComfyCloudProvider,
	AtlasCloudProvider,
} from "../../api/image/providers"
import { ComfyUIManager } from "./comfyui-manager"
import { HardwareDetector } from "./hardware-detector"
import { modelRegistry } from "./model-registry"
import { downloadManager } from "./download-manager"

export type SetupStep =
	| "detecting-hardware"
	| "downloading-runtime"
	| "installing-runtime"
	| "downloading-model"
	| "launching"
	| "health-check"
	| "complete"
	| "error"

/**
 * Progress estimate (0–100) reached by each step.
 */
const STEP_PROGRESS: Record<SetupStep, number> = {
	"detecting-hardware": 5,
	"downloading-runtime": 20,
	"installing-runtime": 45,
	"downloading-model": 70,
	launching: 85,
	"health-check": 95,
	complete: 100,
	error: 0,
}

export type SetupCallback = (step: SetupStep, message?: string, progress?: number) => void

/**
 * Initialize all image providers. Called once at extension startup.
 *
 * Cloud providers (Comfy Cloud, Atlas Cloud) are registered eagerly if the
 * extension context is available — they fetch their API keys from SecretStorage
 * at request time via `context.secrets.get()`.
 *
 * @param openRouterApiKey  Raw API key for OpenRouter (passed directly)
 * @param context           ExtensionContext for SecretStorage-backed providers
 * @param previouslyConfigured  Flags indicating previously-configured providers
 */
export function initializeImageProviders(
	openRouterApiKey?: string,
	context?: vscode.ExtensionContext,
	previouslyConfigured?: { comfyui?: boolean; currentProvider?: string },
): void {
	// OpenRouter is always available (if API key exists)
	if (openRouterApiKey) {
		const orProvider = new OpenRouterImageProvider(openRouterApiKey)
		ImageProviderRegistry.register("openrouter", orProvider)
	}

	// Re-register previously-configured ComfyUI if it's still running.
	// On VS Code restart, the ImageProviderRegistry is empty, but the user's
	// ComfyUI process may still be running in the background.
	if (previouslyConfigured?.comfyui) {
		registerComfyUIProvider()
	}

	// Comfy Cloud (registered eagerly — fetches API key from SecretStorage
	// at request time so it does not need the key passed in directly)
	if (context) {
		const ccProvider = new ComfyCloudProvider(context)
		ImageProviderRegistry.register("comfy_cloud", ccProvider)

		const acProvider = new AtlasCloudProvider(context)
		ImageProviderRegistry.register("atlas_cloud", acProvider)
	}

	// If the user has selected ComfyUI in settings (even without
	// completing auto-setup), register it so the router can find it.
	ensureProviderRegistered(previouslyConfigured?.currentProvider)
}

/**
 * Lazy-register a local provider if the user has selected it.
 * Idempotent — safe to call on every settings change.
 */
export function ensureProviderRegistered(provider?: string): void {
	if (provider === "comfyui") {
		registerComfyUIProvider()
	}
}

/**
 * Upgrade the provider selector to read from the current extension state.
 * This bridges the router with the actual VS Code settings.
 *
 * Supports per-pipeline-type provider resolution: when `pipelineType`
 * is provided, the selector first checks `generationProviders[pipelineType]`
 * before falling back to the global `imageGenerationProvider` setting.
 */
export function connectProviderSelectorToSettings(
	getState: () => { imageGenerationProvider?: string; generationProviders?: Record<string, string> },
): void {
	setActiveProviderSelector((pipelineType?: string) => {
		const state = getState()
		// Per-type lookup first
		if (pipelineType && state?.generationProviders?.[pipelineType]) {
			return state.generationProviders[pipelineType]
		}
		// Fallback to global provider setting
		return state?.imageGenerationProvider || "openrouter"
	})
}

/**
 * Auto-setup ComfyUI from scratch.
 */
export async function autoSetupComfyUI(onStep?: SetupCallback): Promise<void> {
	emit(onStep, "detecting-hardware")
	const hardware = await HardwareDetector.detect()
	const recommendation = await HardwareDetector.recommendModel(hardware)

	const manager = new ComfyUIManager()

	// Check if already installed
	const healthCheck = await manager.healthCheck()
	if (healthCheck) {
		// Already running — just register the provider
		registerComfyUIProvider()
		emit(onStep, "complete", "ComfyUI is already running")
		return
	}

	// Verify hardware support for recommended model
	const hwCheck = await HardwareDetector.verifyHardwareSupport(recommendation.model, hardware)
	if (!hwCheck.supported && hwCheck.warning) {
		emit(onStep, "detecting-hardware", `Warning: ${hwCheck.warning}`)
		// Sleep a moment to ensure user can see warning message, then proceed anyway
		await new Promise((r) => setTimeout(r, 3000))
	}

	// Install if not present
	if (!manager.getState().installed) {
		emit(onStep, "downloading-runtime")
		await manager.install((step, msg, pct) => {
			emit(onStep, "installing-runtime", msg, pct)
		})
	}

	// Download default model
	const defaultModel = modelRegistry.getModel(recommendation.model)
	if (defaultModel?.downloadable && !defaultModel.installed) {
		emit(onStep, "downloading-model", `Downloading ${defaultModel.displayName}...`)
		// ComfyUIManager on macOS/Linux uses a "ComfyUI" subdirectory for the source
		const isWindows = process.platform === "win32"
		const modelsDir = isWindows
			? path.join(manager["installPath"], "models", "checkpoints")
			: path.join(manager["installPath"], "ComfyUI", "models", "checkpoints")
		await fs.mkdir(modelsDir, { recursive: true })
		const modelPath = path.join(modelsDir, `${defaultModel.id}.safetensors`)
		await new Promise<void>((resolve, reject) => {
			// Forward real download progress (0–100%) scaled into the 70–85 range
			const onProgress = (p: { id: string; downloadedBytes: number; totalBytes: number; progress: number }) => {
				const scaled = 70 + Math.round((p.progress / 100) * 15)
				emit(onStep, "downloading-model", `Downloading ${defaultModel.displayName}... (${p.progress}%)`, scaled)
			}
			downloadManager.on("progress", onProgress)
			downloadManager.once("complete", () => {
				downloadManager.off("progress", onProgress)
				resolve()
			})
			downloadManager.once("error", (e) => {
				downloadManager.off("progress", onProgress)
				reject(new Error(e.error))
			})
			downloadManager.enqueue(defaultModel.downloadUrl!, modelPath, defaultModel.checksum, defaultModel.size)
		})
		modelRegistry.markInstalled(defaultModel.id)
	}

	// Launch
	emit(onStep, "launching")
	await manager.launch()

	// Health check
	emit(onStep, "health-check")
	for (let i = 0; i < 30; i++) {
		await new Promise((r) => setTimeout(r, 1000))
		const alive = await manager.healthCheck()
		if (alive) {
			registerComfyUIProvider()
			emit(onStep, "complete", "ComfyUI is ready")
			return
		}
	}

	emit(onStep, "error", "ComfyUI failed to start within 30 seconds")
}

function emit(cb: SetupCallback | undefined, step: SetupStep, message?: string, progress?: number): void {
	cb?.(step, message, progress ?? STEP_PROGRESS[step])
}

/**
 * Global singleton manager — created once and reused across all
 * ComfyUIProvider instances so that lifecycle state (process PID, etc.)
 * is preserved between start/stop cycles.
 */
let _manager: ComfyUIManager | undefined

export function getComfyUIManager(): ComfyUIManager {
	if (!_manager) {
		_manager = new ComfyUIManager()
	}
	return _manager
}

export function registerComfyUIProvider(): void {
	if (!ImageProviderRegistry.isRegistered("comfyui")) {
		const manager = getComfyUIManager()
		ImageProviderRegistry.register("comfyui", new ComfyUIProvider("http://127.0.0.1:8188", manager))
	}
}

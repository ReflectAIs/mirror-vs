export { RuntimeManager } from "./runtime-manager"
export type { RuntimeState, RuntimeEvent } from "./runtime-manager"
export { ComfyUIManager } from "./comfyui-manager"
export { DownloadManager, downloadManager } from "./download-manager"
export type { DownloadJob, DownloadEvent } from "./download-manager"
export { HardwareDetector } from "./hardware-detector"
export type { HardwareInfo } from "./hardware-detector"
export { modelRegistry } from "./model-registry"
export type { ModelMetadata } from "./model-registry"
export { WorkflowEngine } from "./workflows/engine"
export type { WorkflowType } from "./workflows/engine"
export {
	autoSetupComfyUI,
	isAutoSetupRunning,
	getLastAutoSetupStatus,
	initializeImageProviders,
	connectProviderSelectorToSettings,
	ensureProviderRegistered,
	registerComfyUIProvider,
	getComfyUIManager,
} from "./auto-setup"
export type { SetupStep, SetupCallback } from "./auto-setup"
export * from "./platform"

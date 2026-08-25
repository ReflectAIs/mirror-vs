import { HTMLAttributes, useCallback, useEffect, useState } from "react"

import type { Experiments, ImageGenerationProvider } from "@mirror-vs/types"

import { EXPERIMENT_IDS, experimentConfigsMap } from "@shared/experiments"

import { useAppTranslation } from "@/i18n/TranslationContext"
import { cn } from "@/lib/utils"
import { vscode } from "@/utils/vscode"

import { useExtensionState } from "@/context/ExtensionStateContext"

import { SetExperimentEnabled } from "./types"
import { SectionHeader } from "./SectionHeader"
import { Section } from "./Section"
import { SearchableSetting } from "./SearchableSetting"
import { ExperimentalFeature } from "./ExperimentalFeature"
import { ImageGenerationSettings } from "./ImageGenerationSettings"
import { CustomToolsSettings } from "./CustomToolsSettings"

type ExperimentalSettingsProps = HTMLAttributes<HTMLDivElement> & {
	experiments: Experiments
	setExperimentEnabled: SetExperimentEnabled

	// Per-type provider / model selection
	generationProviders?: Record<string, ImageGenerationProvider>
	updateGenerationProvider?: (type: string, provider: ImageGenerationProvider) => void
	openRouterModels?: Record<string, string>
	updateOpenRouterModel?: (type: string, model: string) => void

	// ComfyUI pipeline defaults
	comfyuiDefaultPipelines?: Record<string, string>
	setComfyuiDefaultPipeline?: (type: string, slug: string) => void
	comfyuiHardwareProfile?: string

	// Atlas Cloud model mapping
	atlasCloudModels?: Record<string, string>
	updateAtlasCloudModel?: (type: string, model: string) => void

	// Auto-setup
	comfyuiAutoSetup?: boolean
}

/** Experiment keys that are rendered inside ImageGenerationSettings (all 8 pipeline types) */
const PIPELINE_EXPERIMENT_KEYS = new Set([
	"TXT2IMG",
	"IMG2IMG",
	"INPAINT",
	"OUTPAINT",
	"UPSCALE",
	"REMOVE_BG",
	"TXT2AUDIO",
	"TXT2VIDEO",
])

export const ExperimentalSettings = ({
	experiments,
	setExperimentEnabled,
	generationProviders,
	updateGenerationProvider,
	openRouterModels,
	updateOpenRouterModel,
	comfyuiDefaultPipelines,
	setComfyuiDefaultPipeline,
	comfyuiHardwareProfile,
	atlasCloudModels,
	updateAtlasCloudModel,
	comfyuiAutoSetup,
	className,
	...props
}: ExperimentalSettingsProps) => {
	const { t } = useAppTranslation()
	const { imageAutoSetupRunning = false, imageAutoSetupStatus } = useExtensionState()

	// Auto-setup state - initialize with global state so tab switches preserve running state
	const [autoSetupRunning, setAutoSetupRunning] = useState(imageAutoSetupRunning)
	const [autoSetupStatus, setAutoSetupStatus] = useState<string | undefined>(
		imageAutoSetupStatus?.message || imageAutoSetupStatus?.step,
	)
	const [autoSetupProgress, setAutoSetupProgress] = useState<number>(imageAutoSetupStatus?.progress ?? 0)

	useEffect(() => {
		if (imageAutoSetupRunning) {
			setAutoSetupRunning(true)
			if (imageAutoSetupStatus) {
				setAutoSetupStatus(imageAutoSetupStatus.message || imageAutoSetupStatus.step)
				if (imageAutoSetupStatus.progress !== undefined) {
					setAutoSetupProgress(imageAutoSetupStatus.progress)
				}
			}
		}
	}, [imageAutoSetupRunning, imageAutoSetupStatus])

	/** Tracks which local providers have been successfully set up this session */
	const [configuredProviders, setConfiguredProviders] = useState<Set<"comfyui">>(() => {
		const initial = new Set<"comfyui">()
		if (comfyuiAutoSetup) initial.add("comfyui")
		return initial
	})

	// Listen for image auto-setup results
	const handleMessage = useCallback((event: MessageEvent) => {
		const message = event.data
		if (message.type === "imageAutoSetupResult") {
			if (message.progress !== undefined) {
				setAutoSetupProgress(message.progress)
			}
			if (message.step === "complete" || message.step === "error") {
				setAutoSetupRunning(false)
				if (message.step === "complete") {
					setAutoSetupStatus("Setup complete")
				} else {
					setAutoSetupStatus(message.text || "Setup failed")
				}
			} else {
				setAutoSetupRunning(true)
				setAutoSetupStatus(message.text || message.step || "Working...")
			}
			if (
				message.step === "complete" &&
				(message.text === "ComfyUI is ready" || message.text === "ComfyUI is already running")
			) {
				setConfiguredProviders((prev) => new Set(prev).add("comfyui"))
			}
		}
	}, [])

	useEffect(() => {
		window.addEventListener("message", handleMessage)
		return () => {
			window.removeEventListener("message", handleMessage)
		}
	}, [handleMessage])

	const handleAutoSetup = useCallback(
		(provider: "comfyui") => {
			if (autoSetupRunning) return
			setAutoSetupRunning(true)
			setAutoSetupStatus("Starting...")
			setAutoSetupProgress(0)
			vscode.postMessage({ type: "imageAutoSetup", text: provider })
		},
		[autoSetupRunning],
	)

	// Filter entries — pipeline keys are rendered inside ImageGenerationSettings
	const entries = Object.entries(experimentConfigsMap)
	const nonPipelineEntries = entries.filter(([key]) => !PIPELINE_EXPERIMENT_KEYS.has(key))

	// The first pipeline entry that has all required callbacks renders ImageGenerationSettings
	// (which handles all 8 pipeline types internally)
	const pipelineEntry = entries.find(
		([key]) =>
			PIPELINE_EXPERIMENT_KEYS.has(key) &&
			updateGenerationProvider &&
			updateOpenRouterModel &&
			setComfyuiDefaultPipeline,
	)

	return (
		<div className={cn("flex flex-col gap-2", className)} {...props}>
			{/* ─── Image Generation / ComfyUI section ─── */}
			<SectionHeader>{t("settings:sections.imageGeneration")}</SectionHeader>
			<Section>
				{pipelineEntry &&
					(() => {
						const [experimentKey] = pipelineEntry
						const label = t(`settings:experimental.${experimentKey}.name`)
						return (
							<SearchableSetting
								key={experimentKey}
								settingId={`experimental-${experimentKey.toLowerCase()}`}
								section="experimental"
								label={label}>
								<ImageGenerationSettings
									experiments={experiments}
									setExperimentEnabled={setExperimentEnabled}
									generationProviders={generationProviders}
									updateGenerationProvider={updateGenerationProvider}
									openRouterModels={openRouterModels}
									updateOpenRouterModel={updateOpenRouterModel}
									comfyuiDefaultPipelines={comfyuiDefaultPipelines}
									setComfyuiDefaultPipeline={setComfyuiDefaultPipeline}
									comfyuiHardwareProfile={comfyuiHardwareProfile}
									atlasCloudModels={atlasCloudModels}
									updateAtlasCloudModel={updateAtlasCloudModel}
									onAutoSetup={handleAutoSetup}
									autoSetupRunning={autoSetupRunning}
									autoSetupStatus={autoSetupStatus}
									autoSetupProgress={autoSetupProgress}
									configuredProviders={configuredProviders}
								/>
							</SearchableSetting>
						)
					})()}
			</Section>

			{/* ─── Other experimental features section ─── */}
			<SectionHeader>{t("settings:sections.experimental")}</SectionHeader>
			<Section>
				{nonPipelineEntries.map((config) => {
					const [experimentKey] = config
					const label = t(`settings:experimental.${experimentKey}.name`)

					if (experimentKey === "CUSTOM_TOOLS") {
						return (
							<SearchableSetting
								key={experimentKey}
								settingId={`experimental-${experimentKey.toLowerCase()}`}
								section="experimental"
								label={label}>
								<CustomToolsSettings
									enabled={experiments["customTools"] ?? false}
									onChange={(enabled) => setExperimentEnabled("customTools", enabled)}
								/>
							</SearchableSetting>
						)
					}
					return (
						<SearchableSetting
							key={experimentKey}
							settingId={`experimental-${experimentKey.toLowerCase()}`}
							section="experimental"
							label={label}>
							<ExperimentalFeature
								experimentKey={experimentKey}
								enabled={
									experiments[EXPERIMENT_IDS[experimentKey as keyof typeof EXPERIMENT_IDS]] ?? false
								}
								onChange={(enabled) =>
									setExperimentEnabled(
										EXPERIMENT_IDS[experimentKey as keyof typeof EXPERIMENT_IDS],
										enabled,
									)
								}
							/>
						</SearchableSetting>
					)
				})}
			</Section>
		</div>
	)
}

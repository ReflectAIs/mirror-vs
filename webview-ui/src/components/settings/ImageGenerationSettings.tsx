import React, { useState, useEffect, useCallback } from "react"
import {
	VSCodeCheckbox,
	VSCodeTextField,
	VSCodeDropdown,
	VSCodeOption,
	VSCodeButton,
	VSCodeTag,
	VSCodeBadge,
} from "@vscode/webview-ui-toolkit/react"
import {
	type ExperimentId,
	type Experiments,
	type ImageProviderModelInfo,
	ImageGenerationProvider,
} from "@mirror-vs/types"
import { EXPERIMENT_IDS } from "@shared/experiments"
import {
	Upload,
	Info,
	Scan,
	Plus,
	X,
	CheckCircle2,
	Loader2,
	ChevronDown,
	Trash2,
	Play,
	ExternalLink,
	Copy,
	Check,
} from "lucide-react"
import { useAppTranslation } from "@/i18n/TranslationContext"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	Textarea,
} from "@/components/ui"
import { Progress } from "@/components/ui/progress"
import { vscode } from "@/utils/vscode"
import { SetExperimentEnabled } from "./types"

/* ── Pipeline channel definitions ────────────────────────────────── */

interface ChannelDef {
	type: ExperimentId
	label: string
	icon: string
	description: string
	/** Pipeline type filter value from pipeline-meta.json */
	pipelineType: string
}

const CHANNELS: ChannelDef[] = [
	// ── Image Generation ──
	{
		type: EXPERIMENT_IDS.TXT2IMG,
		label: "Text → Image",
		icon: "🖼️",
		description: "Generate images from text descriptions.",
		pipelineType: "generate",
	},
	{
		type: EXPERIMENT_IDS.IMG2IMG,
		label: "Image → Image",
		icon: "🎨",
		description: "Transform existing images using text-guided edits.",
		pipelineType: "edit",
	},
	{
		type: EXPERIMENT_IDS.INPAINT,
		label: "Inpaint",
		icon: "🖌️",
		description: "Replace or repair specific regions of an image.",
		pipelineType: "inpaint",
	},
	{
		type: EXPERIMENT_IDS.OUTPAINT,
		label: "Outpaint",
		icon: "🖼️",
		description: "Extend an image beyond its original boundaries.",
		pipelineType: "outpaint",
	},
	{
		type: EXPERIMENT_IDS.UPSCALE,
		label: "Upscale",
		icon: "🔍",
		description: "Increase the resolution of an image.",
		pipelineType: "upscale",
	},
	{
		type: EXPERIMENT_IDS.REMOVE_BG,
		label: "Remove Background",
		icon: "✂️",
		description: "Remove the background from an image.",
		pipelineType: "remove-bg",
	},
	// ── Media Generation ──
	{
		type: EXPERIMENT_IDS.TXT2AUDIO,
		label: "Text → Audio",
		icon: "🔊",
		description: "Generate music and audio clips from text descriptions.",
		pipelineType: "audio",
	},
	{
		type: EXPERIMENT_IDS.TXT2VIDEO,
		label: "Text → Video",
		icon: "🎬",
		description: "Generate short video clips from text descriptions.",
		pipelineType: "video",
	},
]

/** Human-readable labels for pipeline types in the pipeline list view */
const PIPELINE_TYPE_LABELS: Record<string, string> = {
	generate: "Generate (txt2img)",
	edit: "Edit (img2img)",
	inpaint: "Inpaint",
	outpaint: "Outpaint",
	upscale: "Upscale",
	"remove-bg": "Remove Background",
	audio: "Audio (txt2audio)",
	video: "Video (txt2video)",
}

/* ── Pipeline summary (mirrors PipelineSettings.tsx) ─────────────── */

interface PipelineSummary {
	slug: string
	name: string
	description: string
	type: string
	tags: string[]
	source: "builtin" | "global" | "project"
	isDefault: boolean
}

/* ── Props ──────────────────────────────────────────────────────── */

interface ImageGenerationSettingsProps {
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
	onAutoSetup?: (provider: "comfyui") => void
	autoSetupRunning?: boolean
	autoSetupStatus?: string
	autoSetupProgress?: number
	configuredProviders?: Set<"comfyui">

	// ComfyUI workflow scanning
	onScanComfyuiWorkflows?: () => void
	onImportComfyuiWorkflows?: (filenames: string[]) => void
}

/* ── Component ──────────────────────────────────────────────────── */

export const ImageGenerationSettings = ({
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
	onAutoSetup,
	autoSetupRunning,
	autoSetupStatus,
	autoSetupProgress,
	configuredProviders,
	onScanComfyuiWorkflows,
	onImportComfyuiWorkflows,
}: ImageGenerationSettingsProps) => {
	const { t } = useAppTranslation()

	// Dynamic models fetched from running local provider (ComfyUI)
	const [dynamicModels, setDynamicModels] = useState<Record<string, ImageProviderModelInfo[]>>({})
	// Track whether we've requested models (to avoid re-fetching unnecessarily)
	const [modelsFetched, setModelsFetched] = useState<Record<string, boolean>>({})

	// Fetch pipeline list for ComfyUI pipeline dropdowns
	const [pipelines, setPipelines] = useState<PipelineSummary[]>([])

	/* ── Import dialog state ────────────────────────────────── */

	const [importDialogOpen, setImportDialogOpen] = useState(false)
	const [importPipelineType, setImportPipelineType] = useState<string | null>(null)
	const [importJson, setImportJson] = useState("")
	const [importError, setImportError] = useState<string | null>(null)
	const [isImporting, setIsImporting] = useState(false)

	/* ── Collapsible sections state ────────────────────────── */

	const [workflowBrowserOpen, setWorkflowBrowserOpen] = useState(false)

	/* ── Workflow scanning state ────────────────────────────── */

	const [scanning, setScanning] = useState(false)
	const [scanResults, setScanResults] = useState<{
		workflows: { name: string; filename: string }[]
		workflowDir: string
	} | null>(null)
	const [selectedWorkflows, setSelectedWorkflows] = useState<Set<string>>(new Set())
	const [importingWorkflows, setImportingWorkflows] = useState(false)
	const [deletingWorkflow, setDeletingWorkflow] = useState<string | null>(null)
	const [startingServer, setStartingServer] = useState(false)
	const [serverUrl, setServerUrl] = useState<string | null>(null)
	const [serverError, setServerError] = useState<string | null>(null)
	const [copiedError, setCopiedError] = useState(false)

	/* ── Pipeline deletion state ────────────────────────────── */

	const [deletingPipelineSlug, setDeletingPipelineSlug] = useState<string | null>(null)

	/* ── Message handler ────────────────────────────────────── */

	const handleMessage = useCallback((event: MessageEvent) => {
		const message = event.data
		if (message.type === "imageProviderModels" && message.imageProviderModels) {
			setDynamicModels((prev) => ({ ...prev, ...message.imageProviderModels }))
		}
		if (message.type === "pipelines" && Array.isArray(message.pipelines)) {
			setPipelines(message.pipelines)
		}
		if (message.type === "scanComfyuiWorkflowsResult" && message.workflows) {
			setScanResults({ workflows: message.workflows, workflowDir: message.workflowDir })
			setScanning(false)
			setSelectedWorkflows(new Set())
		}
		if (message.type === "startComfyuiServerResult") {
			setStartingServer(false)
			if (message.success) {
				setServerUrl(message.text || "http://127.0.0.1:8188")
				setServerError(null)
			} else {
				setServerError(message.error || "Failed to start ComfyUI server")
				if (message.text) {
					setServerUrl(message.text)
				}
			}
		}
		if (message.type === "importComfyuiWorkflows" && message.slugs) {
			setImportingWorkflows(false)
			setScanResults(null)
			// Refresh pipelines after import
			vscode.postMessage({ type: "requestPipelines" } as any)
		}
		if (message.type === "deleteComfyuiWorkflowResult") {
			setDeletingWorkflow(null)
			if (message.success) {
				// Remove the deleted workflow from scan results
				setScanResults((prev) => {
					if (!prev) return prev
					return {
						...prev,
						workflows: prev.workflows.filter((wf) => wf.filename !== message.slug + ".json"),
					}
				})
				// Refresh pipelines
				vscode.postMessage({ type: "requestPipelines" } as any)
			}
		}
		if (message.type === "deletePipelineResult") {
			setDeletingPipelineSlug(null)
			if (message.success) {
				// Refresh pipelines to reflect the deletion
				vscode.postMessage({ type: "requestPipelines" } as any)
			}
		}
	}, [])

	useEffect(() => {
		window.addEventListener("message", handleMessage)
		return () => window.removeEventListener("message", handleMessage)
	}, [handleMessage])

	// Request pipelines once on mount
	useEffect(() => {
		vscode.postMessage({ type: "requestPipelines" } as any)
	}, [])

	/* ── Helpers ─────────────────────────────────────────────── */

	const getPipelinesForType = useCallback((type: string) => pipelines.filter((p) => p.type === type), [pipelines])

	/* ── Pipeline deletion handler ──────────────────────────── */

	const handleDeletePipeline = useCallback((slug: string) => {
		setDeletingPipelineSlug(slug)
		vscode.postMessage({
			type: "deletePipeline",
			text: slug,
		} as any)
	}, [])

	/* ── Workflow scanning handlers ──────────────────────────── */

	const handleScanWorkflows = useCallback(() => {
		setScanning(true)
		setScanResults(null)
		vscode.postMessage({ type: "scanComfyuiWorkflows" } as any)
		onScanComfyuiWorkflows?.()
	}, [onScanComfyuiWorkflows])

	const handleStartServer = useCallback(() => {
		setStartingServer(true)
		setServerError(null)
		vscode.postMessage({ type: "startComfyuiServer" } as any)
	}, [])

	const handleOpenServerUrl = useCallback((url: string) => {
		vscode.postMessage({ type: "openExternal", text: url } as any)
	}, [])

	const handleToggleWorkflowSelection = useCallback((filename: string) => {
		setSelectedWorkflows((prev) => {
			const next = new Set(prev)
			if (next.has(filename)) {
				next.delete(filename)
			} else {
				next.add(filename)
			}
			return next
		})
	}, [])

	const handleImportSelectedWorkflows = useCallback(() => {
		if (selectedWorkflows.size === 0) return
		setImportingWorkflows(true)
		const filenames = Array.from(selectedWorkflows)
		vscode.postMessage({ type: "importComfyuiWorkflows", values: { filenames } } as any)
		onImportComfyuiWorkflows?.(filenames)
	}, [selectedWorkflows, onImportComfyuiWorkflows])

	const handleDeleteWorkflow = useCallback((filename: string) => {
		setDeletingWorkflow(filename)
		vscode.postMessage({
			type: "deleteComfyuiWorkflow",
			values: { filename },
		} as any)
	}, [])

	/* ── Import handlers ─────────────────────────────────────── */

	const openImportDialog = useCallback((type: string) => {
		setImportPipelineType(type)
		setImportJson("")
		setImportError(null)
		setImportDialogOpen(true)
	}, [])

	const handleImportSubmit = useCallback(async () => {
		setImportError(null)
		if (!importJson.trim()) {
			setImportError("Please paste pipeline JSON content")
			return
		}
		setIsImporting(true)
		try {
			vscode.postMessage({
				type: "importPipeline",
				text: importJson,
			})
			setImportDialogOpen(false)
			setImportJson("")
			setImportPipelineType(null)
		} catch {
			setImportError("Failed to import pipeline")
		} finally {
			setIsImporting(false)
		}
	}, [importJson])

	/* ── Channel section renderer ─────────────────────────────── */

	const renderChannelSection = (channel: ChannelDef) => {
		const isEnabled = !!experiments[channel.type]
		const activeProvider = generationProviders?.[channel.type] ?? "comfyui"
		const channelPipelines = getPipelinesForType(channel.pipelineType)
		const currentPipelineSlug = comfyuiDefaultPipelines?.[channel.type] ?? ""
		const currentModel = openRouterModels?.[channel.type] ?? ""
		const currentAtlasModel = atlasCloudModels?.[channel.type] ?? ""

		return (
			<div key={channel.type} className="border border-vscode-editorGroup-border/50 rounded-md overflow-hidden">
				{/* ── Section header (always visible toggle) ────────────── */}
				<div className="flex items-center gap-3 px-4 py-3 bg-vscode-sideBar-background/50 border-b border-vscode-editorGroup-border/30">
					<span className="text-lg shrink-0">{channel.icon}</span>
					<VSCodeCheckbox
						checked={isEnabled}
						onChange={(e: any) => setExperimentEnabled(channel.type, e.target.checked)}>
						<span className="font-medium text-sm">{channel.label}</span>
					</VSCodeCheckbox>
					{isEnabled && activeProvider === "comfyui" && (
						<span className="ml-auto text-[10px] text-vscode-descriptionForeground bg-vscode-input-background px-2 py-0.5 rounded-full">
							{channelPipelines.length} pipeline{channelPipelines.length !== 1 ? "s" : ""}
						</span>
					)}
				</div>

				{/* ── Section body (visible when enabled) ───────────────── */}
				{isEnabled && (
					<div className="p-4 space-y-4">
						{/* Description */}
						<p className="text-xs text-vscode-descriptionForeground m-0 leading-relaxed">
							{channel.description}
						</p>

						{/* Provider selector */}
						<div>
							<label className="block text-xs font-medium mb-1 text-vscode-descriptionForeground">
								{t("settings:experimental.IMAGE_GENERATION.providerLabel")}
							</label>
							<VSCodeDropdown
								value={activeProvider}
								onChange={(e: any) => updateGenerationProvider?.(channel.type, e.target.value)}
								className="w-full">
								<VSCodeOption value="comfyui" className="py-2 px-3">
									🖥 Local (ComfyUI)
								</VSCodeOption>
								<VSCodeOption value="openrouter" className="py-2 px-3">
									☁️ Cloud (OpenRouter)
								</VSCodeOption>
								<VSCodeOption value="comfy_cloud" className="py-2 px-3">
									☁️ Comfy Cloud
								</VSCodeOption>
								<VSCodeOption value="atlas_cloud" className="py-2 px-3">
									🌐 Atlas Cloud
								</VSCodeOption>
							</VSCodeDropdown>
						</div>

						{/* ComfyUI: pipeline section */}
						{activeProvider === "comfyui" && (
							<div>
								<div className="flex items-center justify-between mb-2">
									<label className="text-xs font-medium text-vscode-descriptionForeground">
										Pipelines
									</label>
									<button
										type="button"
										onClick={() => openImportDialog(channel.pipelineType)}
										className="flex items-center gap-1 text-xs text-vscode-textLink-foreground hover:text-vscode-textLink-activeForeground bg-transparent border-none cursor-pointer p-0">
										<Upload className="w-3 h-3" />
										Import New
									</button>
								</div>

								{/* Pipeline list with delete buttons */}
								{channelPipelines.length > 0 ? (
									<div className="border border-vscode-editorGroup-border/50 rounded-md overflow-hidden mb-3">
										{channelPipelines.map((p) => (
											<div
												key={p.slug}
												className="flex items-center gap-2 px-3 py-2 hover:bg-vscode-list-hoverBackground border-b border-vscode-editorGroup-border/30 last:border-b-0">
												<span className="text-sm flex-1 min-w-0 truncate">{p.name}</span>
												<span className="text-[10px] text-vscode-descriptionForeground shrink-0 mr-1">
													{p.slug}
												</span>
												<VSCodeButton
													appearance="icon"
													onClick={() => handleDeletePipeline(p.slug)}
													disabled={deletingPipelineSlug === p.slug}
													title="Delete this pipeline">
													{deletingPipelineSlug === p.slug ? (
														<Loader2 className="w-3.5 h-3.5 animate-spin" />
													) : (
														<Trash2 className="w-3.5 h-3.5" />
													)}
												</VSCodeButton>
											</div>
										))}
									</div>
								) : (
									<div className="border border-dashed border-vscode-editorGroup-border/50 rounded-md p-3 text-center mb-3">
										<p className="text-xs text-vscode-descriptionForeground mb-2">
											No pipelines for this type yet.
										</p>
										<VSCodeButton
											appearance="secondary"
											onClick={() => openImportDialog(channel.pipelineType)}>
											<Upload className="w-3.5 h-3.5 mr-1" />
											Import a ComfyUI Workflow
										</VSCodeButton>
									</div>
								)}

								{/* Default pipeline selector */}
								<div>
									<label className="block text-xs font-medium mb-1 text-vscode-descriptionForeground">
										Default Pipeline
									</label>
									<VSCodeDropdown
										value={currentPipelineSlug}
										onChange={(e: any) => setComfyuiDefaultPipeline?.(channel.type, e.target.value)}
										className="w-full">
										<VSCodeOption value="" className="py-2 px-3">
											(use auto-select)
										</VSCodeOption>
										{channelPipelines.map((p) => (
											<VSCodeOption key={p.slug} value={p.slug} className="py-2 px-3">
												{p.name}
											</VSCodeOption>
										))}
									</VSCodeDropdown>
								</div>
							</div>
						)}

						{/* OpenRouter: model text field */}
						{activeProvider === "openrouter" && (
							<div>
								<label className="block text-xs font-medium mb-1 text-vscode-descriptionForeground">
									OpenRouter Model Slug
								</label>
								<VSCodeTextField
									value={currentModel}
									onInput={(e: any) => updateOpenRouterModel?.(channel.type, e.target.value)}
									placeholder="e.g., stabilityai/stable-diffusion-3"
									className="w-full"
								/>
								<p className="text-vscode-descriptionForeground text-xs mt-1">
									Enter any OpenRouter model slug to use for this pipeline type.
								</p>
							</div>
						)}

						{/* Comfy Cloud: pipeline slug field */}
						{activeProvider === "comfy_cloud" && (
							<div>
								<label className="block text-xs font-medium mb-1 text-vscode-descriptionForeground">
									Pipeline Slug
								</label>
								<VSCodeTextField
									value={currentPipelineSlug}
									onInput={(e: any) => setComfyuiDefaultPipeline?.(channel.type, e.target.value)}
									placeholder="e.g., txt2img"
									className="w-full"
								/>
								<p className="text-vscode-descriptionForeground text-xs mt-1">
									Comfy Cloud pipeline slug. Leave empty to use the default pipeline for this type.
								</p>
							</div>
						)}

						{/* Atlas Cloud: model identifier field */}
						{activeProvider === "atlas_cloud" && (
							<div>
								<label className="block text-xs font-medium mb-1 text-vscode-descriptionForeground">
									Atlas Cloud Model
								</label>
								<VSCodeTextField
									value={currentAtlasModel}
									onInput={(e: any) => updateAtlasCloudModel?.(channel.type, e.target.value)}
									placeholder="e.g., wan-2.7, seedance-2.0"
									className="w-full"
								/>
								<p className="text-vscode-descriptionForeground text-xs mt-1">
									Enter an Atlas Cloud model identifier for this pipeline type.
								</p>
							</div>
						)}
					</div>
				)}
			</div>
		)
	}

	/* ── Render ──────────────────────────────────────────────── */

	return (
		<div className="space-y-4">
			{/* ─── Guide section ──────────────────────────────────── */}
			<div className="bg-vscode-editorInfo-background/30 border border-vscode-editorInfo-border/40 rounded-md p-4">
				<div className="flex items-start gap-3">
					<Info className="w-5 h-5 text-vscode-textLink-foreground mt-0.5 shrink-0" />
					<div>
						<p className="text-sm font-medium m-0">{t("settings:imageGeneration.guideTitle")}</p>
						<p className="text-xs text-vscode-descriptionForeground m-0 mt-1 leading-relaxed">
							{t("settings:imageGeneration.guideDescription")}
						</p>
					</div>
				</div>
			</div>

			{/* ─── Each channel as its own section ──────────────── */}
			{CHANNELS.map(renderChannelSection)}

			{/* ─── ComfyUI auto-setup ─────────────────────────────── */}
			<div className="border border-vscode-editorGroup-border/50 rounded-md p-3">
				<label className="block font-medium mb-2">ComfyUI Setup</label>
				<div className="flex flex-col gap-2">
					{autoSetupRunning ? (
						<>
							<VSCodeButton disabled>Setting up...</VSCodeButton>
							<div className="w-full mt-1">
								<Progress value={autoSetupProgress} className="h-2" />
								<div className="flex justify-between text-xs text-vscode-descriptionForeground mt-1">
									<span>{autoSetupStatus}</span>
									<span>{autoSetupProgress}%</span>
								</div>
							</div>
						</>
					) : configuredProviders?.has("comfyui") ? (
						<div className="flex flex-col gap-2">
							<div className="flex items-center gap-2 p-2 bg-vscode-editorInfo-background text-vscode-editorInfo-foreground rounded">
								<span className="text-lg">✓</span>
								<span className="text-sm font-medium">ComfyUI configured</span>
							</div>
							<VSCodeButton appearance="secondary" onClick={() => onAutoSetup?.("comfyui")}>
								Set up again
							</VSCodeButton>
						</div>
					) : (
						<>
							<VSCodeButton onClick={() => onAutoSetup?.("comfyui")}>Auto-Setup ComfyUI</VSCodeButton>
							{autoSetupStatus && (
								<p
									className={`text-xs mt-1 ${
										autoSetupStatus.startsWith("Warning:")
											? "text-vscode-editorWarning-foreground font-medium p-1 bg-vscode-editorWarning-background rounded"
											: "text-vscode-descriptionForeground"
									}`}>
									{autoSetupStatus}
								</p>
							)}
						</>
					)}
					{autoSetupStatus && autoSetupStatus.startsWith("Warning:") && (
						<div className="p-2 bg-vscode-editorWarning-background text-vscode-editorWarning-foreground rounded text-xs border border-vscode-editorWarning-border">
							⚠️ Hardware check warning. You may experience slow generation speeds or crash if proceeding
							with this hardware.
						</div>
					)}
					<p className="text-vscode-descriptionForeground text-xs mt-1">
						ComfyUI will be downloaded, installed, and configured automatically. A default model (SDXL Turbo
						or FLUX) will be selected based on your hardware.
					</p>
				</div>
			</div>

			{/* ─── Hardware profile ─────────────────────────────── */}
			{comfyuiHardwareProfile && (
				<div className="p-2 rounded bg-vscode-editorInfo-background text-xs text-vscode-editorInfo-foreground">
					🖥 Detected hardware: {comfyuiHardwareProfile}
				</div>
			)}

			{/* ─── Section: ComfyUI Workflow Browser ─────────────── */}
			{configuredProviders?.has("comfyui") && (
				<div className="border border-vscode-editorGroup-border/50 rounded-md p-3">
					<div
						className="cursor-pointer font-medium text-sm select-none flex items-center gap-1.5"
						onClick={() => setWorkflowBrowserOpen((prev) => !prev)}>
						<ChevronDown
							className={`w-4 h-4 transition-transform ${workflowBrowserOpen ? "" : "-rotate-90"}`}
						/>
						<Scan className="w-4 h-4" />
						ComfyUI Workflow Browser
						{scanResults && (
							<span className="ml-auto text-[10px] text-vscode-descriptionForeground bg-vscode-badge-background px-1.5 py-0.5 rounded-full">
								{scanResults.workflows.length}
							</span>
						)}
					</div>
					{workflowBrowserOpen && (
						<div className="mt-3 space-y-3">
							<p className="text-xs text-vscode-descriptionForeground">
								Scan your ComfyUI installation for user workflows and import them as pipelines.
								Workflows found in{" "}
								<code className="text-vscode-textLink-foreground">user/default/workflows/</code> will be
								listed below.
							</p>

							{/* Action buttons */}
							<div className="flex flex-wrap items-center gap-2">
								<VSCodeButton appearance="secondary" onClick={handleScanWorkflows} disabled={scanning}>
									{scanning ? (
										<>
											<Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
											Scanning...
										</>
									) : (
										<>
											<Scan className="w-3.5 h-3.5 mr-1.5" />
											Scan for Workflows
										</>
									)}
								</VSCodeButton>

								<VSCodeButton
									appearance="secondary"
									onClick={handleStartServer}
									disabled={startingServer}>
									{startingServer ? (
										<>
											<Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
											Starting Server...
										</>
									) : (
										<>
											<Play className="w-3.5 h-3.5 mr-1.5" />
											Start ComfyUI Server
										</>
									)}
								</VSCodeButton>

								{serverUrl && (
									<button
										type="button"
										onClick={() => handleOpenServerUrl(serverUrl)}
										className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-vscode-textLink-foreground hover:text-vscode-textLink-activeForeground bg-vscode-textLink-foreground/10 hover:bg-vscode-textLink-foreground/15 border border-vscode-textLink-foreground/30 cursor-pointer transition-colors">
										<ExternalLink className="w-3.5 h-3.5" />
										Open ComfyUI ({serverUrl})
									</button>
								)}
							</div>

							{serverError && (
								<div className="flex items-start gap-2 text-xs text-vscode-editorWarning-foreground bg-vscode-editorWarning-background/20 p-2 rounded border border-vscode-editorWarning-border/40">
									<span className="mt-0.5 select-none">⚠️</span>
									<p className="flex-1 m-0 leading-relaxed">{serverError}</p>
									<button
										type="button"
										onClick={() => {
											navigator.clipboard.writeText(serverError)
											setCopiedError(true)
											setTimeout(() => setCopiedError(false), 2000)
										}}
										className="p-1 rounded text-vscode-descriptionForeground hover:bg-vscode-toolbar-hoverBackground hover:text-vscode-foreground cursor-pointer transition-colors"
										title="Copy error message">
										{copiedError ? (
											<Check className="w-3.5 h-3.5 text-vscode-charts-green" />
										) : (
											<Copy className="w-3.5 h-3.5" />
										)}
									</button>
								</div>
							)}

							{/* Scan results */}
							{scanResults && (
								<div className="space-y-2">
									<div className="flex items-center justify-between">
										<span className="text-xs font-medium text-vscode-descriptionForeground">
											Found {scanResults.workflows.length} workflow
											{scanResults.workflows.length !== 1 ? "s" : ""}
										</span>
										<span className="text-[10px] text-vscode-descriptionForeground truncate max-w-[280px]">
											{scanResults.workflowDir}
										</span>
									</div>
									{scanResults.workflows.length === 0 ? (
										<div className="p-3 border border-dashed border-vscode-editorGroup-border/50 rounded-md bg-vscode-sideBar-background/30 space-y-2">
											<p className="text-xs text-vscode-descriptionForeground m-0 italic">
												No workflows found in the scanned directory.
											</p>
											<p className="text-xs text-vscode-descriptionForeground m-0">
												Start the ComfyUI server, build or save your workflows in the ComfyUI
												web interface, then click <strong>Scan for Workflows</strong> to import
												them.
											</p>
											<div className="flex items-center gap-2 pt-1">
												<VSCodeButton
													appearance="secondary"
													onClick={handleStartServer}
													disabled={startingServer}>
													<Play className="w-3.5 h-3.5 mr-1.5" />
													Start Server & Open UI
												</VSCodeButton>
												<button
													type="button"
													onClick={() =>
														handleOpenServerUrl(serverUrl || "http://127.0.0.1:8188")
													}
													className="inline-flex items-center gap-1.5 text-xs text-vscode-textLink-foreground hover:text-vscode-textLink-activeForeground bg-transparent border-none cursor-pointer p-0 underline">
													<ExternalLink className="w-3 h-3" />
													http://127.0.0.1:8188
												</button>
											</div>
										</div>
									) : (
										<>
											{/* Batch selection controls */}
											<div className="flex items-center gap-2">
												<VSCodeButton
													appearance="secondary"
													onClick={() =>
														setSelectedWorkflows(
															new Set(scanResults.workflows.map((wf) => wf.filename)),
														)
													}
													disabled={selectedWorkflows.size === scanResults.workflows.length}>
													Select All
												</VSCodeButton>
												{selectedWorkflows.size === scanResults.workflows.length && (
													<VSCodeButton
														appearance="secondary"
														onClick={() => setSelectedWorkflows(new Set())}>
														Deselect All
													</VSCodeButton>
												)}
											</div>
											<div className="border border-vscode-editorGroup-border/50 rounded-md overflow-hidden">
												{scanResults.workflows.map((wf) => (
													<div
														key={wf.filename}
														className="flex items-center gap-2 px-3 py-2 hover:bg-vscode-list-hoverBackground border-b border-vscode-editorGroup-border/30 last:border-b-0">
														<VSCodeCheckbox
															checked={selectedWorkflows.has(wf.filename)}
															onChange={() => handleToggleWorkflowSelection(wf.filename)}>
															<span className="text-sm">{wf.name}</span>
														</VSCodeCheckbox>
														<div className="ml-auto">
															<VSCodeButton
																appearance="icon"
																onClick={() => handleDeleteWorkflow(wf.filename)}
																disabled={deletingWorkflow === wf.filename}
																title="Delete this workflow">
																{deletingWorkflow === wf.filename ? (
																	<Loader2 className="w-3.5 h-3.5 animate-spin" />
																) : (
																	<Trash2 className="w-3.5 h-3.5" />
																)}
															</VSCodeButton>
														</div>
													</div>
												))}
											</div>
										</>
									)}
									{selectedWorkflows.size > 0 && (
										<div className="flex items-center gap-2">
											{selectedWorkflows.size === scanResults.workflows.length && (
												<VSCodeButton
													onClick={handleImportSelectedWorkflows}
													disabled={importingWorkflows}>
													{importingWorkflows ? (
														<>
															<Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
															Importing...
														</>
													) : (
														<>
															<Plus className="w-3.5 h-3.5 mr-1.5" />
															Import All ({selectedWorkflows.size})
														</>
													)}
												</VSCodeButton>
											)}
											{selectedWorkflows.size < scanResults.workflows.length && (
												<VSCodeButton
													onClick={handleImportSelectedWorkflows}
													disabled={importingWorkflows}>
													{importingWorkflows ? (
														<>
															<Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
															Importing...
														</>
													) : (
														<>
															<Plus className="w-3.5 h-3.5 mr-1.5" />
															Import Selected ({selectedWorkflows.size})
														</>
													)}
												</VSCodeButton>
											)}
											<VSCodeButton
												appearance="secondary"
												onClick={() => {
													setScanResults(null)
													setSelectedWorkflows(new Set())
												}}>
												<X className="w-3.5 h-3.5 mr-1.5" />
												Dismiss
											</VSCodeButton>
										</div>
									)}
								</div>
							)}
						</div>
					)}
				</div>
			)}

			{/* ─── Import Pipeline Dialog ─────────────────────────── */}
			<AlertDialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
				<AlertDialogContent className="max-w-lg">
					<AlertDialogHeader>
						<AlertDialogTitle>
							Import Pipeline
							{importPipelineType
								? ` — ${PIPELINE_TYPE_LABELS[importPipelineType] ?? importPipelineType}`
								: ""}
						</AlertDialogTitle>
						<AlertDialogDescription>
							Paste a ComfyUI workflow JSON to import as a new pipeline.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<div className="my-3">
						<Textarea
							placeholder="Paste ComfyUI workflow JSON here..."
							value={importJson}
							onChange={(e) => {
								setImportJson(e.target.value)
								setImportError(null)
							}}
							rows={10}
							className="font-mono text-xs"
						/>
						{importError && <p className="text-xs text-vscode-errorForeground mt-1">{importError}</p>}
					</div>
					<AlertDialogFooter>
						<AlertDialogCancel
							onClick={() => {
								setImportDialogOpen(false)
								setImportJson("")
								setImportError(null)
								setImportPipelineType(null)
							}}>
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction onClick={handleImportSubmit} disabled={isImporting}>
							{isImporting ? "Importing..." : "Import"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}

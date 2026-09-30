import React, { useState, useMemo, useCallback } from "react"
import {
	Zap,
	ExternalLink,
	Eye,
	EyeOff,
	Check,
	Sparkles,
	SlidersHorizontal,
	CheckCircle2,
	Circle,
	Key,
	ChevronDown,
	ChevronUp,
} from "lucide-react"

import {
	type ProviderName,
	type ProviderSettings,
	freeRouterDefaultModelId,
	getAvailableFreeRouterModels,
	getSelectedFreeRouterModels,
} from "@mirror-vs/types"

import { ExtensionStateContextType } from "@src/context/ExtensionStateContext"
import { cn } from "@src/lib/utils"
import { Button } from "@src/components/ui"
import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
import { SetCachedStateField } from "./types"
import { vscode } from "@src/utils/vscode"

interface FreeSettingsViewProps {
	cachedState: ExtensionStateContextType
	setCachedStateField: SetCachedStateField<keyof ExtensionStateContextType>
	setApiConfigurationField: <K extends keyof ProviderSettings>(
		field: K,
		value: ProviderSettings[K],
		isUserAction?: boolean,
	) => void
	onSwitchToAdvanced: () => void
}

interface ProviderEntry {
	id: ProviderName
	name: string
	keyField: keyof ProviderSettings
	keyUrl: string
	keyLabel: string
	keyPlaceholder: string
	accentColor: string
}

const PROVIDER_ENTRIES: ProviderEntry[] = [
	{
		id: "groq",
		name: "Groq",
		keyField: "groqApiKey",
		keyUrl: "https://console.groq.com/keys",
		keyLabel: "Get Free Key",
		keyPlaceholder: "gsk_...",
		accentColor: "orange",
	},
	{
		id: "cerebras",
		name: "Cerebras",
		keyField: "cerebrasApiKey",
		keyUrl: "https://cloud.cerebras.ai",
		keyLabel: "Get Free Key",
		keyPlaceholder: "csk_...",
		accentColor: "cyan",
	},
	{
		id: "nvidia",
		name: "NVIDIA NIM",
		keyField: "nvidiaApiKey",
		keyUrl: "https://build.nvidia.com",
		keyLabel: "Get Free Key",
		keyPlaceholder: "nvapi-...",
		accentColor: "green",
	},
	{
		id: "gemini",
		name: "Google Gemini",
		keyField: "geminiApiKey",
		keyUrl: "https://aistudio.google.com/app/apikey",
		keyLabel: "Get Free Key",
		keyPlaceholder: "AIza...",
		accentColor: "blue",
	},
	{
		id: "sambanova",
		name: "SambaNova",
		keyField: "sambaNovaApiKey",
		keyUrl: "https://cloud.sambanova.ai/apis",
		keyLabel: "Get Free Key",
		keyPlaceholder: "snova_...",
		accentColor: "purple",
	},
	{
		id: "openrouter",
		name: "OpenRouter",
		keyField: "openRouterApiKey",
		keyUrl: "https://openrouter.ai/keys",
		keyLabel: "Get Key",
		keyPlaceholder: "sk-or-...",
		accentColor: "emerald",
	},
]

const ACCENT_CLASSES: Record<string, { dot: string; badge: string; ring: string }> = {
	orange: {
		dot: "bg-orange-400",
		badge: "bg-orange-500/15 text-orange-300 border-orange-500/30",
		ring: "ring-orange-500/20",
	},
	cyan: { dot: "bg-cyan-400", badge: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30", ring: "ring-cyan-500/20" },
	green: {
		dot: "bg-green-400",
		badge: "bg-green-500/15 text-green-300 border-green-500/30",
		ring: "ring-green-500/20",
	},
	blue: { dot: "bg-blue-400", badge: "bg-blue-500/15 text-blue-300 border-blue-500/30", ring: "ring-blue-500/20" },
	purple: {
		dot: "bg-purple-400",
		badge: "bg-purple-500/15 text-purple-300 border-purple-500/30",
		ring: "ring-purple-500/20",
	},
	emerald: {
		dot: "bg-emerald-400",
		badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
		ring: "ring-emerald-500/20",
	},
}

export const FreeSettingsView: React.FC<FreeSettingsViewProps> = ({
	cachedState,
	setCachedStateField,
	setApiConfigurationField,
	onSwitchToAdvanced,
}) => {
	const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({})
	const [expandedProviders, setExpandedProviders] = useState<Record<string, boolean>>({})

	const toggleKeyVisibility = useCallback((id: string) => {
		setVisibleKeys((prev) => ({ ...prev, [id]: !prev[id] }))
	}, [])

	const apiConfig = cachedState.apiConfiguration ?? {}
	const isAutoRouterActive = apiConfig.apiProvider === "free-router"

	const configuredCount = useMemo(() => {
		return PROVIDER_ENTRIES.filter((p) => {
			const val = apiConfig[p.keyField] as string | undefined
			return !!val?.trim()
		}).length
	}, [apiConfig])

	const availableModels = useMemo(() => getAvailableFreeRouterModels(apiConfig), [apiConfig])
	const selectedModels = useMemo(() => getSelectedFreeRouterModels(apiConfig), [apiConfig])

	const handleToggleModel = useCallback(
		(modelId: string, checked: boolean) => {
			const updated = checked
				? Array.from(new Set([...selectedModels, modelId]))
				: selectedModels.filter((id) => id !== modelId)

			setApiConfigurationField("freeRouterModels", updated)
			if (!checked && apiConfig.apiModelId === modelId) {
				setApiConfigurationField("apiModelId", "")
			}

			vscode.postMessage({
				type: "upsertApiConfiguration",
				text: cachedState.currentApiConfigName,
				apiConfiguration: {
					...apiConfig,
					freeRouterModels: updated,
					apiModelId: !checked && apiConfig.apiModelId === modelId ? "" : apiConfig.apiModelId,
				},
			})
		},
		[selectedModels, apiConfig, cachedState.currentApiConfigName, setApiConfigurationField],
	)

	const handleSelectAll = useCallback(() => {
		const allIds = availableModels.map((m) => m.id)
		setApiConfigurationField("freeRouterModels", allIds)
		vscode.postMessage({
			type: "upsertApiConfiguration",
			text: cachedState.currentApiConfigName,
			apiConfiguration: { ...apiConfig, freeRouterModels: allIds },
		})
	}, [availableModels, apiConfig, cachedState.currentApiConfigName, setApiConfigurationField])

	const handleDeselectAll = useCallback(() => {
		setApiConfigurationField("freeRouterModels", [])
		setApiConfigurationField("apiModelId", "")
		vscode.postMessage({
			type: "upsertApiConfiguration",
			text: cachedState.currentApiConfigName,
			apiConfiguration: { ...apiConfig, freeRouterModels: [], apiModelId: "" },
		})
	}, [apiConfig, cachedState.currentApiConfigName, setApiConfigurationField])

	const handleActivateAutoRouter = useCallback(() => {
		setApiConfigurationField("apiProvider", "free-router")
		setApiConfigurationField("apiModelId", freeRouterDefaultModelId)
		vscode.postMessage({
			type: "upsertApiConfiguration",
			text: cachedState.currentApiConfigName,
			apiConfiguration: { ...apiConfig, apiProvider: "free-router", apiModelId: freeRouterDefaultModelId },
		})
	}, [apiConfig, cachedState.currentApiConfigName, setApiConfigurationField])

	const groupedAvailableModels = useMemo(() => {
		const grouped: Record<string, typeof availableModels> = {}
		for (const m of availableModels) {
			if (!grouped[m.provider]) grouped[m.provider] = []
			grouped[m.provider].push(m)
		}
		return grouped
	}, [availableModels])

	return (
		<div className="flex flex-col gap-5 max-w-3xl mx-auto py-2 px-1">
			{/* Hero / Status Bar */}
			<div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-500/10 to-transparent border border-emerald-500/20">
				<div className="flex items-center gap-3">
					<div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
						<Zap className="w-4 h-4 text-emerald-400" />
					</div>
					<div>
						<div className="text-[13px] font-semibold text-vscode-foreground leading-tight">
							Free AI Auto-Router
						</div>
						<div className="text-[11px] text-vscode-descriptionForeground mt-0.5">
							{configuredCount > 0
								? `${configuredCount} provider${configuredCount > 1 ? "s" : ""} connected · ${selectedModels.length} model${selectedModels.length !== 1 ? "s" : ""} active`
								: "Add at least one free API key below to get started"}
						</div>
					</div>
				</div>
				<div className="flex items-center gap-2 shrink-0">
					<Button
						variant="outline"
						size="sm"
						onClick={onSwitchToAdvanced}
						className="text-[11px] h-7 px-2.5 border-vscode-editorGroup-border/60 hover:bg-vscode-toolbar-hoverBackground">
						<SlidersHorizontal className="w-3 h-3 mr-1.5" />
						Advanced
					</Button>
					<Button
						variant={isAutoRouterActive ? "primary" : "secondary"}
						size="sm"
						onClick={handleActivateAutoRouter}
						disabled={isAutoRouterActive}
						className={cn(
							"text-[11px] h-7 px-3 font-medium",
							isAutoRouterActive ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "",
						)}>
						{isAutoRouterActive ? (
							<>
								<Check className="w-3 h-3 mr-1" />
								Active
							</>
						) : (
							<>
								<Zap className="w-3 h-3 mr-1" />
								Activate Router
							</>
						)}
					</Button>
				</div>
			</div>

			{/* Section: Provider API Keys */}
			<div className="flex flex-col gap-2">
				<div className="flex items-center gap-2 px-1">
					<Key className="w-3.5 h-3.5 text-vscode-descriptionForeground" />
					<span className="text-[12px] font-semibold text-vscode-foreground uppercase tracking-wide">
						Provider API Keys
					</span>
					<span className="text-[11px] text-vscode-descriptionForeground">
						— paste your free keys (at least one required)
					</span>
				</div>

				<div className="grid grid-cols-1 gap-2">
					{PROVIDER_ENTRIES.map((provider) => {
						const keyVal = (apiConfig[provider.keyField] as string) || ""
						const hasKey = !!keyVal.trim()
						const isVisible = visibleKeys[provider.id]
						const accent = ACCENT_CLASSES[provider.accentColor] || ACCENT_CLASSES.emerald

						return (
							<div
								key={provider.id}
								className={cn(
									"flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all",
									hasKey
										? `border-vscode-editorGroup-border/60 bg-vscode-editor-background ring-1 ${accent.ring}`
										: "border-vscode-editorGroup-border/40 bg-vscode-editor-background/60",
								)}>
								<div
									className={cn(
										"w-2 h-2 rounded-full shrink-0 transition-colors",
										hasKey ? accent.dot : "bg-vscode-descriptionForeground/30",
									)}
								/>
								<div className="w-24 shrink-0">
									<span className="text-[12px] font-semibold text-vscode-foreground">
										{provider.name}
									</span>
								</div>
								<div className="relative flex items-center flex-1 min-w-0">
									<VSCodeTextField
										type={isVisible ? "text" : "password"}
										value={keyVal}
										onInput={(e: any) =>
											setApiConfigurationField(provider.keyField, e.target.value)
										}
										placeholder={provider.keyPlaceholder}
										className="w-full text-xs"
									/>
									<button
										type="button"
										onClick={() => toggleKeyVisibility(provider.id)}
										className="absolute right-2 text-vscode-descriptionForeground hover:text-vscode-foreground p-0.5 border-none bg-transparent cursor-pointer">
										{isVisible ? (
											<EyeOff className="w-3.5 h-3.5" />
										) : (
											<Eye className="w-3.5 h-3.5" />
										)}
									</button>
								</div>
								{hasKey ? (
									<span
										className={cn(
											"shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border",
											accent.badge,
										)}>
										<Check className="w-2.5 h-2.5" />
										Connected
									</span>
								) : (
									<a
										href={provider.keyUrl}
										target="_blank"
										rel="noopener noreferrer"
										className="shrink-0 inline-flex items-center gap-1 text-[11px] text-vscode-textLink-foreground hover:underline whitespace-nowrap">
										{provider.keyLabel}
										<ExternalLink className="w-2.5 h-2.5" />
									</a>
								)}
							</div>
						)
					})}
				</div>
			</div>

			{/* Section: Active Model Pool */}
			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between px-1">
					<div className="flex items-center gap-2">
						<Sparkles className="w-3.5 h-3.5 text-vscode-descriptionForeground" />
						<span className="text-[12px] font-semibold text-vscode-foreground uppercase tracking-wide">
							Active Model Pool
						</span>
						{availableModels.length > 0 && (
							<span className="text-[11px] text-vscode-descriptionForeground">
								— {selectedModels.length} of {availableModels.length} selected for routing &amp;
								dropdown
							</span>
						)}
					</div>
					{availableModels.length > 0 && (
						<div className="flex items-center gap-1.5">
							<button
								type="button"
								onClick={handleSelectAll}
								disabled={selectedModels.length === availableModels.length}
								className="text-[11px] text-vscode-textLink-foreground hover:underline disabled:opacity-40 cursor-pointer border-none bg-transparent px-0">
								Select all
							</button>
							<span className="text-vscode-descriptionForeground/40">·</span>
							<button
								type="button"
								onClick={handleDeselectAll}
								disabled={selectedModels.length === 0}
								className="text-[11px] text-vscode-textLink-foreground hover:underline disabled:opacity-40 cursor-pointer border-none bg-transparent px-0">
								Deselect all
							</button>
						</div>
					)}
				</div>

				{availableModels.length === 0 ? (
					<div className="flex flex-col items-center text-center gap-2 py-8 px-4 rounded-lg border border-dashed border-vscode-editorGroup-border/60 bg-vscode-editor-background/40">
						<Sparkles className="w-6 h-6 text-vscode-descriptionForeground/40" />
						<p className="text-[12px] text-vscode-descriptionForeground max-w-sm m-0">
							No provider keys connected yet. Paste a free API key above and models will appear here
							automatically.
						</p>
					</div>
				) : (
					<div className="flex flex-col gap-1">
						{Object.entries(groupedAvailableModels).map(([providerId, models]) => {
							const providerEntry = PROVIDER_ENTRIES.find((p) => p.id === providerId)
							const accent = ACCENT_CLASSES[providerEntry?.accentColor || "emerald"]
							const allSelected = models.every((m) => selectedModels.includes(m.id))
							const someSelected = models.some((m) => selectedModels.includes(m.id))
							const isExpanded = expandedProviders[providerId] !== false

							return (
								<div
									key={providerId}
									className="rounded-lg border border-vscode-editorGroup-border/50 bg-vscode-editor-background overflow-hidden">
									<button
										type="button"
										onClick={() =>
											setExpandedProviders((prev) => ({ ...prev, [providerId]: !isExpanded }))
										}
										className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-vscode-list-hoverBackground/50 transition-colors cursor-pointer border-none bg-transparent text-left">
										<div className={cn("w-2 h-2 rounded-full shrink-0", accent.dot)} />
										<span className="text-[12px] font-semibold text-vscode-foreground flex-1">
											{providerEntry?.name ?? providerId}
										</span>
										<span className="text-[11px] text-vscode-descriptionForeground">
											{models.filter((m) => selectedModels.includes(m.id)).length}/{models.length}{" "}
											selected
										</span>
										{allSelected ? (
											<CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
										) : someSelected ? (
											<Circle className="w-3.5 h-3.5 text-vscode-descriptionForeground/60 shrink-0" />
										) : (
											<Circle className="w-3.5 h-3.5 text-vscode-descriptionForeground/30 shrink-0" />
										)}
										{isExpanded ? (
											<ChevronUp className="w-3.5 h-3.5 text-vscode-descriptionForeground/60 shrink-0" />
										) : (
											<ChevronDown className="w-3.5 h-3.5 text-vscode-descriptionForeground/60 shrink-0" />
										)}
									</button>

									{isExpanded && (
										<div className="border-t border-vscode-editorGroup-border/30">
											{models.map((model) => {
												const isSelected = selectedModels.includes(model.id)
												const isCurrentActive = apiConfig.apiModelId === model.id

												return (
													<div
														key={model.id}
														onClick={() => handleToggleModel(model.id, !isSelected)}
														className={cn(
															"flex items-center gap-3 px-4 py-2 cursor-pointer select-none transition-colors",
															isSelected
																? "hover:bg-emerald-500/5"
																: "opacity-60 hover:opacity-80 hover:bg-vscode-list-hoverBackground/30",
														)}>
														<div
															className={cn(
																"w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
																isSelected
																	? "bg-emerald-500/20 border-emerald-500/60"
																	: "border-vscode-editorGroup-border/60 bg-transparent",
															)}>
															{isSelected && (
																<Check className="w-2.5 h-2.5 text-emerald-400" />
															)}
														</div>
														<div className="flex items-center gap-2 flex-1 min-w-0">
															<span className="text-[12px] font-medium text-vscode-foreground truncate">
																{model.name}
															</span>
															{isCurrentActive && (
																<span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-medium border border-amber-500/30">
																	Primary
																</span>
															)}
															{model.description && (
																<span className="text-[11px] text-vscode-descriptionForeground truncate hidden sm:block">
																	{model.description}
																</span>
															)}
														</div>
														<span className="text-[11px] text-vscode-descriptionForeground shrink-0 font-mono">
															{(model.contextWindow / 1024).toFixed(0)}k
														</span>
														{isSelected && !isCurrentActive && (
															<button
																type="button"
																onClick={(e) => {
																	e.stopPropagation()
																	setApiConfigurationField("apiModelId", model.id)
																}}
																className="shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-vscode-editorGroup-border/50 text-vscode-descriptionForeground hover:text-vscode-foreground hover:border-amber-500/40 transition-colors cursor-pointer bg-transparent">
																Set primary
															</button>
														)}
														{isCurrentActive && (
															<button
																type="button"
																onClick={(e) => {
																	e.stopPropagation()
																	setApiConfigurationField("apiModelId", "")
																}}
																className="shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-amber-500/30 text-amber-300 hover:border-amber-500/60 transition-colors cursor-pointer bg-transparent">
																Reset
															</button>
														)}
													</div>
												)
											})}
										</div>
									)}
								</div>
							)
						})}
					</div>
				)}
			</div>

			<p className="text-[11px] text-vscode-descriptionForeground/60 text-center m-0 pb-2">
				The auto-router seamlessly failovers between selected models if one gets rate-limited or times out.
				Selected models also appear in the chat model dropdown.
			</p>
		</div>
	)
}

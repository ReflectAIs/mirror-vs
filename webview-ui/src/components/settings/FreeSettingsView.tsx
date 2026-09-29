import React, { useState, useMemo, useCallback } from "react"
import {
	Zap,
	ExternalLink,
	Eye,
	EyeOff,
	Check,
	Sparkles,
	SlidersHorizontal,
	Bot,
	ArrowRight,
	ShieldCheck,
	Cpu,
	Flame,
	Layers,
	Globe,
	Laptop,
} from "lucide-react"

import {
	type ProviderName,
	type ProviderSettings,
	freeRouterDefaultModelId,
	nvidiaDefaultModelId,
	groqDefaultModelId,
	cerebrasDefaultModelId,
	sambaNovaDefaultModelId,
	geminiDefaultModelId,
	DEFAULT_FREE_ROUTER_MODELS,
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

interface FreeProviderItem {
	id: ProviderName
	name: string
	badge: string
	icon: React.ReactNode
	description: string
	keyUrl?: string
	keyLabel?: string
	keyField?: keyof ProviderSettings
	defaultModel: string
	models: Array<{ id: string; label: string; tag?: string }>
}

const FREE_PROVIDERS_CONFIG: FreeProviderItem[] = [
	{
		id: "groq",
		name: "Groq",
		badge: "Ultra-Fast LPU (Free Tier)",
		icon: <Flame className="w-4 h-4 text-orange-400" />,
		description: "High-speed inference on Meta Llama 3.3 70B & DeepSeek R1 Distill on specialized LPUs.",
		keyUrl: "https://console.groq.com/keys",
		keyLabel: "Get Free Groq Key",
		keyField: "groqApiKey",
		defaultModel: groqDefaultModelId,
		models: [
			{ id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B Versatile", tag: "Recommended" },
			{ id: "deepseek-r1-distill-llama-70b", label: "DeepSeek R1 Distill 70B", tag: "Reasoning" },
			{ id: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant", tag: "Fast" },
		],
	},
	{
		id: "cerebras",
		name: "Cerebras",
		badge: "Wafer-Scale Speed (~2000 tps)",
		icon: <Cpu className="w-4 h-4 text-cyan-400" />,
		description: "Blazing fast wafer-scale engine inference on Meta Llama 3.3 70B with free daily quota.",
		keyUrl: "https://cloud.cerebras.ai",
		keyLabel: "Get Free Cerebras Key",
		keyField: "cerebrasApiKey",
		defaultModel: cerebrasDefaultModelId,
		models: [
			{ id: "llama-3.3-70b", label: "Llama 3.3 70B", tag: "Fastest 70B" },
			{ id: "llama3.1-8b", label: "Llama 3.1 8B", tag: "Instant" },
		],
	},
	{
		id: "nvidia",
		name: "NVIDIA NIM",
		badge: "1,000 Free Trial Credits",
		icon: <Sparkles className="w-4 h-4 text-green-400" />,
		description:
			"Enterprise NVIDIA DGX Cloud hosting Nemotron 70B, Llama 3.3, and full DeepSeek R1. Requires verified developer account on build.nvidia.com for public inference; Free Auto-Router auto-fails over if unverified.",
		keyUrl: "https://build.nvidia.com",
		keyLabel: "Get Free NVIDIA Key",
		keyField: "nvidiaApiKey",
		defaultModel: nvidiaDefaultModelId,
		models: [
			{ id: "meta/llama-3.3-70b-instruct", label: "Meta Llama 3.3 70B Instruct", tag: "Recommended" },
			{ id: "deepseek-ai/deepseek-r1", label: "DeepSeek R1 (671B Full)", tag: "Reasoning" },
			{ id: "nvidia/llama-3.1-nemotron-70b-instruct", label: "Nemotron 70B Instruct", tag: "Coding" },
		],
	},
	{
		id: "gemini",
		name: "Google Gemini",
		badge: "1M Context Window (Free Tier)",
		icon: <Globe className="w-4 h-4 text-blue-400" />,
		description: "Google's Gemini 2.5 Flash with massive 1M token context, multimodal vision, and high speed.",
		keyUrl: "https://aistudio.google.com/app/apikey",
		keyLabel: "Get Free Gemini Key",
		keyField: "geminiApiKey",
		defaultModel: geminiDefaultModelId,
		models: [
			{ id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", tag: "1M Context" },
			{ id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", tag: "Fast" },
		],
	},
	{
		id: "sambanova",
		name: "SambaNova",
		badge: "SN40L Cloud (Free Tier)",
		icon: <Layers className="w-4 h-4 text-purple-400" />,
		description: "High-throughput cloud inference on Llama 3.3 70B and DeepSeek R1 running on SambaNova RDUs.",
		keyUrl: "https://cloud.sambanova.ai/apis",
		keyLabel: "Get Free SambaNova Key",
		keyField: "sambaNovaApiKey",
		defaultModel: sambaNovaDefaultModelId,
		models: [
			{ id: "Meta-Llama-3.3-70B-Instruct", label: "Llama 3.3 70B Instruct", tag: "Recommended" },
			{ id: "DeepSeek-R1-Distill-Llama-70B", label: "DeepSeek R1 Distill", tag: "Reasoning" },
		],
	},
	{
		id: "openrouter",
		name: "OpenRouter (Free Tier)",
		badge: "10+ Zero-Cost Models",
		icon: <Bot className="w-4 h-4 text-emerald-400" />,
		description: "OpenRouter's free-tier pool featuring Gemma 4 31B, Qwen 3.8 27B, Cohere Code, and Nemotron.",
		keyUrl: "https://openrouter.ai/keys",
		keyLabel: "Get OpenRouter Key",
		keyField: "openRouterApiKey",
		defaultModel: "google/gemma-4-31b-it:free",
		models: [
			{ id: "google/gemma-4-31b-it:free", label: "Gemma 4 31B (Free)", tag: "Recommended" },
			{ id: "qwen/qwen3.8-27b:free", label: "Qwen 3.8 27B (Free)", tag: "Coding" },
			{ id: "cohere/north-mini-code:free", label: "Cohere North Mini Code (Free)", tag: "Fast" },
			{ id: "nvidia/nemotron-3-ultra-550b-a55b:free", label: "Nemotron 3 Ultra 550B (Free)", tag: "1M Context" },
		],
	},
	{
		id: "ollama",
		name: "Ollama (Local AI)",
		badge: "100% Free & Offline",
		icon: <Laptop className="w-4 h-4 text-amber-400" />,
		description: "Run open models completely locally on your hardware with 0 API fees and maximum privacy.",
		keyUrl: "https://ollama.ai",
		keyLabel: "Download Ollama",
		defaultModel: "qwen2.5-coder:latest",
		models: [
			{ id: "qwen2.5-coder:latest", label: "Qwen 2.5 Coder", tag: "Local Code" },
			{ id: "deepseek-r1:latest", label: "DeepSeek R1 Local", tag: "Reasoning" },
			{ id: "llama3.2:latest", label: "Llama 3.2", tag: "General" },
		],
	},
]

export const FreeSettingsView: React.FC<FreeSettingsViewProps> = ({
	cachedState,
	setCachedStateField,
	setApiConfigurationField,
	onSwitchToAdvanced,
}) => {
	const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({})

	const toggleKeyVisibility = useCallback((id: string) => {
		setVisibleKeys((prev) => ({ ...prev, [id]: !prev[id] }))
	}, [])

	const apiConfig = cachedState.apiConfiguration ?? {}
	const currentProvider = apiConfig.apiProvider || "free-router"
	const isAutoRouterActive = currentProvider === "free-router"

	// Count configured free keys
	const configuredKeysCount = useMemo(() => {
		let count = 0
		if (apiConfig.groqApiKey) count++
		if (apiConfig.cerebrasApiKey) count++
		if (apiConfig.nvidiaApiKey) count++
		if (apiConfig.geminiApiKey) count++
		if (apiConfig.sambaNovaApiKey) count++
		if (apiConfig.openRouterApiKey || apiConfig.freeRouterApiKey) count++
		return count
	}, [apiConfig])

	const handleActivateProvider = useCallback(
		(providerId: ProviderName, defaultModel: string) => {
			setApiConfigurationField("apiProvider", providerId)
			setApiConfigurationField("apiModelId", defaultModel)

			// Persist immediately via upsertApiConfiguration
			vscode.postMessage({
				type: "upsertApiConfiguration",
				text: cachedState.currentApiConfigName,
				apiConfiguration: {
					...apiConfig,
					apiProvider: providerId,
					apiModelId: defaultModel,
				},
			})
		},
		[apiConfig, cachedState.currentApiConfigName, setApiConfigurationField],
	)

	const handleActivateAutoRouter = useCallback(() => {
		setApiConfigurationField("apiProvider", "free-router")
		setApiConfigurationField("apiModelId", freeRouterDefaultModelId)

		vscode.postMessage({
			type: "upsertApiConfiguration",
			text: cachedState.currentApiConfigName,
			apiConfiguration: {
				...apiConfig,
				apiProvider: "free-router",
				apiModelId: freeRouterDefaultModelId,
			},
		})
	}, [apiConfig, cachedState.currentApiConfigName, setApiConfigurationField])

	return (
		<div className="flex flex-col gap-6 max-w-4xl mx-auto py-2 px-1">
			{/* Hero Banner */}
			<div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-emerald-500/15 via-teal-500/10 to-transparent border border-emerald-500/30 p-5">
				<div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
					<div>
						<div className="flex items-center gap-2 mb-1.5">
							<span className="px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/40">
								⚡ Free AI Mode
							</span>
							<span className="text-xs text-vscode-descriptionForeground">
								Zero API Cost • Auto Multi-Model Failover
							</span>
						</div>
						<h2 className="text-lg font-bold text-vscode-foreground m-0">
							Free Tier AI Providers & Models
						</h2>
						<p className="text-xs text-vscode-descriptionForeground mt-1 max-w-xl">
							Add free API keys from any provider below to start coding with zero costs. Mirror VS
							automatically routes requests and recovers seamlessly if any model encounters rate limits or
							connection drops.
						</p>
					</div>

					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={onSwitchToAdvanced}
							className="text-xs border-vscode-editorGroup-border hover:bg-vscode-toolbar-hoverBackground">
							<SlidersHorizontal className="w-3.5 h-3.5 mr-1" />
							Advanced Settings
						</Button>
					</div>
				</div>
			</div>

			{/* Auto-Router Supercard */}
			<div
				className={cn(
					"rounded-xl border transition-all p-5",
					isAutoRouterActive
						? "bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border-amber-500/50 shadow-md ring-1 ring-amber-500/20"
						: "bg-vscode-editor-background border-vscode-editorGroup-border/60 hover:border-amber-500/30",
				)}>
				<div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
					<div className="flex items-start gap-3.5">
						<div className="p-2.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
							<Zap className="w-5 h-5" />
						</div>
						<div>
							<div className="flex items-center gap-2">
								<h3 className="text-sm font-bold text-vscode-foreground m-0">
									⚡ Free Models Auto-Router (Recommended)
								</h3>
								{isAutoRouterActive ? (
									<span className="px-2 py-0.5 text-[10px] font-semibold bg-amber-500/20 text-amber-300 rounded border border-amber-500/40 flex items-center gap-1">
										<Check className="w-3 h-3" /> Active Mode
									</span>
								) : (
									<span className="px-2 py-0.5 text-[10px] font-medium bg-vscode-badge-background text-vscode-badge-foreground rounded">
										Multi-Provider Failover
									</span>
								)}
							</div>
							<p className="text-xs text-vscode-descriptionForeground mt-1 max-w-xl">
								Automatically routes across all your configured free providers (Groq, Cerebras, NVIDIA,
								Gemini, SambaNova, and OpenRouter). If a free model gets rate-limited or hangs, it
								instantly failovers to the next available model without interrupting your task.
							</p>
							<div className="flex flex-wrap items-center gap-2 mt-2 text-[11px] text-vscode-descriptionForeground">
								<span className="flex items-center gap-1">
									<ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
									{configuredKeysCount > 0
										? `${configuredKeysCount} custom provider keys connected`
										: "Using OpenRouter 100% free models pool"}
								</span>
								<span>•</span>
								<span>Watchdog: 25s timeout auto-recovery</span>
							</div>
						</div>
					</div>

					<div className="shrink-0 flex items-center gap-2">
						<Button
							variant={isAutoRouterActive ? "primary" : "secondary"}
							size="sm"
							onClick={handleActivateAutoRouter}
							disabled={isAutoRouterActive}
							className={cn(
								"font-medium",
								isAutoRouterActive
									? "bg-amber-500 text-black hover:bg-amber-400 font-semibold"
									: "hover:border-amber-500/50",
							)}>
							{isAutoRouterActive ? (
								<>
									<Check className="w-3.5 h-3.5 mr-1" />
									Active Auto-Router
								</>
							) : (
								<>
									<Zap className="w-3.5 h-3.5 mr-1" />
									Start Using Auto-Router
								</>
							)}
						</Button>
					</div>
				</div>
			</div>

			{/* Section Header */}
			<div className="flex items-center justify-between border-b border-vscode-editorGroup-border/60 pb-2">
				<h3 className="text-sm font-semibold text-vscode-foreground m-0 flex items-center gap-2">
					<span>Free-Tier Providers & API Keys</span>
					<span className="text-xs font-normal text-vscode-descriptionForeground">
						(Paste your free API key and click "Start Using")
					</span>
				</h3>
			</div>

			{/* Free Providers Cards List */}
			<div className="grid grid-cols-1 gap-4">
				{FREE_PROVIDERS_CONFIG.map((provider) => {
					const isCurrent = currentProvider === provider.id
					const keyField = provider.keyField
					const currentKeyVal = keyField ? (apiConfig[keyField] as string) || "" : ""
					const isKeyConfigured = !!currentKeyVal.trim()
					const isVisible = visibleKeys[provider.id] || false

					return (
						<div
							key={provider.id}
							className={cn(
								"rounded-lg border p-4.5 transition-all bg-vscode-editor-background",
								isCurrent
									? "border-mirror-brand-via/60 ring-1 ring-mirror-brand-via/20 bg-mirror-brand-via/5"
									: "border-vscode-editorGroup-border/70 hover:border-vscode-editorGroup-border",
							)}>
							<div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
								<div className="flex items-start gap-3">
									<div className="p-2 rounded-md bg-vscode-input-background border border-vscode-editorGroup-border/60 shrink-0">
										{provider.icon}
									</div>
									<div>
										<div className="flex items-center gap-2">
											<h4 className="text-sm font-semibold text-vscode-foreground m-0">
												{provider.name}
											</h4>
											<span className="px-2 py-0.2 text-[10px] font-medium bg-emerald-500/15 text-emerald-300 rounded border border-emerald-500/30">
												{provider.badge}
											</span>
											{isKeyConfigured && (
												<span className="px-1.5 py-0.2 text-[10px] font-medium bg-blue-500/15 text-blue-300 rounded flex items-center gap-1">
													<Check className="w-2.5 h-2.5" /> Key Connected
												</span>
											)}
										</div>
										<p className="text-xs text-vscode-descriptionForeground mt-1">
											{provider.description}
										</p>
									</div>
								</div>

								<div className="flex items-center gap-2 shrink-0">
									{provider.keyUrl && (
										<a
											href={provider.keyUrl}
											target="_blank"
											rel="noopener noreferrer"
											className="inline-flex items-center gap-1 text-xs text-vscode-textLink-foreground hover:underline px-2 py-1 rounded hover:bg-vscode-toolbar-hoverBackground transition-colors">
											<span>{provider.keyLabel || "Get Free Key"}</span>
											<ExternalLink className="w-3 h-3" />
										</a>
									)}

									<Button
										variant={isCurrent ? "primary" : "secondary"}
										size="sm"
										onClick={() => handleActivateProvider(provider.id, provider.defaultModel)}
										className={cn(
											"text-xs font-medium h-7 px-3",
											isCurrent && "font-semibold shadow-xs",
										)}>
										{isCurrent ? (
											<>
												<Check className="w-3.5 h-3.5 mr-1" />
												Active
											</>
										) : (
											<>
												Start Using {provider.name}
												<ArrowRight className="w-3 h-3 ml-1" />
											</>
										)}
									</Button>
								</div>
							</div>

							{/* API Key Input & Model Selector */}
							{keyField && (
								<div className="mt-3.5 pt-3.5 border-t border-vscode-editorGroup-border/40 grid grid-cols-1 md:grid-cols-2 gap-3">
									<div>
										<label className="block text-xs font-medium text-vscode-foreground mb-1">
											{provider.name} API Key
										</label>
										<div className="relative flex items-center">
											<VSCodeTextField
												type={isVisible ? "text" : "password"}
												value={currentKeyVal}
												onInput={(e: any) => {
													const val = e.target.value
													setApiConfigurationField(keyField, val)
												}}
												placeholder={`Paste your ${provider.name} API key...`}
												className="w-full text-xs"
											/>
											<button
												type="button"
												onClick={() => toggleKeyVisibility(provider.id)}
												className="absolute right-2 text-vscode-descriptionForeground hover:text-vscode-foreground p-1 border-none bg-transparent cursor-pointer">
												{isVisible ? (
													<EyeOff className="w-3.5 h-3.5" />
												) : (
													<Eye className="w-3.5 h-3.5" />
												)}
											</button>
										</div>
									</div>

									<div>
										<label className="block text-xs font-medium text-vscode-foreground mb-1">
											Selected Model
										</label>
										<select
											value={
												isCurrent
													? apiConfig.apiModelId || provider.defaultModel
													: provider.defaultModel
											}
											onChange={(e) => {
												if (isCurrent) {
													setApiConfigurationField("apiModelId", e.target.value)
												}
											}}
											disabled={!isCurrent}
											className="w-full h-7 bg-vscode-dropdown-background text-vscode-dropdown-foreground border border-vscode-dropdown-border rounded px-2 text-xs focus:outline-none focus:ring-1 focus:ring-vscode-focusBorder cursor-pointer disabled:opacity-60">
											{provider.models.map((m) => (
												<option key={m.id} value={m.id}>
													{m.label} {m.tag ? `(${m.tag})` : ""}
												</option>
											))}
										</select>
									</div>
								</div>
							)}
						</div>
					)
				})}
			</div>
		</div>
	)
}

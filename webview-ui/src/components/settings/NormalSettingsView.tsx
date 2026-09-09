import React, { useState, useMemo, useCallback } from "react"
import {
	Shield,
	ShieldCheck,
	Zap,
	ExternalLink,
	Eye,
	EyeOff,
	SlidersHorizontal,
	Bot,
	History,
	GitBranch,
	Volume2,
	Languages,
	Check,
	Sparkles,
	HelpCircle,
	ChevronRight,
} from "lucide-react"

import {
	type ProviderName,
	type ProviderSettings,
	type ExperimentId,
	openRouterDefaultModelId,
	anthropicDefaultModelId,
	openAiNativeDefaultModelId,
	geminiDefaultModelId,
	deepSeekDefaultModelId,
	customDefaultModelId,
	Language,
} from "@mirror-vs/types"
import { LANGUAGES } from "@shared/language"

import { ExtensionStateContextType } from "@src/context/ExtensionStateContext"
import { cn } from "@src/lib/utils"
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@src/components/ui"
import { VSCodeCheckbox, VSCodeDropdown, VSCodeOption, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
import { SetCachedStateField, SetExperimentEnabled } from "./types"

interface NormalSettingsViewProps {
	cachedState: ExtensionStateContextType
	setCachedStateField: SetCachedStateField<keyof ExtensionStateContextType>
	setApiConfigurationField: <K extends keyof ProviderSettings>(
		field: K,
		value: ProviderSettings[K],
		isUserAction?: boolean,
	) => void
	setExperimentEnabled: SetExperimentEnabled
	onSwitchToAdvanced: () => void
}

interface CuratedProvider {
	id: ProviderName
	name: string
	badge?: string
	description: string
	keyUrl?: string
	keyLabel?: string
	defaultModel: string
	models: Array<{ id: string; label: string; tag?: string }>
}

const CURATED_PROVIDERS: CuratedProvider[] = [
	{
		id: "openrouter",
		name: "OpenRouter",
		badge: "Recommended",
		description: "One unified API key for Claude 3.7, DeepSeek R1, GPT-4o, and hundreds more.",
		keyUrl: "https://openrouter.ai/keys",
		keyLabel: "Get OpenRouter Key",
		defaultModel: "anthropic/claude-sonnet-4.5",
		models: [
			{ id: "anthropic/claude-sonnet-4.5", label: "Claude 3.7 Sonnet", tag: "Recommended" },
			{ id: "deepseek/deepseek-r1", label: "DeepSeek R1 (Reasoning)", tag: "Popular" },
			{ id: "openai/gpt-4o", label: "OpenAI GPT-4o" },
			{ id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
		],
	},
	{
		id: "anthropic",
		name: "Anthropic Claude",
		description: "Direct access to Anthropic's official Claude models.",
		keyUrl: "https://console.anthropic.com/settings/keys",
		keyLabel: "Get Anthropic Key",
		defaultModel: "claude-3-7-sonnet-20250219",
		models: [
			{ id: "claude-3-7-sonnet-20250219", label: "Claude 3.7 Sonnet", tag: "Recommended" },
			{ id: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku (Fast)" },
		],
	},
	{
		id: "openai-native",
		name: "OpenAI",
		description: "Direct access to OpenAI GPT and Reasoning models.",
		keyUrl: "https://platform.openai.com/api-keys",
		keyLabel: "Get OpenAI Key",
		defaultModel: "gpt-4o",
		models: [
			{ id: "gpt-4o", label: "GPT-4o", tag: "Recommended" },
			{ id: "o3-mini", label: "o3-mini (Reasoning)" },
			{ id: "gpt-4o-mini", label: "GPT-4o Mini (Fast & Cheap)" },
		],
	},
	{
		id: "gemini",
		name: "Google Gemini",
		description: "Google's latest Gemini 2.5 Pro and Flash multimodal models.",
		keyUrl: "https://aistudio.google.com/app/apikey",
		keyLabel: "Get Gemini Key",
		defaultModel: "gemini-2.5-pro",
		models: [
			{ id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", tag: "Recommended" },
			{ id: "gemini-2.0-flash", label: "Gemini 2.0 Flash (Fast)" },
		],
	},
	{
		id: "deepseek",
		name: "DeepSeek",
		description: "High-intelligence open-weights models with exceptional coding ability.",
		keyUrl: "https://platform.deepseek.com/api_keys",
		keyLabel: "Get DeepSeek Key",
		defaultModel: "deepseek-chat",
		models: [
			{ id: "deepseek-chat", label: "DeepSeek V3 (Chat & Code)", tag: "Recommended" },
			{ id: "deepseek-reasoner", label: "DeepSeek R1 (Thinking)" },
		],
	},
	{
		id: "ollama",
		name: "Ollama (Local AI)",
		badge: "Free & Offline",
		description: "Run models locally on your machine with 0 API fees and full privacy.",
		defaultModel: "qwen2.5-coder:latest",
		models: [
			{ id: "qwen2.5-coder:latest", label: "Qwen 2.5 Coder", tag: "Recommended" },
			{ id: "deepseek-r1:latest", label: "DeepSeek R1 Local" },
			{ id: "llama3.2:latest", label: "Llama 3.2" },
		],
	},
	{
		id: "custom",
		name: "Custom API",
		badge: "OpenAI-Compatible",
		description: "Connect to any custom OpenAI-compatible API, proxy, or local server.",
		defaultModel: customDefaultModelId || "gpt-4o",
		models: [],
	},
]

export const NormalSettingsView: React.FC<NormalSettingsViewProps> = ({
	cachedState,
	setCachedStateField,
	setApiConfigurationField,
	setExperimentEnabled,
	onSwitchToAdvanced,
}) => {
	const [showApiKey, setShowApiKey] = useState(false)

	const apiConfig = cachedState.apiConfiguration ?? {}
	const currentProvider = (apiConfig.apiProvider || "openrouter") as ProviderName

	// Match active provider against curated list, or provide fallback
	const activeProviderConfig = useMemo(() => {
		const found = CURATED_PROVIDERS.find((p) => p.id === currentProvider)
		if (found) return found

		// If user configured a provider not in the top 6 (e.g. bedrock, mistral), preserve it nicely
		return {
			id: currentProvider,
			name: String(currentProvider).toUpperCase(),
			description: "Configured provider",
			defaultModel: "",
			models: [],
		}
	}, [currentProvider])

	// Current API key resolution
	const currentApiKey = useMemo(() => {
		switch (currentProvider) {
			case "openrouter":
			case "anthropic":
				return apiConfig.apiKey || ""
			case "openai-native":
				return apiConfig.openAiNativeApiKey || ""
			case "gemini":
				return apiConfig.geminiApiKey || ""
			case "deepseek":
				return apiConfig.deepSeekApiKey || ""
			case "custom":
				return apiConfig.customApiKey || ""
			default:
				return apiConfig.apiKey || (apiConfig as any)[`${currentProvider}ApiKey`] || ""
		}
	}, [currentProvider, apiConfig])

	const handleApiKeyChange = useCallback(
		(newKey: string) => {
			switch (currentProvider) {
				case "openrouter":
				case "anthropic":
					setApiConfigurationField("apiKey", newKey)
					break
				case "openai-native":
					setApiConfigurationField("openAiNativeApiKey", newKey)
					break
				case "gemini":
					setApiConfigurationField("geminiApiKey", newKey)
					break
				case "deepseek":
					setApiConfigurationField("deepSeekApiKey", newKey)
					break
				case "custom":
					setApiConfigurationField("customApiKey", newKey)
					break
				default:
					setApiConfigurationField("apiKey", newKey)
					break
			}
		},
		[currentProvider, setApiConfigurationField],
	)

	// Current Model ID resolution
	const currentModelId = useMemo(() => {
		switch (currentProvider) {
			case "openrouter":
				return apiConfig.openRouterModelId || activeProviderConfig.defaultModel
			case "ollama":
				return apiConfig.ollamaModelId || "qwen2.5-coder:latest"
			case "custom":
				return apiConfig.customModelId || activeProviderConfig.defaultModel || "gpt-4o"
			default:
				return (apiConfig.apiModelId as string) || activeProviderConfig.defaultModel
		}
	}, [currentProvider, apiConfig, activeProviderConfig.defaultModel])

	const handleModelSelect = useCallback(
		(modelId: string) => {
			switch (currentProvider) {
				case "openrouter":
					setApiConfigurationField("openRouterModelId", modelId)
					break
				case "ollama":
					setApiConfigurationField("ollamaModelId", modelId)
					break
				case "custom":
					setApiConfigurationField("customModelId", modelId)
					break
				default:
					setApiConfigurationField("apiModelId", modelId)
					break
			}
		},
		[currentProvider, setApiConfigurationField],
	)

	const handleProviderChange = useCallback(
		(newProvider: ProviderName) => {
			setApiConfigurationField("apiProvider", newProvider)
			const config = CURATED_PROVIDERS.find((p) => p.id === newProvider)
			if (config?.defaultModel) {
				if (newProvider === "openrouter") {
					setApiConfigurationField("openRouterModelId", config.defaultModel)
				} else if (newProvider === "ollama") {
					setApiConfigurationField("ollamaModelId", config.defaultModel)
					if (!apiConfig.ollamaBaseUrl) {
						setApiConfigurationField("ollamaBaseUrl", "http://localhost:11434")
					}
				} else if (newProvider === "custom") {
					setApiConfigurationField("customModelId", config.defaultModel)
				} else {
					setApiConfigurationField("apiModelId", config.defaultModel)
				}
			}
		},
		[setApiConfigurationField, apiConfig.ollamaBaseUrl],
	)

	// Determine active safety preset
	const currentPreset = useMemo<"safe" | "balanced" | "autonomous" | "custom">(() => {
		const { alwaysAllowReadOnly, alwaysAllowWrite, alwaysAllowExecute, autonomousMode } = cachedState
		if (alwaysAllowReadOnly && alwaysAllowWrite && alwaysAllowExecute && autonomousMode) {
			return "autonomous"
		}
		if (alwaysAllowReadOnly && alwaysAllowWrite && !alwaysAllowExecute && !autonomousMode) {
			return "balanced"
		}
		if (alwaysAllowReadOnly && !alwaysAllowWrite && !alwaysAllowExecute && !autonomousMode) {
			return "safe"
		}
		return "custom"
	}, [cachedState])

	const applySafetyPreset = useCallback(
		(preset: "safe" | "balanced" | "autonomous") => {
			if (preset === "safe") {
				setCachedStateField("alwaysAllowReadOnly", true)
				setCachedStateField("alwaysAllowWrite", false)
				setCachedStateField("alwaysAllowExecute", false)
				setCachedStateField("autonomousMode", false)
			} else if (preset === "balanced") {
				setCachedStateField("alwaysAllowReadOnly", true)
				setCachedStateField("alwaysAllowWrite", true)
				setCachedStateField("alwaysAllowExecute", false)
				setCachedStateField("autonomousMode", false)
			} else if (preset === "autonomous") {
				setCachedStateField("alwaysAllowReadOnly", true)
				setCachedStateField("alwaysAllowWrite", true)
				setCachedStateField("alwaysAllowExecute", true)
				setCachedStateField("autonomousMode", true)
			}
		},
		[setCachedStateField],
	)

	return (
		<div className="space-y-6 max-w-2xl mx-auto pb-8">
			{/* Normal Mode Banner */}
			<div className="p-3.5 rounded-lg bg-vscode-sideBar-background/60 border border-vscode-editorGroup-border/60 flex items-center justify-between gap-3 shadow-sm">
				<div className="flex items-center gap-2.5">
					<div className="w-8 h-8 rounded-md bg-mirror-brand-via/15 flex items-center justify-center text-mirror-brand-via shrink-0">
						<Sparkles className="w-4 h-4" />
					</div>
					<div>
						<div className="text-xs font-semibold text-vscode-foreground flex items-center gap-1.5">
							Normal Setup Mode
							<span className="text-[10px] px-1.5 py-0.2 rounded-full bg-mirror-brand-via/20 text-mirror-brand-via font-mono">
								Streamlined
							</span>
						</div>
						<div className="text-[11px] text-vscode-descriptionForeground">
							Clean essentials with recommended safety and behavior defaults.
						</div>
					</div>
				</div>
				<Button
					variant="secondary"
					size="sm"
					className="h-7 text-xs px-2.5 shrink-0 gap-1"
					onClick={onSwitchToAdvanced}>
					<SlidersHorizontal className="w-3 h-3" />
					Advanced Mode
				</Button>
			</div>

			{/* Section 1: AI Provider & Model */}
			<div className="space-y-3 p-4 rounded-lg bg-vscode-sideBar-background/40 border border-vscode-editorGroup-border/50">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<Bot className="w-4 h-4 text-mirror-brand-via" />
						<h4 className="text-sm font-semibold m-0 text-vscode-foreground">AI Provider & Model</h4>
					</div>
					{activeProviderConfig.keyUrl && (
						<a
							href={activeProviderConfig.keyUrl}
							target="_blank"
							rel="noreferrer"
							className="text-[11px] text-mirror-brand-via hover:underline flex items-center gap-1">
							{activeProviderConfig.keyLabel}
							<ExternalLink className="w-3 h-3" />
						</a>
					)}
				</div>

				{/* Curated Provider Selector */}
				<div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
					{CURATED_PROVIDERS.map((provider) => {
						const isSelected = currentProvider === provider.id
						return (
							<button
								key={provider.id}
								type="button"
								onClick={() => handleProviderChange(provider.id)}
								className={cn(
									"flex flex-col items-start p-2.5 rounded-md border text-left transition-all cursor-pointer relative",
									isSelected
										? "border-mirror-brand-via bg-mirror-brand-via/10 shadow-[0_0_0_1px_rgba(var(--mirror-brand-via-rgb),0.3)]"
										: "border-vscode-editorGroup-border/40 bg-vscode-input-background/40 hover:bg-vscode-list-hoverBackground/60 opacity-80 hover:opacity-100",
								)}>
								<div className="flex items-center justify-between w-full">
									<span className="text-xs font-semibold text-vscode-foreground">
										{provider.name}
									</span>
									{isSelected && <Check className="w-3.5 h-3.5 text-mirror-brand-via" />}
								</div>
								{provider.badge && (
									<span className="text-[9px] mt-1 px-1 rounded bg-mirror-brand-via/20 text-mirror-brand-via">
										{provider.badge}
									</span>
								)}
							</button>
						)
					})}
				</div>

				{/* Provider Specific Input (API Key or Local URL) */}
				{currentProvider === "ollama" ? (
					<div className="space-y-2 pt-2">
						<label className="block text-xs font-medium text-vscode-foreground">Ollama Base URL</label>
						<VSCodeTextField
							value={apiConfig.ollamaBaseUrl || "http://localhost:11434"}
							onInput={(e: any) => setApiConfigurationField("ollamaBaseUrl", e.target.value)}
							placeholder="http://localhost:11434"
							className="w-full"
						/>
						<p className="text-[11px] text-vscode-descriptionForeground">
							Make sure Ollama is running locally on your machine (
							<code className="text-[10px]">ollama serve</code>).
						</p>
					</div>
				) : currentProvider === "custom" ? (
					<div className="space-y-3 pt-2">
						<div className="space-y-1.5">
							<label className="block text-xs font-medium text-vscode-foreground">
								Custom API Base URL
							</label>
							<VSCodeTextField
								value={apiConfig.customBaseUrl || ""}
								onInput={(e: any) => setApiConfigurationField("customBaseUrl", e.target.value)}
								placeholder="https://api.example.com/v1"
								className="w-full"
							/>
							<p className="text-[11px] text-vscode-descriptionForeground">
								OpenAI-compatible base URL (e.g.{" "}
								<code className="text-[10px]">http://localhost:8000/v1</code> or{" "}
								<code className="text-[10px]">https://api.together.xyz/v1</code>).
							</p>
						</div>
						<div className="space-y-1.5">
							<div className="flex items-center justify-between">
								<label className="block text-xs font-medium text-vscode-foreground">API Key</label>
								<button
									type="button"
									onClick={() => setShowApiKey(!showApiKey)}
									className="text-[11px] text-vscode-descriptionForeground hover:text-vscode-foreground flex items-center gap-1 bg-transparent border-none cursor-pointer">
									{showApiKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
									{showApiKey ? "Hide" : "Show"}
								</button>
							</div>
							<VSCodeTextField
								value={currentApiKey}
								type={showApiKey ? "text" : "password"}
								onInput={(e: any) => handleApiKeyChange(e.target.value)}
								placeholder="Optional or your custom API key..."
								className="w-full"
							/>
							<p className="text-[11px] text-vscode-descriptionForeground">
								Leave blank if your local server does not require authentication.
							</p>
						</div>
					</div>
				) : (
					<div className="space-y-1.5 pt-2">
						<div className="flex items-center justify-between">
							<label className="block text-xs font-medium text-vscode-foreground">
								{activeProviderConfig.name} API Key
							</label>
							<button
								type="button"
								onClick={() => setShowApiKey(!showApiKey)}
								className="text-[11px] text-vscode-descriptionForeground hover:text-vscode-foreground flex items-center gap-1 bg-transparent border-none cursor-pointer">
								{showApiKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
								{showApiKey ? "Hide" : "Show"}
							</button>
						</div>
						<VSCodeTextField
							value={currentApiKey}
							type={showApiKey ? "text" : "password"}
							onInput={(e: any) => handleApiKeyChange(e.target.value)}
							placeholder="Paste your API key here..."
							className="w-full"
						/>
						<p className="text-[11px] text-vscode-descriptionForeground">
							Your API key is securely encrypted and saved only on your local device.
						</p>
					</div>
				)}

				{/* Model Selector */}
				<div className="space-y-1.5 pt-2">
					<label className="block text-xs font-medium text-vscode-foreground">Selected Model</label>
					{activeProviderConfig.models.length > 0 ? (
						<div className="space-y-1.5">
							<Select value={currentModelId} onValueChange={handleModelSelect}>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Select a model" />
								</SelectTrigger>
								<SelectContent>
									{activeProviderConfig.models.map((m) => (
										<SelectItem key={m.id} value={m.id}>
											<div className="flex items-center justify-between w-full gap-2">
												<span>{m.label}</span>
												{m.tag && (
													<span className="text-[10px] px-1 rounded bg-mirror-brand-via/20 text-mirror-brand-via ml-2">
														{m.tag}
													</span>
												)}
											</div>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					) : (
						<VSCodeTextField
							value={currentModelId}
							onInput={(e: any) => handleModelSelect(e.target.value)}
							placeholder="Enter model ID..."
							className="w-full"
						/>
					)}
				</div>
			</div>

			{/* Section 2: One-Click Safety & Permission Presets */}
			<div className="space-y-3 p-4 rounded-lg bg-vscode-sideBar-background/40 border border-vscode-editorGroup-border/50">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<ShieldCheck className="w-4 h-4 text-mirror-brand-via" />
						<h4 className="text-sm font-semibold m-0 text-vscode-foreground">Permissions & Safety</h4>
					</div>
					{currentPreset === "custom" && (
						<span className="text-[10px] px-2 py-0.5 rounded bg-vscode-badge-background text-vscode-badge-foreground">
							Customized in Advanced
						</span>
					)}
				</div>
				<p className="text-xs text-vscode-descriptionForeground mt-0">
					Select how autonomous Mirror should be when reading code, creating files, or executing terminal
					commands.
				</p>

				<div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
					{/* Safe Preset */}
					<button
						type="button"
						onClick={() => applySafetyPreset("safe")}
						className={cn(
							"flex flex-col p-3 rounded-lg border text-left transition-all cursor-pointer relative",
							currentPreset === "safe"
								? "border-emerald-500/80 bg-emerald-500/10 shadow-[0_0_0_1px_rgba(16,185,129,0.3)]"
								: "border-vscode-editorGroup-border/40 bg-vscode-input-background/40 hover:bg-vscode-list-hoverBackground/60 opacity-80 hover:opacity-100",
						)}>
						<div className="flex items-center justify-between w-full">
							<div className="flex items-center gap-1.5 font-semibold text-xs text-vscode-foreground">
								<Shield className="w-3.5 h-3.5 text-emerald-400" />
								Safe
							</div>
							{currentPreset === "safe" && <Check className="w-3.5 h-3.5 text-emerald-400" />}
						</div>
						<div className="text-[9px] mt-1 text-emerald-400 font-medium">Recommended for beginners</div>
						<div className="text-[11px] text-vscode-descriptionForeground mt-1.5 leading-snug">
							Auto-reads files. Always asks your confirmation before editing files or running terminal
							commands.
						</div>
					</button>

					{/* Balanced Preset */}
					<button
						type="button"
						onClick={() => applySafetyPreset("balanced")}
						className={cn(
							"flex flex-col p-3 rounded-lg border text-left transition-all cursor-pointer relative",
							currentPreset === "balanced"
								? "border-mirror-brand-via bg-mirror-brand-via/10 shadow-[0_0_0_1px_rgba(var(--mirror-brand-via-rgb),0.3)]"
								: "border-vscode-editorGroup-border/40 bg-vscode-input-background/40 hover:bg-vscode-list-hoverBackground/60 opacity-80 hover:opacity-100",
						)}>
						<div className="flex items-center justify-between w-full">
							<div className="flex items-center gap-1.5 font-semibold text-xs text-vscode-foreground">
								<Zap className="w-3.5 h-3.5 text-mirror-brand-via" />
								Balanced
							</div>
							{currentPreset === "balanced" && <Check className="w-3.5 h-3.5 text-mirror-brand-via" />}
						</div>
						<div className="text-[9px] mt-1 text-mirror-brand-via font-medium">Fast & Practical</div>
						<div className="text-[11px] text-vscode-descriptionForeground mt-1.5 leading-snug">
							Auto-edits code files directly. Always asks your confirmation before executing any shell
							commands.
						</div>
					</button>

					{/* Autonomous Preset */}
					<button
						type="button"
						onClick={() => applySafetyPreset("autonomous")}
						className={cn(
							"flex flex-col p-3 rounded-lg border text-left transition-all cursor-pointer relative",
							currentPreset === "autonomous"
								? "border-amber-500/80 bg-amber-500/10 shadow-[0_0_0_1px_rgba(245,158,11,0.3)]"
								: "border-vscode-editorGroup-border/40 bg-vscode-input-background/40 hover:bg-vscode-list-hoverBackground/60 opacity-80 hover:opacity-100",
						)}>
						<div className="flex items-center justify-between w-full">
							<div className="flex items-center gap-1.5 font-semibold text-xs text-vscode-foreground">
								<Zap className="w-3.5 h-3.5 text-amber-400" />
								Autonomous
							</div>
							{currentPreset === "autonomous" && <Check className="w-3.5 h-3.5 text-amber-400" />}
						</div>
						<div className="text-[9px] mt-1 text-amber-400 font-medium">Full Hands-Free</div>
						<div className="text-[11px] text-vscode-descriptionForeground mt-1.5 leading-snug">
							Maximum speed. Mirror reads, writes, and executes commands without pausing for prompts.
						</div>
					</button>
				</div>
			</div>

			{/* Section 3: Smart Behavior & Automation Defaults */}
			<div className="space-y-3 p-4 rounded-lg bg-vscode-sideBar-background/40 border border-vscode-editorGroup-border/50">
				<div className="flex items-center gap-2">
					<Sparkles className="w-4 h-4 text-mirror-brand-via" />
					<h4 className="text-sm font-semibold m-0 text-vscode-foreground">Smart Automation & Safeguards</h4>
				</div>

				<div className="space-y-3 pt-1">
					{/* Git Checkpoints */}
					<div className="flex items-start justify-between gap-3">
						<div className="space-y-0.5">
							<div className="text-xs font-semibold text-vscode-foreground flex items-center gap-1.5">
								<History className="w-3.5 h-3.5 text-vscode-descriptionForeground" />
								Automatic Git Checkpoints
							</div>
							<p className="text-[11px] text-vscode-descriptionForeground leading-snug m-0">
								Automatically saves checkpoint snapshots before making code edits so you can revert any
								change instantly.
							</p>
						</div>
						<VSCodeCheckbox
							checked={cachedState.enableCheckpoints ?? true}
							onChange={(e: any) => setCachedStateField("enableCheckpoints", e.target.checked)}
						/>
					</div>

					{/* Context Condensing */}
					<div className="flex items-start justify-between gap-3 border-t border-vscode-editorGroup-border/30 pt-3">
						<div className="space-y-0.5">
							<div className="text-xs font-semibold text-vscode-foreground flex items-center gap-1.5">
								<Zap className="w-3.5 h-3.5 text-vscode-descriptionForeground" />
								Auto Context Condensing
							</div>
							<p className="text-[11px] text-vscode-descriptionForeground leading-snug m-0">
								Intelligently compresses long conversation history at 75% capacity to prevent token
								limit errors and save costs.
							</p>
						</div>
						<VSCodeCheckbox
							checked={cachedState.autoCondenseContext ?? true}
							onChange={(e: any) => setCachedStateField("autoCondenseContext", e.target.checked)}
						/>
					</div>

					{/* Sound Alerts */}
					<div className="flex items-start justify-between gap-3 border-t border-vscode-editorGroup-border/30 pt-3">
						<div className="space-y-0.5">
							<div className="text-xs font-semibold text-vscode-foreground flex items-center gap-1.5">
								<Volume2 className="w-3.5 h-3.5 text-vscode-descriptionForeground" />
								Sound Notifications
							</div>
							<p className="text-[11px] text-vscode-descriptionForeground leading-snug m-0">
								Play audio cues when long-running tasks complete or require your input.
							</p>
						</div>
						<VSCodeCheckbox
							checked={cachedState.soundEnabled ?? true}
							onChange={(e: any) => setCachedStateField("soundEnabled", e.target.checked)}
						/>
					</div>
				</div>
			</div>

			{/* Section 4: General Appearance & Language */}
			<div className="space-y-3 p-4 rounded-lg bg-vscode-sideBar-background/40 border border-vscode-editorGroup-border/50">
				<div className="flex items-center gap-2">
					<Languages className="w-4 h-4 text-mirror-brand-via" />
					<h4 className="text-sm font-semibold m-0 text-vscode-foreground">Appearance & Language</h4>
				</div>

				<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
					{/* Language */}
					<div className="space-y-1">
						<label className="block text-xs font-medium text-vscode-foreground">Interface Language</label>
						<Select
							value={cachedState.language || "en"}
							onValueChange={(value) => setCachedStateField("language", value as Language)}>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="Select language" />
							</SelectTrigger>
							<SelectContent>
								{Object.entries(LANGUAGES).map(([code, name]) => (
									<SelectItem key={code} value={code}>
										{name} <span className="text-muted-foreground text-[10px]">({code})</span>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* Mascot Theme */}
					<div className="space-y-1">
						<label className="block text-xs font-medium text-vscode-foreground">Mascot Theme</label>
						<VSCodeDropdown
							value={cachedState.mascotTheme || "cyberpunk"}
							onChange={(e: any) => setCachedStateField("mascotTheme", e.target.value)}
							className="w-full">
							<VSCodeOption value="cyberpunk">Cyberpunk Neon</VSCodeOption>
							<VSCodeOption value="retro">Retro Monochrome</VSCodeOption>
							<VSCodeOption value="synthwave">Synthwave Sunset</VSCodeOption>
							<VSCodeOption value="solar">Solar Flare</VSCodeOption>
						</VSCodeDropdown>
					</div>
				</div>
			</div>

			{/* Section 5: Need Deeper Control? Callout */}
			<div className="p-4 rounded-lg border border-dashed border-vscode-editorGroup-border/80 bg-vscode-sideBar-background/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
				<div className="space-y-1">
					<div className="text-xs font-semibold text-vscode-foreground flex items-center gap-1.5">
						<SlidersHorizontal className="w-3.5 h-3.5 text-mirror-brand-via" />
						Need Advanced Settings?
					</div>
					<p className="text-[11px] text-vscode-descriptionForeground m-0 max-w-md leading-relaxed">
						Switch to Advanced Mode to configure MCP servers, custom prompts, slash commands, custom
						terminal integration, image generation pipelines, and all 20+ LLM providers.
					</p>
				</div>
				<Button
					variant="secondary"
					size="sm"
					className="h-8 text-xs shrink-0 gap-1.5 font-medium"
					onClick={onSwitchToAdvanced}>
					Open Advanced Settings
					<ChevronRight className="w-3.5 h-3.5" />
				</Button>
			</div>
		</div>
	)
}

export default NormalSettingsView

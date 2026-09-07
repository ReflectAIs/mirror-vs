import { useCallback, useState, useMemo } from "react"
import { Trans } from "react-i18next"
import {
	ArrowLeft,
	Brain,
	Sparkles,
	Zap,
	SlidersHorizontal,
	Check,
	ExternalLink,
	Eye,
	EyeOff,
	ShieldCheck,
	History,
} from "lucide-react"

import {
	openRouterDefaultModelId,
	customDefaultModelId,
	type ProviderName,
	type ProviderSettings,
} from "@mirror-vs/types"

import { useExtensionState } from "@src/context/ExtensionStateContext"
import { validateApiConfiguration } from "@src/utils/validate"
import { vscode } from "@src/utils/vscode"
import { useAppTranslation } from "@src/i18n/TranslationContext"
import { Button } from "@src/components/ui"
import { cn } from "@src/lib/utils"
import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react"

import ApiOptions from "../settings/ApiOptions"
import { Tab, TabContent } from "../common/Tab"

import WelcomeMascot from "./WelcomeMascot"
import MirrorTips from "./MirrorTips"
import WelcomeStepIndicator from "./WelcomeStepIndicator"

const ONBOARDING_STEPS = [
	{ id: "welcome", label: "Welcome" },
	{ id: "provider", label: "Connect Provider" },
	{ id: "complete", label: "Ready" },
]

const DEFAULT_WELCOME_API_CONFIGURATION: ProviderSettings = {
	apiProvider: "openrouter",
	openRouterModelId: openRouterDefaultModelId,
}

const getWelcomeApiConfiguration = (apiConfiguration?: ProviderSettings): ProviderSettings => {
	if (!apiConfiguration?.apiProvider) {
		return DEFAULT_WELCOME_API_CONFIGURATION
	}

	if (apiConfiguration.apiProvider === "anthropic" && !apiConfiguration.apiKey) {
		return DEFAULT_WELCOME_API_CONFIGURATION
	}

	return apiConfiguration
}

type OnboardingStep = "landing" | "provider_setup" | "complete"
type SetupMode = "normal" | "advanced"

interface CuratedWelcomeProvider {
	id: ProviderName
	name: string
	badge?: string
	description: string
	keyUrl?: string
	keyLabel?: string
	defaultModel: string
	modelKey: keyof ProviderSettings
	modelLabel: string
}

const CURATED_WELCOME_PROVIDERS: CuratedWelcomeProvider[] = [
	{
		id: "openrouter",
		name: "OpenRouter",
		badge: "Recommended",
		description: "One API key for Claude 3.7 Sonnet, DeepSeek R1, GPT-4o, and hundreds more.",
		keyUrl: "https://openrouter.ai/keys",
		keyLabel: "Get OpenRouter Key",
		defaultModel: "anthropic/claude-sonnet-4.5",
		modelKey: "openRouterModelId",
		modelLabel: "Claude 3.7 Sonnet",
	},
	{
		id: "anthropic",
		name: "Anthropic Claude",
		description: "Direct official access to Anthropic's Claude 3.7 Sonnet.",
		keyUrl: "https://console.anthropic.com/settings/keys",
		keyLabel: "Get Anthropic Key",
		defaultModel: "claude-3-7-sonnet-20250219",
		modelKey: "apiModelId",
		modelLabel: "Claude 3.7 Sonnet",
	},
	{
		id: "openai-native",
		name: "OpenAI",
		description: "Direct access to OpenAI GPT-4o and reasoning models.",
		keyUrl: "https://platform.openai.com/api-keys",
		keyLabel: "Get OpenAI Key",
		defaultModel: "gpt-4o",
		modelKey: "apiModelId",
		modelLabel: "GPT-4o",
	},
	{
		id: "gemini",
		name: "Google Gemini",
		description: "Google's Gemini 2.5 Pro and Flash multimodal models.",
		keyUrl: "https://aistudio.google.com/app/apikey",
		keyLabel: "Get Gemini Key",
		defaultModel: "gemini-2.5-pro",
		modelKey: "apiModelId",
		modelLabel: "Gemini 2.5 Pro",
	},
	{
		id: "ollama",
		name: "Ollama (Local AI)",
		badge: "Free & Offline",
		description: "Run models on your computer with complete privacy and zero API fees.",
		defaultModel: "qwen2.5-coder:latest",
		modelKey: "ollamaModelId",
		modelLabel: "Qwen 2.5 Coder",
	},
	{
		id: "custom",
		name: "Custom API",
		badge: "Compatible",
		description: "Connect to any OpenAI-compatible API, proxy, or local server.",
		defaultModel: customDefaultModelId || "gpt-4o",
		modelKey: "customModelId",
		modelLabel: "Custom Model",
	},
]

interface WelcomeViewProviderProps {
	onDone?: () => void
}

const WelcomeViewProvider = ({ onDone }: WelcomeViewProviderProps = {}) => {
	const { apiConfiguration, currentApiConfigName, setApiConfiguration, uriScheme } = useExtensionState()
	const { t } = useAppTranslation()
	const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined)
	const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>("landing")
	const [setupMode, setSetupMode] = useState<SetupMode>("normal")
	const [showApiKey, setShowApiKey] = useState(false)
	const [welcomeApiConfiguration, setWelcomeApiConfiguration] = useState<ProviderSettings>()
	const effectiveApiConfiguration = welcomeApiConfiguration ?? getWelcomeApiConfiguration(apiConfiguration)

	const currentStepIndex = useMemo(() => {
		switch (onboardingStep) {
			case "landing":
				return 0
			case "provider_setup":
				return 1
			case "complete":
				return 2
		}
	}, [onboardingStep])

	const setApiConfigurationFieldForApiOptions = useCallback(
		<K extends keyof ProviderSettings>(field: K, value: ProviderSettings[K]) => {
			setWelcomeApiConfiguration((current) => ({
				...(current ?? effectiveApiConfiguration),
				[field]: value,
			}))
			setApiConfiguration({ [field]: value })
		},
		[effectiveApiConfiguration, setApiConfiguration],
	)

	const handleGetStarted = useCallback(
		(mode: SetupMode = "normal") => {
			setSetupMode(mode)
			const initialApiConfiguration = getWelcomeApiConfiguration(apiConfiguration)
			setWelcomeApiConfiguration(initialApiConfiguration)
			setApiConfiguration(initialApiConfiguration)
			setOnboardingStep("provider_setup")
		},
		[apiConfiguration, setApiConfiguration],
	)

	const handleSelectProvider = useCallback(
		(providerId: ProviderName) => {
			const prov = CURATED_WELCOME_PROVIDERS.find((p) => p.id === providerId)
			if (!prov) return

			const updated = {
				apiProvider: providerId,
				[prov.modelKey]: prov.defaultModel,
				...(providerId === "ollama" ? { ollamaBaseUrl: "http://localhost:11434" } : {}),
				...(providerId === "custom" ? { customModelId: prov.defaultModel } : {}),
			}

			setWelcomeApiConfiguration((current) => ({
				...(current ?? effectiveApiConfiguration),
				...updated,
			}))
			setApiConfiguration(updated)
			setErrorMessage(undefined)
		},
		[effectiveApiConfiguration, setApiConfiguration],
	)

	const handleKeyChange = useCallback(
		(value: string) => {
			const prov = effectiveApiConfiguration.apiProvider
			let field: keyof ProviderSettings = "apiKey"
			if (prov === "openai-native") field = "openAiNativeApiKey"
			else if (prov === "gemini") field = "geminiApiKey"
			else if (prov === "deepseek") field = "deepSeekApiKey"
			else if (prov === "custom") field = "customApiKey"

			setWelcomeApiConfiguration((current) => ({
				...(current ?? effectiveApiConfiguration),
				[field]: value,
			}))
			setApiConfiguration({ [field]: value })
			setErrorMessage(undefined)
		},
		[effectiveApiConfiguration, setApiConfiguration],
	)

	const currentApiKey = useMemo(() => {
		const prov = effectiveApiConfiguration.apiProvider
		if (prov === "openai-native") return effectiveApiConfiguration.openAiNativeApiKey || ""
		if (prov === "gemini") return effectiveApiConfiguration.geminiApiKey || ""
		if (prov === "deepseek") return effectiveApiConfiguration.deepSeekApiKey || ""
		if (prov === "custom") return effectiveApiConfiguration.customApiKey || ""
		return effectiveApiConfiguration.apiKey || ""
	}, [effectiveApiConfiguration])

	const selectedProviderConfig = useMemo(() => {
		return (
			CURATED_WELCOME_PROVIDERS.find((p) => p.id === effectiveApiConfiguration.apiProvider) ||
			CURATED_WELCOME_PROVIDERS[0]
		)
	}, [effectiveApiConfiguration.apiProvider])

	const handleFinishSetup = useCallback(() => {
		const error = validateApiConfiguration(effectiveApiConfiguration)

		if (error) {
			setErrorMessage(error)
			return
		}

		setErrorMessage(undefined)
		vscode.postMessage({
			type: "upsertApiConfiguration",
			text: currentApiConfigName,
			apiConfiguration: effectiveApiConfiguration,
		})

		// Apply predefined settings according to setup mode
		if (setupMode === "normal") {
			vscode.postMessage({
				type: "updateSettings",
				updatedSettings: {
					settingsMode: "normal",
					alwaysAllowReadOnly: true,
					alwaysAllowWrite: false,
					alwaysAllowExecute: false,
					enableCheckpoints: true,
					autoCondenseContext: true,
					autoCondenseContextPercent: 75,
				},
			})
		} else {
			vscode.postMessage({
				type: "updateSettings",
				updatedSettings: {
					settingsMode: "advanced",
				},
			})
		}

		setOnboardingStep("complete")
	}, [effectiveApiConfiguration, currentApiConfigName, setupMode])

	const handleGoBack = useCallback(() => {
		setOnboardingStep("landing")
		setErrorMessage(undefined)
	}, [])

	const handleStartExploring = useCallback(() => {
		onDone?.()
		vscode.postMessage({ type: "switchTab", tab: "chat" })
	}, [onDone])

	if (onboardingStep === "landing") {
		return (
			<Tab>
				<TabContent className="relative flex flex-col gap-4 p-6 justify-center">
					{/* Decorative gradient line */}
					<div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-mirror-brand-via/40 to-transparent" />
					<div className="flex items-center justify-between">
						<WelcomeStepIndicator
							steps={ONBOARDING_STEPS}
							currentStep={currentStepIndex}
							className="mb-2"
						/>
						{onDone && (
							<button
								type="button"
								onClick={onDone}
								className="text-xs text-vscode-descriptionForeground hover:text-vscode-foreground bg-transparent border-none cursor-pointer py-1 px-2 rounded hover:bg-vscode-toolbar-hoverBackground transition-colors">
								Skip to Chat →
							</button>
						)}
					</div>
					<WelcomeMascot />
					<h2 className="mt-0 mb-0 text-xl text-center">{t("welcome:landing.greeting")}</h2>

					<div className="space-y-4 leading-normal text-center">
						<p className="text-base text-vscode-foreground">
							<Trans i18nKey="welcome:landing.introduction" />
						</p>
					</div>

					<MirrorTips />

					{/* Normal vs Advanced Mode choices */}
					<div className="mt-3 flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-center">
						<Button onClick={() => handleGetStarted("normal")} variant="primary" className="gap-2 h-9 px-4">
							<Zap className="size-4" />
							Normal Setup (Recommended)
						</Button>
						<Button
							onClick={() => handleGetStarted("advanced")}
							variant="secondary"
							className="gap-2 h-9 px-4">
							<SlidersHorizontal className="size-4" />
							Advanced Setup
						</Button>
					</div>

					<div className="mt-4 flex items-center justify-between text-xs text-vscode-descriptionForeground">
						<button
							onClick={() => vscode.postMessage({ type: "importSettings" })}
							className="cursor-pointer bg-transparent border-none p-0 text-vscode-descriptionForeground hover:text-vscode-foreground hover:underline">
							{t("welcome:importSettings")}
						</button>
						{onDone && (
							<button
								onClick={onDone}
								className="cursor-pointer bg-transparent border-none p-0 text-mirror-brand-via hover:underline font-medium">
								Continue with existing settings →
							</button>
						)}
					</div>
				</TabContent>
			</Tab>
		)
	}

	if (onboardingStep === "complete") {
		return (
			<Tab>
				<TabContent className="relative flex flex-col gap-4 p-6 justify-center items-center text-center">
					{/* Decorative gradient line */}
					<div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-mirror-brand-via/40 to-transparent" />
					<WelcomeStepIndicator steps={ONBOARDING_STEPS} currentStep={currentStepIndex} className="mb-2" />

					<div className="size-16 rounded-full bg-mirror-brand-via/10 flex items-center justify-center">
						<Sparkles className="size-8 text-mirror-brand-via" strokeWidth={1.5} />
					</div>

					<h2 className="mt-0 mb-0 text-xl">{t("welcome:complete.heading")}</h2>

					<p className="text-base text-vscode-foreground max-w-sm">
						<Trans i18nKey="welcome:complete.description" />
					</p>

					<div className="p-3 rounded-md bg-vscode-sideBar-background/60 border border-vscode-editorGroup-border/50 text-xs text-vscode-descriptionForeground max-w-sm text-left space-y-1">
						<div className="font-semibold text-vscode-foreground flex items-center gap-1.5">
							{setupMode === "normal" ? (
								<Zap className="size-3.5 text-mirror-brand-via" />
							) : (
								<SlidersHorizontal className="size-3.5 text-mirror-brand-via" />
							)}
							Configured in {setupMode === "normal" ? "Normal Mode" : "Advanced Mode"}
						</div>
						<div>
							{setupMode === "normal"
								? "Preconfigured with safe permissions, automatic checkpoints, and smart context condensing. You can toggle Advanced settings anytime."
								: "Configured with your custom model parameters and endpoint settings."}
						</div>
					</div>

					<div className="mt-4 flex gap-2">
						<Button onClick={handleStartExploring} variant="primary">
							{t("welcome:complete.startExploring")}
						</Button>
					</div>
				</TabContent>
			</Tab>
		)
	}

	// provider_setup step
	return (
		<Tab>
			<TabContent className="flex flex-col gap-4 p-6 justify-center relative max-w-xl mx-auto w-full">
				{/* Decorative gradient line */}
				<div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-mirror-brand-via/40 to-transparent" />
				<WelcomeStepIndicator steps={ONBOARDING_STEPS} currentStep={currentStepIndex} className="mb-2" />

				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<Brain className="size-7 text-mirror-brand-via" strokeWidth={1.5} />
						<h2 className="mt-0 mb-0 text-xl">{t("welcome:providerSignup.heading")}</h2>
					</div>

					{/* Segmented Mode Toggle Pill */}
					<div className="inline-flex p-0.5 rounded-md bg-vscode-input-background/60 border border-vscode-editorGroup-border/60 shrink-0">
						<button
							type="button"
							onClick={() => setSetupMode("normal")}
							className={cn(
								"px-2.5 py-0.5 text-xs font-medium rounded transition-all cursor-pointer flex items-center gap-1 border-none",
								setupMode === "normal"
									? "bg-mirror-brand-via/20 text-mirror-brand-via font-semibold shadow-xs"
									: "text-vscode-foreground/60 hover:text-vscode-foreground bg-transparent",
							)}>
							<Zap className="size-3" />
							Normal Setup
						</button>
						<button
							type="button"
							onClick={() => setSetupMode("advanced")}
							className={cn(
								"px-2.5 py-0.5 text-xs font-medium rounded transition-all cursor-pointer flex items-center gap-1 border-none",
								setupMode === "advanced"
									? "bg-mirror-brand-via/20 text-mirror-brand-via font-semibold shadow-xs"
									: "text-vscode-foreground/60 hover:text-vscode-foreground bg-transparent",
							)}>
							<SlidersHorizontal className="size-3" />
							Advanced
						</button>
					</div>
				</div>

				<p className="text-sm text-vscode-foreground/80 mt-0">
					<Trans i18nKey="welcome:providerSignup.chooseProvider" />
				</p>

				{setupMode === "normal" ? (
					/* Normal Setup View */
					<div className="space-y-4">
						{/* Provider Cards */}
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
							{CURATED_WELCOME_PROVIDERS.map((provider) => {
								const isSelected = effectiveApiConfiguration.apiProvider === provider.id
								return (
									<button
										key={provider.id}
										type="button"
										onClick={() => handleSelectProvider(provider.id)}
										className={cn(
											"flex flex-col items-start p-3 rounded-lg border text-left transition-all cursor-pointer relative",
											isSelected
												? "border-mirror-brand-via bg-mirror-brand-via/10 shadow-[0_0_0_1px_rgba(var(--mirror-brand-via-rgb),0.3)]"
												: "border-vscode-editorGroup-border/40 bg-vscode-input-background/40 hover:bg-vscode-list-hoverBackground/60 opacity-85 hover:opacity-100",
										)}>
										<div className="flex items-center justify-between w-full">
											<span className="text-xs font-semibold text-vscode-foreground">
												{provider.name}
											</span>
											{isSelected && <Check className="size-3.5 text-mirror-brand-via" />}
										</div>
										<p className="text-[11px] text-vscode-descriptionForeground mt-1 leading-snug">
											{provider.description}
										</p>
										{provider.badge && (
											<span className="text-[9px] mt-1.5 px-1.5 py-0.2 rounded-full bg-mirror-brand-via/20 text-mirror-brand-via font-medium">
												{provider.badge}
											</span>
										)}
									</button>
								)
							})}
						</div>

						{/* API Key or URL Input */}
						{effectiveApiConfiguration.apiProvider === "ollama" ? (
							<div className="space-y-1.5 p-3 rounded-lg bg-vscode-sideBar-background/30 border border-vscode-editorGroup-border/40">
								<label className="block text-xs font-medium text-vscode-foreground">
									Ollama Base URL
								</label>
								<VSCodeTextField
									value={effectiveApiConfiguration.ollamaBaseUrl || "http://localhost:11434"}
									onInput={(e: any) =>
										setApiConfigurationFieldForApiOptions("ollamaBaseUrl", e.target.value)
									}
									placeholder="http://localhost:11434"
									className="w-full"
								/>
								<p className="text-[11px] text-vscode-descriptionForeground mt-1">
									Make sure Ollama is installed and running locally on your computer (
									<code className="text-[10px]">
										ollama run {selectedProviderConfig.defaultModel}
									</code>
									).
								</p>
							</div>
						) : effectiveApiConfiguration.apiProvider === "custom" ? (
							<div className="space-y-3 p-3.5 rounded-lg bg-vscode-sideBar-background/30 border border-vscode-editorGroup-border/40">
								<div className="space-y-1">
									<label className="block text-xs font-medium text-vscode-foreground">
										Custom API Base URL
									</label>
									<VSCodeTextField
										value={effectiveApiConfiguration.customBaseUrl || ""}
										onInput={(e: any) =>
											setApiConfigurationFieldForApiOptions("customBaseUrl", e.target.value)
										}
										placeholder="https://api.example.com/v1"
										className="w-full"
									/>
									<p className="text-[11px] text-vscode-descriptionForeground mt-1">
										OpenAI-compatible base URL (e.g.{" "}
										<code className="text-[10px]">http://localhost:8000/v1</code> or{" "}
										<code className="text-[10px]">https://api.together.xyz/v1</code>).
									</p>
								</div>

								<div className="space-y-1">
									<div className="flex items-center justify-between">
										<label className="block text-xs font-medium text-vscode-foreground">
											API Key
										</label>
										<button
											type="button"
											onClick={() => setShowApiKey(!showApiKey)}
											className="text-[11px] text-vscode-descriptionForeground hover:text-vscode-foreground flex items-center gap-1 bg-transparent border-none cursor-pointer">
											{showApiKey ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
											{showApiKey ? "Hide" : "Show"}
										</button>
									</div>
									<VSCodeTextField
										value={currentApiKey}
										type={showApiKey ? "text" : "password"}
										onInput={(e: any) => handleKeyChange(e.target.value)}
										placeholder="Optional or your custom API key..."
										className="w-full"
									/>
									<p className="text-[11px] text-vscode-descriptionForeground mt-1">
										Leave blank if your local server does not require authentication.
									</p>
								</div>

								<div className="space-y-1">
									<label className="block text-xs font-medium text-vscode-foreground">Model ID</label>
									<VSCodeTextField
										value={effectiveApiConfiguration.customModelId || "gpt-4o"}
										onInput={(e: any) =>
											setApiConfigurationFieldForApiOptions("customModelId", e.target.value)
										}
										placeholder="e.g. gpt-4o, llama-3.3-70b"
										className="w-full"
									/>
								</div>
							</div>
						) : (
							<div className="space-y-2 p-3.5 rounded-lg bg-vscode-sideBar-background/30 border border-vscode-editorGroup-border/40">
								<div className="flex items-center justify-between">
									<label className="block text-xs font-medium text-vscode-foreground">
										{selectedProviderConfig.name} API Key
									</label>
									<div className="flex items-center gap-3">
										{selectedProviderConfig.keyUrl && (
											<a
												href={selectedProviderConfig.keyUrl}
												target="_blank"
												rel="noreferrer"
												className="text-[11px] text-mirror-brand-via hover:underline flex items-center gap-1">
												{selectedProviderConfig.keyLabel}
												<ExternalLink className="size-3" />
											</a>
										)}
										<button
											type="button"
											onClick={() => setShowApiKey(!showApiKey)}
											className="text-[11px] text-vscode-descriptionForeground hover:text-vscode-foreground flex items-center gap-1 bg-transparent border-none cursor-pointer">
											{showApiKey ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
											{showApiKey ? "Hide" : "Show"}
										</button>
									</div>
								</div>
								<VSCodeTextField
									value={currentApiKey}
									type={showApiKey ? "text" : "password"}
									onInput={(e: any) => handleKeyChange(e.target.value)}
									placeholder="Paste API key here..."
									className="w-full"
								/>
								<div className="flex items-center justify-between text-[11px] text-vscode-descriptionForeground pt-1">
									<span>
										Recommended Model:{" "}
										<strong className="text-vscode-foreground">
											{selectedProviderConfig.modelLabel}
										</strong>
									</span>
									<span className="text-[10px] text-mirror-brand-via">Auto-assigned</span>
								</div>
							</div>
						)}

						{/* Predefined Features Callout */}
						<div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs space-y-1.5">
							<div className="font-semibold text-emerald-400 flex items-center gap-1.5">
								<ShieldCheck className="size-4" />
								Preconfigured Safe Defaults
							</div>
							<div className="text-[11px] text-vscode-descriptionForeground leading-snug">
								Safe permissions enabled (asks before writing files or running commands), automatic Git
								checkpoints active, and smart context condensing turned on.
							</div>
						</div>

						{errorMessage && (
							<div className="p-2.5 rounded bg-vscode-errorForeground/15 border border-vscode-errorForeground/40 text-vscode-errorForeground text-xs">
								{errorMessage}
							</div>
						)}

						<div
							data-testid="api-options"
							data-provider={effectiveApiConfiguration.apiProvider}
							data-model={effectiveApiConfiguration.openRouterModelId}
							className="hidden"
						/>
					</div>
				) : (
					/* Advanced Setup View (existing 20+ providers) */
					<div className="mb-4">
						<ApiOptions
							fromWelcomeView
							apiConfiguration={effectiveApiConfiguration}
							uriScheme={uriScheme}
							setApiConfigurationField={setApiConfigurationFieldForApiOptions}
							errorMessage={errorMessage}
							setErrorMessage={setErrorMessage}
						/>
					</div>
				)}

				<div className="mt-4 flex gap-2">
					<Button onClick={handleGoBack} variant="secondary">
						<ArrowLeft className="size-4" />
						{t("welcome:providerSignup.goBack")}
					</Button>
					<Button onClick={handleFinishSetup} variant="primary">
						{t("welcome:providerSignup.finish")} →
					</Button>
				</div>
			</TabContent>
		</Tab>
	)
}

export default WelcomeViewProvider

import { useCallback, useState, useMemo } from "react"
import { Trans } from "react-i18next"
import { ArrowLeft, Brain, Sparkles } from "lucide-react"

import { openRouterDefaultModelId, type ProviderSettings } from "@mirror-vs/types"

import { useExtensionState } from "@src/context/ExtensionStateContext"
import { validateApiConfiguration } from "@src/utils/validate"
import { vscode } from "@src/utils/vscode"
import { useAppTranslation } from "@src/i18n/TranslationContext"
import { Button } from "@src/components/ui"

import ApiOptions from "../settings/ApiOptions"
import { Tab, TabContent } from "../common/Tab"

import MirrorHero from "./MirrorHero"
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

const WelcomeViewProvider = () => {
	const { apiConfiguration, currentApiConfigName, setApiConfiguration, uriScheme } = useExtensionState()
	const { t } = useAppTranslation()
	const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined)
	const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>("landing")
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

	const handleGetStarted = useCallback(() => {
		const initialApiConfiguration = getWelcomeApiConfiguration(apiConfiguration)
		setWelcomeApiConfiguration(initialApiConfiguration)
		setApiConfiguration(initialApiConfiguration)
		setOnboardingStep("provider_setup")
	}, [apiConfiguration, setApiConfiguration])

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
		setOnboardingStep("complete")
	}, [effectiveApiConfiguration, currentApiConfigName])

	const handleGoBack = useCallback(() => {
		setOnboardingStep("landing")
		setErrorMessage(undefined)
	}, [])

	const handleStartExploring = useCallback(() => {
		vscode.postMessage({ type: "switchTab", tab: "chat" })
	}, [])

	if (onboardingStep === "landing") {
		return (
			<Tab>
				<TabContent className="relative flex flex-col gap-4 p-6 justify-center">
					{/* Decorative gradient line */}
					<div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-mirror-brand-via/40 to-transparent" />
					<WelcomeStepIndicator steps={ONBOARDING_STEPS} currentStep={currentStepIndex} className="mb-2" />
					<MirrorHero />
					<h2 className="mt-0 mb-0 text-xl">{t("welcome:landing.greeting")}</h2>

					<div className="space-y-4 leading-normal">
						<p className="text-base text-vscode-foreground">
							<Trans i18nKey="welcome:landing.introduction" />
						</p>
					</div>

					<MirrorTips />

					<div className="mt-2 flex gap-2 items-center">
						<Button onClick={handleGetStarted} variant="primary">
							{t("welcome:landing.getStarted")}
						</Button>
					</div>

					<div className="absolute bottom-6 left-6">
						<button
							onClick={() => vscode.postMessage({ type: "importSettings" })}
							className="cursor-pointer bg-transparent border-none p-0 text-vscode-foreground hover:underline">
							{t("welcome:importSettings")}
						</button>
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
			<TabContent className="flex flex-col gap-4 p-6 justify-center relative">
				{/* Decorative gradient line */}
				<div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-mirror-brand-via/40 to-transparent" />
				<WelcomeStepIndicator steps={ONBOARDING_STEPS} currentStep={currentStepIndex} className="mb-2" />
				<Brain className="size-8" strokeWidth={1.5} />
				<h2 className="mt-0 mb-0 text-xl">{t("welcome:providerSignup.heading")}</h2>

				<p className="text-base text-vscode-foreground">
					<Trans i18nKey="welcome:providerSignup.chooseProvider" />
				</p>

				<div className="mb-8">
					<ApiOptions
						fromWelcomeView
						apiConfiguration={effectiveApiConfiguration}
						uriScheme={uriScheme}
						setApiConfigurationField={setApiConfigurationFieldForApiOptions}
						errorMessage={errorMessage}
						setErrorMessage={setErrorMessage}
					/>
				</div>

				<div className="-mt-4 flex gap-2">
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

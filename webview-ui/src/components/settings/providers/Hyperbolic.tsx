import { useCallback } from "react"
import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react"

import type { ProviderSettings } from "@mirror-vs/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { VSCodeButtonLink } from "@src/components/common/VSCodeButtonLink"

import { inputEventTransform } from "../transforms"

type HyperbolicProps = {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: (field: keyof ProviderSettings, value: ProviderSettings[keyof ProviderSettings]) => void
}

export const Hyperbolic = ({ apiConfiguration, setApiConfigurationField }: HyperbolicProps) => {
	const { t } = useAppTranslation()

	const handleInputChange = useCallback(
		<K extends keyof ProviderSettings, E>(
			field: K,
			transform: (event: E) => ProviderSettings[K] = inputEventTransform,
		) =>
			(event: E | Event) => {
				setApiConfigurationField(field, transform(event as E))
			},
		[setApiConfigurationField],
	)

	return (
		<>
			<VSCodeTextField
				value={apiConfiguration?.hyperbolicApiKey || ""}
				type="password"
				onInput={handleInputChange("hyperbolicApiKey")}
				placeholder={t("settings:placeholders.apiKey")}
				className="w-full">
				<label className="block font-medium mb-1">Hyperbolic API Key</label>
			</VSCodeTextField>
			<div className="text-sm text-vscode-descriptionForeground -mt-2">
				Hyperbolic provides decentralized GPU cloud inference for DeepSeek R1, DeepSeek V3, and Llama 3.3.
			</div>
			{!apiConfiguration?.hyperbolicApiKey && (
				<VSCodeButtonLink href="https://app.hyperbolic.xyz/" appearance="secondary">
					Get Hyperbolic API Key
				</VSCodeButtonLink>
			)}
		</>
	)
}

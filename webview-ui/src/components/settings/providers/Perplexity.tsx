import { useCallback } from "react"
import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react"

import type { ProviderSettings } from "@mirror-vs/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { VSCodeButtonLink } from "@src/components/common/VSCodeButtonLink"

import { inputEventTransform } from "../transforms"

type PerplexityProps = {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: (field: keyof ProviderSettings, value: ProviderSettings[keyof ProviderSettings]) => void
}

export const Perplexity = ({ apiConfiguration, setApiConfigurationField }: PerplexityProps) => {
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
				value={apiConfiguration?.perplexityApiKey || ""}
				type="password"
				onInput={handleInputChange("perplexityApiKey")}
				placeholder={t("settings:placeholders.apiKey")}
				className="w-full">
				<label className="block font-medium mb-1">Perplexity API Key</label>
			</VSCodeTextField>
			<div className="text-sm text-vscode-descriptionForeground -mt-2">
				Perplexity Sonar models provide live search-grounded reasoning and answers.
			</div>
			{!apiConfiguration?.perplexityApiKey && (
				<VSCodeButtonLink href="https://www.perplexity.ai/settings/api" appearance="secondary">
					Get Perplexity API Key
				</VSCodeButtonLink>
			)}
		</>
	)
}

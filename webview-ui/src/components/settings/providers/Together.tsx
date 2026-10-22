import { useCallback } from "react"
import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react"

import type { ProviderSettings } from "@mirror-vs/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { VSCodeButtonLink } from "@src/components/common/VSCodeButtonLink"

import { inputEventTransform } from "../transforms"

type TogetherProps = {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: (field: keyof ProviderSettings, value: ProviderSettings[keyof ProviderSettings]) => void
}

export const Together = ({ apiConfiguration, setApiConfigurationField }: TogetherProps) => {
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
				value={apiConfiguration?.togetherApiKey || ""}
				type="password"
				onInput={handleInputChange("togetherApiKey")}
				placeholder={t("settings:placeholders.apiKey")}
				className="w-full">
				<label className="block font-medium mb-1">Together AI API Key</label>
			</VSCodeTextField>
			<div className="text-sm text-vscode-descriptionForeground -mt-2">
				Together AI provides high-speed cloud inference for DeepSeek R1, DeepSeek V3, and Llama 3.3.
			</div>
			{!apiConfiguration?.togetherApiKey && (
				<VSCodeButtonLink href="https://api.together.xyz/" appearance="secondary">
					Get Together AI API Key
				</VSCodeButtonLink>
			)}
		</>
	)
}

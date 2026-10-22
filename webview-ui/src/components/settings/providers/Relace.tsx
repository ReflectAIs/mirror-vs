import { useCallback } from "react"
import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react"

import type { ProviderSettings } from "@mirror-vs/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { VSCodeButtonLink } from "@src/components/common/VSCodeButtonLink"

import { inputEventTransform } from "../transforms"

type RelaceProps = {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: (field: keyof ProviderSettings, value: ProviderSettings[keyof ProviderSettings]) => void
}

export const Relace = ({ apiConfiguration, setApiConfigurationField }: RelaceProps) => {
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
				value={apiConfiguration?.relaceApiKey || ""}
				type="password"
				onInput={handleInputChange("relaceApiKey")}
				placeholder={t("settings:placeholders.apiKey")}
				className="w-full">
				<label className="block font-medium mb-1">Relace API Key</label>
			</VSCodeTextField>
			<div className="text-sm text-vscode-descriptionForeground -mt-2">
				Relace provides high-speed open-weights inference (DeepSeek V4, GLM, Kimi) and ultra-fast code apply
				engines.
			</div>
			<VSCodeTextField
				value={apiConfiguration?.relaceBaseUrl || ""}
				onInput={handleInputChange("relaceBaseUrl")}
				placeholder="https://models.relace.ai/v1"
				className="w-full">
				<label className="block font-medium mb-1">Base URL (Optional)</label>
			</VSCodeTextField>
			{!apiConfiguration?.relaceApiKey && (
				<VSCodeButtonLink href="https://app.relace.ai" appearance="secondary">
					Get Relace API Key
				</VSCodeButtonLink>
			)}
		</>
	)
}

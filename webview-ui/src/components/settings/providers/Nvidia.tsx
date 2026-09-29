import { useCallback } from "react"
import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react"

import type { ProviderSettings } from "@mirror-vs/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { VSCodeButtonLink } from "@src/components/common/VSCodeButtonLink"

import { inputEventTransform } from "../transforms"

type NvidiaProps = {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: (field: keyof ProviderSettings, value: ProviderSettings[keyof ProviderSettings]) => void
}

export const Nvidia = ({ apiConfiguration, setApiConfigurationField }: NvidiaProps) => {
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
				value={apiConfiguration?.nvidiaApiKey || ""}
				type="password"
				onInput={handleInputChange("nvidiaApiKey")}
				placeholder={t("settings:placeholders.apiKey")}
				className="w-full">
				<label className="block font-medium mb-1">NVIDIA NIM API Key</label>
			</VSCodeTextField>
			<div className="text-sm text-vscode-descriptionForeground -mt-2">
				NVIDIA NIM provides 1,000 free requests/credits for models like Llama 3.3 70B, Nemotron, and DeepSeek
				R1.
			</div>
			{!apiConfiguration?.nvidiaApiKey && (
				<VSCodeButtonLink href="https://build.nvidia.com/" appearance="secondary">
					Get NVIDIA API Key (Free Trial)
				</VSCodeButtonLink>
			)}
		</>
	)
}

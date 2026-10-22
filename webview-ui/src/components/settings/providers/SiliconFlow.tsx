import { useCallback } from "react"
import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react"

import type { ProviderSettings } from "@mirror-vs/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { VSCodeButtonLink } from "@src/components/common/VSCodeButtonLink"

import { inputEventTransform } from "../transforms"

type SiliconFlowProps = {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: (field: keyof ProviderSettings, value: ProviderSettings[keyof ProviderSettings]) => void
}

export const SiliconFlow = ({ apiConfiguration, setApiConfigurationField }: SiliconFlowProps) => {
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
				value={apiConfiguration?.siliconFlowApiKey || ""}
				type="password"
				onInput={handleInputChange("siliconFlowApiKey")}
				placeholder={t("settings:placeholders.apiKey")}
				className="w-full">
				<label className="block font-medium mb-1">SiliconFlow API Key</label>
			</VSCodeTextField>
			<div className="text-sm text-vscode-descriptionForeground -mt-2">
				SiliconFlow provides high-throughput cloud inference for DeepSeek R1 and Qwen 2.5 Coder.
			</div>
			{!apiConfiguration?.siliconFlowApiKey && (
				<VSCodeButtonLink href="https://cloud.siliconflow.cn/account/ak" appearance="secondary">
					Get SiliconFlow API Key
				</VSCodeButtonLink>
			)}
		</>
	)
}

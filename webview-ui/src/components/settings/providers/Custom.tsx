import { useCallback } from "react"
import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react"

import {
	type ProviderSettings,
	customDefaultModelId,
	customDefaultModelInfo,
	inferModelSupportsImages,
} from "@mirror-vs/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { Checkbox } from "vscrui"
import { StandardTooltip } from "@src/components/ui"

import { inputEventTransform } from "../transforms"
import { ModelPicker } from "../ModelPicker"

type CustomProps = {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: (field: keyof ProviderSettings, value: ProviderSettings[keyof ProviderSettings]) => void
	organizationAllowList: any
	modelValidationError?: string
	simplifySettings?: boolean
}

const CUSTOM_SERVICE_NAME = "Custom API"

export const Custom = ({
	apiConfiguration,
	setApiConfigurationField,
	organizationAllowList,
	modelValidationError,
	simplifySettings,
}: CustomProps) => {
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
				value={apiConfiguration?.customBaseUrl || ""}
				onInput={handleInputChange("customBaseUrl")}
				placeholder={t("settings:placeholders.baseUrl")}
				className="w-full">
				<label className="block font-medium mb-1">{t("settings:providers.openAiBaseUrl")}</label>
			</VSCodeTextField>

			<VSCodeTextField
				value={apiConfiguration?.customApiKey || ""}
				type="password"
				onInput={handleInputChange("customApiKey")}
				placeholder={t("settings:placeholders.apiKey")}
				className="w-full">
				<label className="block font-medium mb-1">{t("settings:providers.apiKey")}</label>
			</VSCodeTextField>

			<div className="text-sm text-vscode-descriptionForeground -mt-2">
				{t("settings:providers.apiKeyStorageNotice")}
			</div>

			<ModelPicker
				apiConfiguration={apiConfiguration}
				setApiConfigurationField={setApiConfigurationField}
				defaultModelId={customDefaultModelId}
				models={null}
				modelIdKey="customModelId"
				serviceName={CUSTOM_SERVICE_NAME}
				serviceUrl=""
				organizationAllowList={organizationAllowList}
				errorMessage={modelValidationError}
				simplifySettings={simplifySettings}
			/>

			<div className="pt-2">
				<div className="flex items-center gap-1">
					<Checkbox
						checked={
							apiConfiguration?.customModelInfo?.supportsImages ??
							inferModelSupportsImages(apiConfiguration?.customModelId)
						}
						onChange={(checked: boolean) => {
							setApiConfigurationField("customModelInfo", {
								...(apiConfiguration?.customModelInfo || customDefaultModelInfo),
								supportsImages: checked,
							})
						}}>
						<span className="font-medium">{t("settings:providers.customModel.imageSupport.label")}</span>
					</Checkbox>
					<StandardTooltip content={t("settings:providers.customModel.imageSupport.description")}>
						<i
							className="codicon codicon-info text-vscode-descriptionForeground"
							style={{ fontSize: "12px" }}
						/>
					</StandardTooltip>
				</div>
				<div className="text-sm text-vscode-descriptionForeground pt-1">
					{t("settings:providers.customModel.imageSupport.description")}
				</div>
			</div>
		</>
	)
}

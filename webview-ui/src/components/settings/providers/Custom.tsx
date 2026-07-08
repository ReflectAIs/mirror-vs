import { useCallback } from "react"
import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react"

import { type ProviderSettings } from "@mirror-vs/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"

import { inputEventTransform } from "../transforms"

type CustomProps = {
    apiConfiguration: ProviderSettings
    setApiConfigurationField: (field: keyof ProviderSettings, value: ProviderSettings[keyof ProviderSettings]) => void
    organizationAllowList: any
    modelValidationError?: string
    simplifySettings?: boolean
}

export const Custom = ({
    apiConfiguration,
    setApiConfigurationField,
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

            <VSCodeTextField
                value={apiConfiguration?.customModelId || ""}
                onInput={handleInputChange("customModelId")}
                placeholder="Enter model"
                className="w-full">
                <label className="block font-medium mb-1">{t("settings:providers.model")}</label>
            </VSCodeTextField>
        </>
    )
}

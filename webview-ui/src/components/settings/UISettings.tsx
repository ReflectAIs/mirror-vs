import { HTMLAttributes, useMemo } from "react"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { VSCodeCheckbox, VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react"

import { SetCachedStateField } from "./types"
import { SectionHeader } from "./SectionHeader"
import { Section } from "./Section"
import { SearchableSetting } from "./SearchableSetting"
import { ExtensionStateContextType } from "@/context/ExtensionStateContext"

interface UISettingsProps extends HTMLAttributes<HTMLDivElement> {
	reasoningBlockCollapsed: boolean
	enterBehavior: "send" | "newline"
	disableTabBar: boolean
	mascotTheme?: "cyberpunk" | "retro" | "synthwave" | "solar"
	setCachedStateField: SetCachedStateField<keyof ExtensionStateContextType>
}

export const UISettings = ({
	reasoningBlockCollapsed,
	enterBehavior,
	disableTabBar,
	mascotTheme,
	setCachedStateField,
	...props
}: UISettingsProps) => {
	const { t } = useAppTranslation()

	// Detect platform for dynamic modifier key display
	const primaryMod = useMemo(() => {
		const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0
		return isMac ? "⌘" : "Ctrl"
	}, [])

	const handleReasoningBlockCollapsedChange = (value: boolean) => {
		setCachedStateField("reasoningBlockCollapsed", value)
	}

	const handleEnterBehaviorChange = (requireCtrlEnter: boolean) => {
		const newBehavior = requireCtrlEnter ? "newline" : "send"
		setCachedStateField("enterBehavior", newBehavior)
	}

	const handleDisableTabBarChange = (value: boolean) => {
		setCachedStateField("disableTabBar", value)
	}

	return (
		<div {...props}>
			<SectionHeader>{t("settings:sections.ui")}</SectionHeader>

			<Section>
				<div className="space-y-6">
					{/* Collapse Thinking Messages Setting */}
					<SearchableSetting
						settingId="ui-collapse-thinking"
						section="ui"
						label={t("settings:ui.collapseThinking.label")}>
						<div className="flex flex-col gap-1">
							<VSCodeCheckbox
								checked={reasoningBlockCollapsed}
								onChange={(e: any) => handleReasoningBlockCollapsedChange(e.target.checked)}
								data-testid="collapse-thinking-checkbox">
								<span className="font-medium">{t("settings:ui.collapseThinking.label")}</span>
							</VSCodeCheckbox>
							<div className="text-vscode-descriptionForeground text-sm ml-5 mt-1">
								{t("settings:ui.collapseThinking.description")}
							</div>
						</div>
					</SearchableSetting>

					{/* Enter Key Behavior Setting */}
					<SearchableSetting
						settingId="ui-enter-behavior"
						section="ui"
						label={t("settings:ui.requireCtrlEnterToSend.label", { primaryMod })}>
						<div className="flex flex-col gap-1">
							<VSCodeCheckbox
								checked={enterBehavior === "newline"}
								onChange={(e: any) => handleEnterBehaviorChange(e.target.checked)}
								data-testid="enter-behavior-checkbox">
								<span className="font-medium">
									{t("settings:ui.requireCtrlEnterToSend.label", { primaryMod })}
								</span>
							</VSCodeCheckbox>
							<div className="text-vscode-descriptionForeground text-sm ml-5 mt-1">
								{t("settings:ui.requireCtrlEnterToSend.description", { primaryMod })}
							</div>
						</div>
					</SearchableSetting>

					{/* Disable Multi-Tab Setting */}
					<SearchableSetting
						settingId="ui-disable-tab-bar"
						section="ui"
						label={t("settings:ui.disableTabBar.label")}>
						<div className="flex flex-col gap-1">
							<VSCodeCheckbox
								checked={disableTabBar}
								onChange={(e: any) => handleDisableTabBarChange(e.target.checked)}
								data-testid="disable-tab-bar-checkbox">
								<span className="font-medium">{t("settings:ui.disableTabBar.label")}</span>
							</VSCodeCheckbox>
							<div className="text-vscode-descriptionForeground text-sm ml-5 mt-1">
								{t("settings:ui.disableTabBar.description")}
							</div>
						</div>
					</SearchableSetting>

					{/* Mascot Theme Setting */}
					<SearchableSetting
						settingId="ui-mascot-theme"
						section="ui"
						label={t("settings:ui.mascotTheme.label")}>
						<div className="flex flex-col gap-1">
							<label className="block font-medium mb-1">{t("settings:ui.mascotTheme.label")}</label>
							<VSCodeDropdown
								value={mascotTheme || "cyberpunk"}
								onChange={(e: any) => setCachedStateField("mascotTheme", e.target.value)}
								className="w-full"
								data-testid="mascot-theme-dropdown">
								<VSCodeOption value="cyberpunk">{t("settings:ui.mascotTheme.cyberpunk")}</VSCodeOption>
								<VSCodeOption value="retro">{t("settings:ui.mascotTheme.retro")}</VSCodeOption>
								<VSCodeOption value="synthwave">{t("settings:ui.mascotTheme.synthwave")}</VSCodeOption>
								<VSCodeOption value="solar">{t("settings:ui.mascotTheme.solar")}</VSCodeOption>
							</VSCodeDropdown>
							<div className="text-vscode-descriptionForeground text-sm mt-1">
								{t("settings:ui.mascotTheme.description")}
							</div>
						</div>
					</SearchableSetting>
				</div>
			</Section>
		</div>
	)
}

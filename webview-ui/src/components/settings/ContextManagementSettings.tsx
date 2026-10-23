import { HTMLAttributes } from "react"
import React from "react"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { VSCodeCheckbox, VSCodeTextArea } from "@vscode/webview-ui-toolkit/react"
import { FoldVertical, Sparkles } from "lucide-react"
import { PROVIDERS, MODELS_BY_PROVIDER } from "./constants"
import type { ProviderSettings } from "@mirror-vs/types"

import { supportPrompt } from "@shared/support-prompt"

import { cn } from "@/lib/utils"
import {
	Input,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Slider,
	Button,
	StandardTooltip,
} from "@/components/ui"

import { SetCachedStateField } from "./types"
import { SectionHeader } from "./SectionHeader"
import { Section } from "./Section"
import { SearchableSetting } from "./SearchableSetting"
import { vscode } from "@/utils/vscode"

type ContextManagementSettingsProps = HTMLAttributes<HTMLDivElement> & {
	autoCondenseContext: boolean
	autoCondenseContextPercent: number
	listApiConfigMeta: any[]
	maxOpenTabsContext: number
	maxWorkspaceFiles: number
	showMirrorIgnoredFiles?: boolean
	enableSubfolderRules?: boolean
	maxImageFileSize?: number
	maxTotalImageSize?: number
	profileThresholds?: Record<string, number>
	includeDiagnosticMessages?: boolean
	maxDiagnosticMessages?: number
	writeDelayMs: number
	includeCurrentTime?: boolean
	includeCurrentCost?: boolean
	maxGitStatusFiles?: number
	mcpToolsThreshold?: number
	customSupportPrompts: Record<string, string | undefined>
	setCustomSupportPrompts: (prompts: Record<string, string | undefined>) => void
	condenseProvider?: string
	condenseModelId?: string
	apiConfiguration?: ProviderSettings
	setCachedStateField: SetCachedStateField<
		| "autoCondenseContext"
		| "autoCondenseContextPercent"
		| "condenseProvider"
		| "condenseModelId"
		| "maxOpenTabsContext"
		| "maxWorkspaceFiles"
		| "showMirrorIgnoredFiles"
		| "enableSubfolderRules"
		| "maxImageFileSize"
		| "maxTotalImageSize"
		| "profileThresholds"
		| "includeDiagnosticMessages"
		| "maxDiagnosticMessages"
		| "writeDelayMs"
		| "includeCurrentTime"
		| "includeCurrentCost"
		| "maxGitStatusFiles"
		| "mcpToolsThreshold"
	>
}

export const ContextManagementSettings = ({
	autoCondenseContext,
	autoCondenseContextPercent,
	condenseProvider,
	condenseModelId,
	apiConfiguration,
	mcpToolsThreshold,
	listApiConfigMeta,
	maxOpenTabsContext,
	maxWorkspaceFiles,
	showMirrorIgnoredFiles,
	enableSubfolderRules,
	setCachedStateField,
	maxImageFileSize,
	maxTotalImageSize,
	profileThresholds = {},
	includeDiagnosticMessages,
	maxDiagnosticMessages,
	writeDelayMs,
	includeCurrentTime,
	includeCurrentCost,
	maxGitStatusFiles,
	customSupportPrompts,
	setCustomSupportPrompts,
	className,
	...props
}: ContextManagementSettingsProps) => {
	const { t } = useAppTranslation()
	const [selectedThresholdProfile, setSelectedThresholdProfile] = React.useState<string>("default")

	// Helper function to get the CONDENSE prompt value
	const getCondensePromptValue = (): string => {
		return supportPrompt.get(customSupportPrompts, "CONDENSE")
	}

	// Helper function to update the CONDENSE prompt
	const updateCondensePrompt = (value: string | undefined) => {
		const updatedPrompts = { ...customSupportPrompts }
		if (value === undefined) {
			delete updatedPrompts["CONDENSE"]
		} else {
			updatedPrompts["CONDENSE"] = value
		}
		setCustomSupportPrompts(updatedPrompts)
	}

	// Helper function to reset the CONDENSE prompt to default
	const handleCondenseReset = () => {
		const updatedPrompts = { ...customSupportPrompts }
		delete updatedPrompts["CONDENSE"]
		setCustomSupportPrompts(updatedPrompts)
	}

	// Helper function to get the current threshold value based on selected profile
	const getCurrentThresholdValue = () => {
		if (selectedThresholdProfile === "default") {
			return autoCondenseContextPercent
		}
		const profileThreshold = profileThresholds[selectedThresholdProfile]
		if (profileThreshold === undefined || profileThreshold === -1) {
			return autoCondenseContextPercent // Use default if profile not configured or set to -1
		}
		return profileThreshold
	}

	// Helper function to handle threshold changes
	const handleThresholdChange = (value: number) => {
		if (selectedThresholdProfile === "default") {
			setCachedStateField("autoCondenseContextPercent", value)
		} else {
			const newThresholds = {
				...profileThresholds,
				[selectedThresholdProfile]: value,
			}

			setCachedStateField("profileThresholds", newThresholds)
			vscode.postMessage({ type: "updateSettings", updatedSettings: { profileThresholds: newThresholds } })
		}
	}
	return (
		<div className={cn("flex flex-col gap-2", className)} {...props}>
			<SectionHeader description={t("settings:contextManagement.description")}>
				{t("settings:sections.contextManagement")}
			</SectionHeader>

			<Section>
				<SearchableSetting
					settingId="context-open-tabs"
					section="contextManagement"
					label={t("settings:contextManagement.openTabs.label")}>
					<span className="block font-medium mb-1">{t("settings:contextManagement.openTabs.label")}</span>
					<div className="flex items-center gap-2">
						<Slider
							min={0}
							max={500}
							step={1}
							value={[maxOpenTabsContext ?? 20]}
							onValueChange={([value]) => setCachedStateField("maxOpenTabsContext", value)}
							data-testid="open-tabs-limit-slider"
						/>
						<span className="w-10">{maxOpenTabsContext ?? 20}</span>
					</div>
					<div className="text-vscode-descriptionForeground text-sm mt-1">
						{t("settings:contextManagement.openTabs.description")}
					</div>
				</SearchableSetting>

				<SearchableSetting
					settingId="context-workspace-files"
					section="contextManagement"
					label={t("settings:contextManagement.workspaceFiles.label")}>
					<span className="block font-medium mb-1">
						{t("settings:contextManagement.workspaceFiles.label")}
					</span>
					<div className="flex items-center gap-2">
						<Slider
							min={0}
							max={500}
							step={1}
							value={[maxWorkspaceFiles ?? 200]}
							onValueChange={([value]) => setCachedStateField("maxWorkspaceFiles", value)}
							data-testid="workspace-files-limit-slider"
						/>
						<span className="w-10">{maxWorkspaceFiles ?? 200}</span>
					</div>
					<div className="text-vscode-descriptionForeground text-sm mt-1">
						{t("settings:contextManagement.workspaceFiles.description")}
					</div>
				</SearchableSetting>

				<SearchableSetting
					settingId="context-max-git-status-files"
					section="contextManagement"
					label={t("settings:contextManagement.maxGitStatusFiles.label")}>
					<span className="block font-medium mb-1">
						{t("settings:contextManagement.maxGitStatusFiles.label")}
					</span>
					<div className="flex items-center gap-2">
						<Slider
							min={0}
							max={50}
							step={1}
							value={[maxGitStatusFiles ?? 0]}
							onValueChange={([value]) => setCachedStateField("maxGitStatusFiles", value)}
							data-testid="max-git-status-files-slider"
						/>
						<span className="w-10">{maxGitStatusFiles ?? 0}</span>
					</div>
					<div className="text-vscode-descriptionForeground text-sm mt-1">
						{t("settings:contextManagement.maxGitStatusFiles.description")}
					</div>
				</SearchableSetting>

				<SearchableSetting
					settingId="context-show-mirrorignored-files"
					section="contextManagement"
					label={t("settings:contextManagement.mirrorignore.label")}>
					<VSCodeCheckbox
						checked={showMirrorIgnoredFiles}
						onChange={(e: any) => setCachedStateField("showMirrorIgnoredFiles", e.target.checked)}
						data-testid="show-mirrorignored-files-checkbox">
						<label className="block font-medium mb-1">
							{t("settings:contextManagement.mirrorignore.label")}
						</label>
					</VSCodeCheckbox>
					<div className="text-vscode-descriptionForeground text-sm mt-1 mb-3">
						{t("settings:contextManagement.mirrorignore.description")}
					</div>
				</SearchableSetting>

				<SearchableSetting
					settingId="context-enable-subfolder-rules"
					section="contextManagement"
					label={t("settings:contextManagement.enableSubfolderRules.label")}>
					<VSCodeCheckbox
						checked={enableSubfolderRules}
						onChange={(e: any) => setCachedStateField("enableSubfolderRules", e.target.checked)}
						data-testid="enable-subfolder-rules-checkbox">
						<label className="block font-medium mb-1">
							{t("settings:contextManagement.enableSubfolderRules.label")}
						</label>
					</VSCodeCheckbox>
					<div className="text-vscode-descriptionForeground text-sm mt-1 mb-3">
						{t("settings:contextManagement.enableSubfolderRules.description")}
					</div>
				</SearchableSetting>

				<SearchableSetting
					settingId="context-max-image-file-size"
					section="contextManagement"
					label={t("settings:contextManagement.maxImageFileSize.label")}>
					<div className="flex flex-col gap-2">
						<span className="font-medium">{t("settings:contextManagement.maxImageFileSize.label")}</span>
						<div className="flex items-center gap-4">
							<Input
								type="number"
								pattern="[0-9]*"
								className="w-24 bg-vscode-input-background text-vscode-input-foreground border border-vscode-input-border px-2 py-1 rounded text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
								value={maxImageFileSize ?? 5}
								min={1}
								max={100}
								onChange={(e) => {
									const newValue = parseInt(e.target.value, 10)
									if (!isNaN(newValue) && newValue >= 1 && newValue <= 100) {
										setCachedStateField("maxImageFileSize", newValue)
									}
								}}
								onClick={(e) => e.currentTarget.select()}
								data-testid="max-image-file-size-input"
							/>
							<span>{t("settings:contextManagement.maxImageFileSize.mb")}</span>
						</div>
					</div>
					<div className="text-vscode-descriptionForeground text-sm mt-2">
						{t("settings:contextManagement.maxImageFileSize.description")}
					</div>
				</SearchableSetting>

				<SearchableSetting
					settingId="context-max-total-image-size"
					section="contextManagement"
					label={t("settings:contextManagement.maxTotalImageSize.label")}>
					<div className="flex flex-col gap-2">
						<span className="font-medium">{t("settings:contextManagement.maxTotalImageSize.label")}</span>
						<div className="flex items-center gap-4">
							<Input
								type="number"
								pattern="[0-9]*"
								className="w-24 bg-vscode-input-background text-vscode-input-foreground border border-vscode-input-border px-2 py-1 rounded text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
								value={maxTotalImageSize ?? 20}
								min={1}
								max={500}
								onChange={(e) => {
									const newValue = parseInt(e.target.value, 10)
									if (!isNaN(newValue) && newValue >= 1 && newValue <= 500) {
										setCachedStateField("maxTotalImageSize", newValue)
									}
								}}
								onClick={(e) => e.currentTarget.select()}
								data-testid="max-total-image-size-input"
							/>
							<span>{t("settings:contextManagement.maxTotalImageSize.mb")}</span>
						</div>
					</div>
					<div className="text-vscode-descriptionForeground text-sm mt-2">
						{t("settings:contextManagement.maxTotalImageSize.description")}
					</div>
				</SearchableSetting>

				<SearchableSetting
					settingId="context-include-diagnostic-messages"
					section="contextManagement"
					label={t("settings:contextManagement.diagnostics.includeMessages.label")}>
					<VSCodeCheckbox
						checked={includeDiagnosticMessages}
						onChange={(e: any) => setCachedStateField("includeDiagnosticMessages", e.target.checked)}
						data-testid="include-diagnostic-messages-checkbox">
						<label className="block font-medium mb-1">
							{t("settings:contextManagement.diagnostics.includeMessages.label")}
						</label>
					</VSCodeCheckbox>
					<div className="text-vscode-descriptionForeground text-sm mt-1 mb-3">
						{t("settings:contextManagement.diagnostics.includeMessages.description")}
					</div>
				</SearchableSetting>

				<SearchableSetting
					settingId="context-max-diagnostic-messages"
					section="contextManagement"
					label={t("settings:contextManagement.diagnostics.maxMessages.label")}>
					<span className="block font-medium mb-1">
						{t("settings:contextManagement.diagnostics.maxMessages.label")}
					</span>
					<div className="flex items-center gap-2">
						<Slider
							min={1}
							max={100}
							step={1}
							value={[
								maxDiagnosticMessages !== undefined && maxDiagnosticMessages <= 0
									? 100
									: (maxDiagnosticMessages ?? 50),
							]}
							onValueChange={([value]) => {
								// When slider reaches 100, set to -1 (unlimited)
								setCachedStateField("maxDiagnosticMessages", value === 100 ? -1 : value)
							}}
							data-testid="max-diagnostic-messages-slider"
							aria-label={t("settings:contextManagement.diagnostics.maxMessages.label")}
							aria-valuemin={1}
							aria-valuemax={100}
							aria-valuenow={
								maxDiagnosticMessages !== undefined && maxDiagnosticMessages <= 0
									? 100
									: (maxDiagnosticMessages ?? 50)
							}
							aria-valuetext={
								(maxDiagnosticMessages !== undefined && maxDiagnosticMessages <= 0) ||
								maxDiagnosticMessages === 100
									? t("settings:contextManagement.diagnostics.maxMessages.unlimitedLabel")
									: `${maxDiagnosticMessages ?? 50} ${t("settings:contextManagement.diagnostics.maxMessages.label")}`
							}
						/>
						<span className="w-20 text-sm font-medium">
							{(maxDiagnosticMessages !== undefined && maxDiagnosticMessages <= 0) ||
							maxDiagnosticMessages === 100
								? t("settings:contextManagement.diagnostics.maxMessages.unlimitedLabel")
								: (maxDiagnosticMessages ?? 50)}
						</span>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setCachedStateField("maxDiagnosticMessages", 50)}
							title={t("settings:contextManagement.diagnostics.maxMessages.resetTooltip")}
							className="p-1 h-6 w-6"
							disabled={maxDiagnosticMessages === 50}>
							<span className="codicon codicon-discard" />
						</Button>
					</div>
					<div className="text-vscode-descriptionForeground text-sm mt-1">
						{t("settings:contextManagement.diagnostics.maxMessages.description")}
					</div>
				</SearchableSetting>

				<SearchableSetting
					settingId="context-write-delay"
					section="contextManagement"
					label={t("settings:contextManagement.diagnostics.delayAfterWrite.label")}>
					<span className="block font-medium mb-1">
						{t("settings:contextManagement.diagnostics.delayAfterWrite.label")}
					</span>
					<div className="flex items-center gap-2">
						<Slider
							min={0}
							max={5000}
							step={100}
							value={[writeDelayMs]}
							onValueChange={([value]) => setCachedStateField("writeDelayMs", value)}
							data-testid="write-delay-slider"
						/>
						<span className="w-20">{writeDelayMs}ms</span>
					</div>
					<div className="text-vscode-descriptionForeground text-sm mt-1">
						{t("settings:contextManagement.diagnostics.delayAfterWrite.description")}
					</div>
				</SearchableSetting>

				<SearchableSetting
					settingId="context-include-current-time"
					section="contextManagement"
					label={t("settings:contextManagement.includeCurrentTime.label")}>
					<VSCodeCheckbox
						checked={includeCurrentTime}
						onChange={(e: any) => setCachedStateField("includeCurrentTime", e.target.checked)}
						data-testid="include-current-time-checkbox">
						<label className="block font-medium mb-1">
							{t("settings:contextManagement.includeCurrentTime.label")}
						</label>
					</VSCodeCheckbox>
					<div className="text-vscode-descriptionForeground text-sm mt-1 mb-3">
						{t("settings:contextManagement.includeCurrentTime.description")}
					</div>
				</SearchableSetting>

				<SearchableSetting
					settingId="context-include-current-cost"
					section="contextManagement"
					label={t("settings:contextManagement.includeCurrentCost.label")}>
					<VSCodeCheckbox
						checked={includeCurrentCost}
						onChange={(e: any) => setCachedStateField("includeCurrentCost", e.target.checked)}
						data-testid="include-current-cost-checkbox">
						<label className="block font-medium mb-1">
							{t("settings:contextManagement.includeCurrentCost.label")}
						</label>
					</VSCodeCheckbox>
					<div className="text-vscode-descriptionForeground text-sm mt-1 mb-3">
						{t("settings:contextManagement.includeCurrentCost.description")}
					</div>
				</SearchableSetting>
			</Section>
			<Section className="pt-2">
				{/* Context Condensing Prompt Editor */}
				<SearchableSetting
					settingId="context-condense-prompt"
					section="contextManagement"
					label={t("prompts:supportPrompts.types.CONDENSE.label")}>
					<div className="flex justify-between items-center mb-1">
						<label className="block font-medium">{t("prompts:supportPrompts.types.CONDENSE.label")}</label>
						<StandardTooltip content={t("prompts:supportPrompts.resetPrompt", { promptType: "CONDENSE" })}>
							<Button variant="ghost" size="icon" onClick={handleCondenseReset}>
								<span className="codicon codicon-discard"></span>
							</Button>
						</StandardTooltip>
					</div>
					<div className="text-sm text-vscode-descriptionForeground mb-2">
						{t("prompts:supportPrompts.types.CONDENSE.description")}
					</div>
					<VSCodeTextArea
						resize="vertical"
						value={getCondensePromptValue()}
						onInput={(e) => {
							const value =
								(e as unknown as CustomEvent)?.detail?.target?.value ??
								((e as any).target as HTMLTextAreaElement).value
							updateCondensePrompt(value)
						}}
						rows={6}
						className="w-full"
						data-testid="condense-prompt-textarea"
					/>
				</SearchableSetting>

				{/* Auto Condense Context */}
				<SearchableSetting
					settingId="context-auto-condense"
					section="contextManagement"
					label={t("settings:contextManagement.autoCondenseContext.name")}>
					<VSCodeCheckbox
						checked={autoCondenseContext}
						onChange={(e: any) => setCachedStateField("autoCondenseContext", e.target.checked)}
						data-testid="auto-condense-context-checkbox">
						<span className="font-medium">{t("settings:contextManagement.autoCondenseContext.name")}</span>
					</VSCodeCheckbox>
				</SearchableSetting>
				{autoCondenseContext && (
					<div className="flex flex-col gap-3 pl-3 border-l-2 border-vscode-button-background">
						<div className="flex items-center gap-4 font-bold">
							<FoldVertical size={16} />
							<div>{t("settings:contextManagement.condensingThreshold.label")}</div>
						</div>
						<div>
							<Select
								value={selectedThresholdProfile || "default"}
								onValueChange={(value) => {
									setSelectedThresholdProfile(value)
								}}
								data-testid="threshold-profile-select">
								<SelectTrigger className="w-full">
									<SelectValue
										placeholder={
											t("settings:contextManagement.condensingThreshold.selectProfile") ||
											"Select profile for threshold"
										}
									/>
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="default">
										{t("settings:contextManagement.condensingThreshold.defaultProfile") ||
											"Default (applies to all unconfigured profiles)"}
									</SelectItem>
									{(listApiConfigMeta || []).map((config) => {
										const profileThreshold = profileThresholds[config.id]
										const thresholdDisplay =
											profileThreshold !== undefined
												? profileThreshold === -1
													? ` ${t(
															"settings:contextManagement.condensingThreshold.usesGlobal",
															{
																threshold: autoCondenseContextPercent,
															},
														)}`
													: ` (${profileThreshold}%)`
												: ""
										return (
											<SelectItem key={config.id} value={config.id}>
												{config.name}
												{thresholdDisplay}
											</SelectItem>
										)
									})}
								</SelectContent>
							</Select>
						</div>

						{/* Threshold Slider */}
						<div>
							<div className="flex items-center gap-2">
								<Slider
									min={10}
									max={100}
									step={1}
									value={[getCurrentThresholdValue()]}
									onValueChange={([value]) => handleThresholdChange(value)}
									data-testid="condense-threshold-slider"
								/>
								<span className="w-20">{getCurrentThresholdValue()}%</span>
							</div>
							<div className="text-vscode-descriptionForeground text-sm mt-1">
								{selectedThresholdProfile === "default"
									? t("settings:contextManagement.condensingThreshold.defaultDescription", {
											threshold: autoCondenseContextPercent,
										})
									: t("settings:contextManagement.condensingThreshold.profileDescription")}
							</div>
						</div>

						{/* Compression & Summarization Model Selection */}
						{(() => {
							const effectiveActiveProvider = apiConfiguration?.apiProvider || "anthropic"
							const activeProviderObj = PROVIDERS.find((p) => p.value === effectiveActiveProvider)
							const effectiveActiveProviderLabel = activeProviderObj?.label || effectiveActiveProvider

							const effectiveCondenseProvider =
								condenseProvider && condenseProvider !== "same"
									? condenseProvider
									: effectiveActiveProvider

							const modelsRecord =
								MODELS_BY_PROVIDER[effectiveCondenseProvider as keyof typeof MODELS_BY_PROVIDER] || {}
							const availableCondenseModels = Object.keys(modelsRecord)

							return (
								<div className="pt-3 border-t border-vscode-editorWidget-border/40 flex flex-col gap-3">
									<div className="flex items-center gap-2">
										<Sparkles size={16} className="text-vscode-charts-yellow" />
										<span className="font-bold text-sm">
											Compression Provider & Model (Optional)
										</span>
									</div>
									<div className="text-vscode-descriptionForeground text-xs leading-relaxed">
										Select a specialized or lower-cost model/provider for context condensation and
										conversation summarization. Your primary coding agent stays on your main model,
										while compression runs on this lightweight model to drastically save tokens and
										cost (up to 95%).
									</div>

									{/* Provider Selection */}
									<div className="flex flex-col gap-1.5">
										<label className="text-xs font-medium text-vscode-foreground">
											Compression Provider
										</label>
										<Select
											value={condenseProvider || "same"}
											onValueChange={(val) => {
												setCachedStateField(
													"condenseProvider",
													val === "same" ? undefined : val,
												)
												setCachedStateField("condenseModelId", undefined)
											}}
											data-testid="condense-provider-select">
											<SelectTrigger className="w-full">
												<SelectValue placeholder="Same as active provider (Default)" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="same">
													Same as active provider ({effectiveActiveProviderLabel})
												</SelectItem>
												{PROVIDERS.map((p) => (
													<SelectItem key={p.value} value={p.value}>
														{p.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>

									{/* Model Selection */}
									<div className="flex flex-col gap-1.5">
										<label className="text-xs font-medium text-vscode-foreground">
											Compression Model
										</label>
										<Select
											value={condenseModelId || "default"}
											onValueChange={(val) => {
												if (val === "default") {
													setCachedStateField("condenseModelId", undefined)
												} else {
													setCachedStateField("condenseModelId", val)
												}
											}}
											data-testid="condense-model-select">
											<SelectTrigger className="w-full">
												<SelectValue placeholder="Default (same as active model)" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="default">
													Default (
													{effectiveCondenseProvider === effectiveActiveProvider
														? "Same as active model"
														: "Provider default model"}
													)
												</SelectItem>
												{availableCondenseModels.map((modelId) => (
													<SelectItem key={modelId} value={modelId}>
														{modelId}
													</SelectItem>
												))}
												<SelectItem value="custom">+ Custom model ID...</SelectItem>
											</SelectContent>
										</Select>
									</div>

									{/* Custom Model Input if custom or entered */}
									{(condenseModelId === "custom" ||
										(condenseModelId && !availableCondenseModels.includes(condenseModelId))) && (
										<div className="flex flex-col gap-1">
											<label className="text-xs text-vscode-descriptionForeground">
												Custom Model ID
											</label>
											<Input
												type="text"
												value={condenseModelId === "custom" ? "" : condenseModelId}
												placeholder="e.g. deepseek-ai/DeepSeek-V4.1-Flash, gpt-4o-mini, claude-3-5-haiku"
												onChange={(e) => setCachedStateField("condenseModelId", e.target.value)}
												className="w-full text-xs font-mono"
												data-testid="condense-custom-model-input"
											/>
										</div>
									)}
								</div>
							)
						})()}
					</div>
				)}

				{/* Max Active MCP Tools Limit */}
				<SearchableSetting
					settingId="mcp-tools-threshold"
					section="contextManagement"
					label="Max Active MCP Tools Limit">
					<div className="flex flex-col gap-2 mt-4">
						<div className="flex items-center gap-2">
							<Slider
								min={10}
								max={100}
								step={5}
								value={[mcpToolsThreshold ?? 40]}
								onValueChange={([value]) => setCachedStateField("mcpToolsThreshold", value)}
								data-testid="mcp-tools-threshold-slider"
							/>
							<span className="w-16 font-mono text-xs">{mcpToolsThreshold ?? 40} tools</span>
						</div>
						<div className="text-vscode-descriptionForeground text-xs leading-relaxed">
							Limits the number of active tools exposed to the LLM to prevent model confusion and save API
							cost. Active tools are kept based on execution recency/frequency; others are parked and can
							be activated dynamically.
						</div>
					</div>
				</SearchableSetting>
			</Section>
		</div>
	)
}

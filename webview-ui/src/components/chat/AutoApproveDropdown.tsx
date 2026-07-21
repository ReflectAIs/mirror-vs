import React from "react"
import { ListChecks, LayoutList, Settings, CheckCheck, X } from "lucide-react"

import { vscode } from "@/utils/vscode"

import { cn } from "@/lib/utils"

import { useExtensionState } from "@/context/ExtensionStateContext"

import { useAppTranslation } from "@/i18n/TranslationContext"

import { useAutoApprovalToggles } from "@/hooks/useAutoApprovalToggles"
import { useAutoApprovalState } from "@/hooks/useAutoApprovalState"

import { useMirrorPortal } from "@/components/ui/hooks/useMirrorPortal"

import { Popover, PopoverContent, PopoverTrigger, StandardTooltip, ToggleSwitch, Button } from "@/components/ui"

import { AutoApproveSetting, autoApproveSettingsConfig } from "../settings/AutoApproveToggle"

interface AutoApproveDropdownProps {
	disabled?: boolean
	triggerClassName?: string
}

export const AutoApproveDropdown = ({ disabled = false, triggerClassName = "" }: AutoApproveDropdownProps) => {
	const [open, setOpen] = React.useState(false)
	const portalContainer = useMirrorPortal("mirror-portal")
	const { t } = useAppTranslation()

	const {
		autoApprovalEnabled,
		setAutoApprovalEnabled,
		setAlwaysAllowReadOnly,
		setAlwaysAllowWrite,
		setAlwaysAllowExecute,
		setAlwaysAllowMcp,
		setAlwaysAllowModeSwitch,
		setAlwaysAllowSubtasks,
		setAlwaysAllowFollowupQuestions,
		setAlwaysAllowBrowser,
	} = useExtensionState()

	const toggles = useAutoApprovalToggles()

	const onAutoApproveToggle = React.useCallback(
		(key: AutoApproveSetting, value: boolean) => {
			vscode.postMessage({ type: "updateSettings", updatedSettings: { [key]: value } })

			switch (key) {
				case "alwaysAllowReadOnly":
					setAlwaysAllowReadOnly(value)
					break
				case "alwaysAllowWrite":
					setAlwaysAllowWrite(value)
					break
				case "alwaysAllowExecute":
					setAlwaysAllowExecute(value)
					break
				case "alwaysAllowMcp":
					setAlwaysAllowMcp(value)
					break
				case "alwaysAllowModeSwitch":
					setAlwaysAllowModeSwitch(value)
					break
				case "alwaysAllowSubtasks":
					setAlwaysAllowSubtasks(value)
					break
				case "alwaysAllowFollowupQuestions":
					setAlwaysAllowFollowupQuestions(value)
					break
				case "alwaysAllowBrowser":
					setAlwaysAllowBrowser(value)
					break
			}

			// If enabling any option, ensure autoApprovalEnabled is true.
			if (value && !autoApprovalEnabled) {
				setAutoApprovalEnabled(true)
				vscode.postMessage({ type: "autoApprovalEnabled", bool: true })
			}
		},
		[
			autoApprovalEnabled,
			setAlwaysAllowReadOnly,
			setAlwaysAllowWrite,
			setAlwaysAllowExecute,
			setAlwaysAllowMcp,
			setAlwaysAllowModeSwitch,
			setAlwaysAllowSubtasks,
			setAlwaysAllowFollowupQuestions,
			setAlwaysAllowBrowser,
			setAutoApprovalEnabled,
		],
	)

	const handleSelectAll = React.useCallback(() => {
		// Enable all options
		Object.keys(autoApproveSettingsConfig).forEach((key) => {
			onAutoApproveToggle(key as AutoApproveSetting, true)
		})
		// Enable master auto-approval
		if (!autoApprovalEnabled) {
			setAutoApprovalEnabled(true)
			vscode.postMessage({ type: "autoApprovalEnabled", bool: true })
		}
	}, [onAutoApproveToggle, autoApprovalEnabled, setAutoApprovalEnabled])

	const handleSelectNone = React.useCallback(() => {
		// Disable all options
		Object.keys(autoApproveSettingsConfig).forEach((key) => {
			onAutoApproveToggle(key as AutoApproveSetting, false)
		})
	}, [onAutoApproveToggle])

	const handleOpenSettings = React.useCallback(
		() =>
			window.postMessage({ type: "action", action: "settingsButtonClicked", values: { section: "autoApprove" } }),
		[],
	)

	// Handle the main auto-approval toggle
	const handleAutoApprovalToggle = React.useCallback(() => {
		const newValue = !(autoApprovalEnabled ?? false)
		setAutoApprovalEnabled(newValue)
		vscode.postMessage({ type: "autoApprovalEnabled", bool: newValue })
	}, [autoApprovalEnabled, setAutoApprovalEnabled])

	// Calculate enabled and total counts as separate properties
	const settingsArray = Object.values(autoApproveSettingsConfig)

	const enabledCount = React.useMemo(() => {
		return Object.values(toggles).filter((value) => !!value).length
	}, [toggles])

	const totalCount = React.useMemo(() => {
		return Object.keys(toggles).length
	}, [toggles])

	const { effectiveAutoApprovalEnabled } = useAutoApprovalState(toggles, autoApprovalEnabled)

	const tooltipText =
		!effectiveAutoApprovalEnabled || enabledCount === 0
			? t("chat:autoApprove.tooltipManage")
			: t("chat:autoApprove.tooltipStatus", {
					toggles: settingsArray
						.filter((setting) => toggles[setting.key])
						.map((setting) => t(setting.labelKey))
						.join(", "),
				})

	return (
		<Popover open={open} onOpenChange={setOpen} data-testid="auto-approve-dropdown-root">
			<StandardTooltip content={tooltipText}>
				<PopoverTrigger
					disabled={disabled}
					data-testid="auto-approve-dropdown-trigger"
					className={cn(
						"inline-flex items-center gap-1.5 relative whitespace-nowrap px-1.5 py-1 text-xs",
						"bg-transparent border border-[rgba(255,255,255,0.08)] rounded-md text-vscode-foreground",
						"transition-all duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-vscode-focusBorder focus-visible:ring-inset",
						"max-[300px]:shrink-0",
						disabled
							? "opacity-50 cursor-not-allowed"
							: "opacity-90 hover:opacity-100 hover:bg-[rgba(255,255,255,0.03)] hover:border-[rgba(255,255,255,0.15)] cursor-pointer",
						triggerClassName,
					)}>
					{!effectiveAutoApprovalEnabled ? (
						<X className="size-3 flex-shrink-0" />
					) : (
						<CheckCheck className="size-3 flex-shrink-0" />
					)}

					<span className="hidden min-[300px]:inline truncate min-w-0">
						{!effectiveAutoApprovalEnabled
							? t("chat:autoApprove.triggerLabelOff")
							: enabledCount === totalCount
								? t("chat:autoApprove.triggerLabelAll")
								: t("chat:autoApprove.triggerLabel", { count: enabledCount })}
					</span>
					<span className="inline min-[300px]:hidden min-w-0">
						{!effectiveAutoApprovalEnabled
							? t("chat:autoApprove.triggerLabelOffShort")
							: enabledCount === totalCount
								? t("chat:autoApprove.triggerLabelAll")
								: enabledCount}
					</span>
				</PopoverTrigger>
			</StandardTooltip>
			<PopoverContent
				align="start"
				sideOffset={4}
				container={portalContainer}
				className="p-0 overflow-hidden w-[min(400px,calc(100vw-2rem))]"
				onOpenAutoFocus={(e) => e.preventDefault()}>
				<div className="flex flex-col w-full">
					{/* Header with title and settings gear */}
					<div className="px-4 pt-3 pb-2 border-b border-vscode-dropdown-border">
						<div className="flex items-center justify-between gap-1 pb-1">
							<h4 className="m-0 font-semibold text-sm text-vscode-foreground tracking-tight">
								{t("chat:autoApprove.title")}
							</h4>
							<Settings
								className="inline size-3.5 cursor-pointer text-vscode-descriptionForeground hover:text-vscode-foreground transition-colors"
								onClick={handleOpenSettings}
							/>
						</div>
						<p className="m-0 text-[11px] leading-[1.4] text-vscode-descriptionForeground">
							{t("chat:autoApprove.description")}
						</p>
					</div>

					{/* Toggle buttons in a grid */}
					<div className="grid grid-cols-2 gap-1.5 p-3">
						{settingsArray.map(({ key, labelKey, descriptionKey, icon }) => {
							const isEnabled = toggles[key]
							return (
								<StandardTooltip key={key} content={t(descriptionKey)}>
									<Button
										onClick={() => onAutoApproveToggle(key, !isEnabled)}
										disabled={!effectiveAutoApprovalEnabled}
										data-testid={`auto-approve-${key}`}
										className={cn(
											"flex items-center gap-1.5 px-2.5 py-2 text-[11px] text-left justify-start h-auto leading-tight rounded-md",
											"transition-all duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-vscode-focusBorder",
											isEnabled
												? [
														"bg-vscode-button-background text-vscode-button-foreground shadow-sm",
														"border border-vscode-button-background",
													].join(" ")
												: [
														"bg-transparent text-vscode-foreground",
														"border border-vscode-dropdown-border/40",
														"hover:bg-vscode-button-background/10 hover:border-vscode-dropdown-border",
													].join(" "),
											!effectiveAutoApprovalEnabled &&
												"opacity-40 cursor-not-allowed hover:opacity-40 hover:bg-transparent hover:border-vscode-dropdown-border/40",
										)}>
										<span
											className={cn(
												`codicon codicon-${icon} text-xs flex-shrink-0`,
												isEnabled ? "opacity-100" : "opacity-60",
											)}
										/>
										<span
											className={cn(
												"flex-1 truncate",
												isEnabled ? "font-semibold" : "font-medium",
											)}>
											{t(labelKey)}
										</span>
									</Button>
								</StandardTooltip>
							)
						})}
					</div>

					{/* Bottom bar with Select All/None + master toggle */}
					<div className="flex flex-row items-center justify-between px-3 py-2.5 border-t border-vscode-dropdown-border bg-vscode-dropdown-background/30">
						<div className="flex flex-row gap-1">
							<Button
								variant="ghost"
								size="sm"
								aria-label={t("chat:autoApprove.selectAll")}
								onClick={handleSelectAll}
								disabled={!effectiveAutoApprovalEnabled}
								className={cn(
									"gap-1 px-2 py-1 text-[11px] font-medium h-auto rounded",
									!effectiveAutoApprovalEnabled && "opacity-40 hover:opacity-40 cursor-not-allowed",
								)}>
								<ListChecks className="w-3 h-3" />
								<span>{t("chat:autoApprove.all")}</span>
							</Button>
							<Button
								variant="ghost"
								size="sm"
								aria-label={t("chat:autoApprove.selectNone")}
								onClick={handleSelectNone}
								disabled={!effectiveAutoApprovalEnabled}
								className={cn(
									"gap-1 px-2 py-1 text-[11px] font-medium h-auto rounded",
									!effectiveAutoApprovalEnabled && "opacity-40 hover:opacity-40 cursor-not-allowed",
								)}>
								<LayoutList className="w-3 h-3" />
								<span>{t("chat:autoApprove.none")}</span>
							</Button>
						</div>

						<label
							className="flex items-center gap-2 cursor-pointer select-none"
							onClick={(e) => {
								if ((e.target as HTMLElement).closest('[role="switch"]')) {
									e.preventDefault()
									return
								}
								handleAutoApprovalToggle()
							}}>
							<ToggleSwitch
								checked={effectiveAutoApprovalEnabled}
								aria-label="Toggle auto-approval"
								onChange={handleAutoApprovalToggle}
							/>
							<span className="text-xs font-medium text-vscode-foreground">Enabled</span>
						</label>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	)
}

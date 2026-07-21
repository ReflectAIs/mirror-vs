import React from "react"
import { Check, Settings } from "lucide-react"

import { vscode } from "@/utils/vscode"

import { cn } from "@/lib/utils"

import { useExtensionState } from "@/context/ExtensionStateContext"

import { useAppTranslation } from "@/i18n/TranslationContext"

import { useAutoApprovalToggles } from "@/hooks/useAutoApprovalToggles"
import { useAutoApprovalState } from "@/hooks/useAutoApprovalState"

import { useMirrorPortal } from "@/components/ui/hooks/useMirrorPortal"

import { Popover, PopoverContent, PopoverTrigger, StandardTooltip } from "@/components/ui"

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
						"inline-flex items-center gap-1 relative whitespace-nowrap px-1.5 py-1 text-xs",
						"bg-transparent border border-[rgba(255,255,255,0.08)] rounded-md text-vscode-foreground",
						"transition-all duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-vscode-focusBorder focus-visible:ring-inset",
						"max-[300px]:shrink-0",
						disabled
							? "opacity-50 cursor-not-allowed"
							: "opacity-90 hover:opacity-100 hover:bg-[rgba(255,255,255,0.03)] hover:border-[rgba(255,255,255,0.15)] cursor-pointer",
						triggerClassName,
					)}>
					<Check
						className={cn(
							"size-3 flex-shrink-0 transition-colors",
							effectiveAutoApprovalEnabled && enabledCount > 0
								? "text-green-500"
								: "text-vscode-descriptionForeground",
						)}
					/>
					<span className="hidden min-[300px]:inline truncate min-w-0">
						{!effectiveAutoApprovalEnabled || enabledCount === 0 ? "Auto" : `${enabledCount}/${totalCount}`}
					</span>
					<span className="inline min-[300px]:hidden min-w-0">
						{!effectiveAutoApprovalEnabled || enabledCount === 0 ? "A" : enabledCount}
					</span>
				</PopoverTrigger>
			</StandardTooltip>
			<PopoverContent
				align="start"
				sideOffset={4}
				container={portalContainer}
				className="p-0 overflow-hidden w-[min(420px,calc(100vw-2rem))]"
				onOpenAutoFocus={(e) => e.preventDefault()}>
				<div className="flex flex-col w-full">
					{/* Header */}
					<div className="flex items-center justify-between px-3 py-2 border-b border-vscode-dropdown-border">
						<div className="flex items-center gap-2">
							<span className="text-xs font-semibold text-vscode-foreground tracking-tight">
								{t("chat:autoApprove.title")}
							</span>
							<div className="flex items-center gap-1">
								<div
									className={cn(
										"flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium leading-none cursor-pointer select-none transition-colors",
										effectiveAutoApprovalEnabled
											? "bg-green-500/15 text-green-400 hover:bg-green-500/25"
											: "bg-[rgba(255,255,255,0.05)] text-vscode-descriptionForeground hover:bg-[rgba(255,255,255,0.1)]",
									)}
									onClick={handleAutoApprovalToggle}
									role="switch"
									aria-checked={effectiveAutoApprovalEnabled}
									tabIndex={0}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault()
											handleAutoApprovalToggle()
										}
									}}>
									{effectiveAutoApprovalEnabled ? (
										<>
											<div className="size-1.5 rounded-full bg-green-400 shrink-0" />
											<span>On</span>
										</>
									) : (
										<>
											<div className="size-1.5 rounded-full bg-vscode-descriptionForeground/50 shrink-0" />
											<span>Off</span>
										</>
									)}
								</div>
							</div>
						</div>
						<button
							onClick={handleOpenSettings}
							className={cn(
								"inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded",
								"text-vscode-descriptionForeground hover:text-vscode-foreground",
								"hover:bg-[rgba(255,255,255,0.05)] transition-colors",
								"focus:outline-none focus-visible:ring-1 focus-visible:ring-vscode-focusBorder",
							)}>
							<Settings className="size-3" />
							<span className="hidden sm:inline">Settings</span>
						</button>
					</div>

					{/* Chip grid */}
					<div className="p-2.5">
						<div className="flex flex-wrap gap-1.5">
							{settingsArray.map(({ key, labelKey, icon }) => {
								const isEnabled = toggles[key]
								return (
									<button
										key={key}
										onClick={() => onAutoApproveToggle(key, !isEnabled)}
										disabled={!effectiveAutoApprovalEnabled}
										data-testid={`auto-approve-${key}`}
										className={cn(
											"inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-medium leading-none",
											"transition-all duration-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-vscode-focusBorder",
											"cursor-pointer select-none",
											isEnabled
												? [
														"bg-vscode-button-background text-vscode-button-foreground",
														"shadow-sm border border-vscode-button-background",
													].join(" ")
												: [
														"bg-transparent text-vscode-foreground",
														"border border-vscode-dropdown-border/30",
														"hover:bg-[rgba(255,255,255,0.04)] hover:border-vscode-dropdown-border/60",
													].join(" "),
											!effectiveAutoApprovalEnabled &&
												"opacity-35 cursor-not-allowed hover:opacity-35 hover:bg-transparent hover:border-vscode-dropdown-border/30",
										)}>
										<span
											className={cn(
												`codicon codicon-${icon} text-xs flex-shrink-0`,
												isEnabled ? "opacity-100" : "opacity-55",
											)}
										/>
										<span>{t(labelKey)}</span>
										{isEnabled && <Check className="size-2.5 ml-0.5 shrink-0 opacity-70" />}
									</button>
								)
							})}
						</div>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	)
}

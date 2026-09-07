import React, { useState, useCallback, useEffect, useMemo } from "react"
import { GitBranch, Check, ChevronDown, Plus } from "lucide-react"

import type { Worktree, WorktreeListResponse } from "@mirror-vs/types"

import { cn } from "@/lib/utils"
import { useMirrorPortal } from "@/components/ui/hooks/useMirrorPortal"
import { Popover, PopoverContent, PopoverTrigger, StandardTooltip, Button, ToggleSwitch } from "@/components/ui"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { vscode } from "@/utils/vscode"

import { CreateWorktreeModal } from "../worktrees/CreateWorktreeModal"
import { IconButton } from "./IconButton"

interface WorktreeSelectorProps {
	disabled?: boolean
	experiments?: Record<string, boolean>
	setExperimentEnabled?: (id: any, enabled: boolean) => void
}

export const WorktreeSelector = ({
	disabled = false,
	experiments: propExperiments,
	setExperimentEnabled: propSetExperimentEnabled,
}: WorktreeSelectorProps) => {
	const { t } = useAppTranslation()
	let extensionState: ReturnType<typeof useExtensionState> | null = null
	try {
		extensionState = useExtensionState()
	} catch {
		// Rendered outside ExtensionStateContextProvider (e.g. unit tests)
	}
	const experiments = propExperiments ?? extensionState?.experiments
	const setExperimentEnabled = propSetExperimentEnabled ?? extensionState?.setExperimentEnabled
	const isSandboxEnabled = !!experiments?.["gitWorktreeSandbox"]
	const [open, setOpen] = useState(false)
	const [worktrees, setWorktrees] = useState<Worktree[]>([])
	const [isGitRepo, setIsGitRepo] = useState(true)
	const [showCreateModal, setShowCreateModal] = useState(false)
	const portalContainer = useMirrorPortal("mirror-portal")

	// Find current worktree
	const currentWorktree = useMemo(() => worktrees.find((w) => w.isCurrent), [worktrees])

	// Fetch worktrees when popover opens
	const fetchWorktrees = useCallback(() => {
		vscode.postMessage({ type: "listWorktrees" })
	}, [])

	// Handle messages from extension
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data
			if (message.type === "worktreeList") {
				const response: WorktreeListResponse = message
				setWorktrees(response.worktrees || [])
				setIsGitRepo(response.isGitRepo)
			}
		}

		window.addEventListener("message", handleMessage)
		return () => window.removeEventListener("message", handleMessage)
	}, [])

	// Initial fetch and refresh on open
	useEffect(() => {
		fetchWorktrees()
	}, [fetchWorktrees])

	useEffect(() => {
		if (open) {
			fetchWorktrees()
		}
	}, [open, fetchWorktrees])

	const handleSelect = useCallback((worktreePath: string) => {
		vscode.postMessage({
			type: "switchWorktree",
			worktreePath: worktreePath,
			worktreeNewWindow: false,
		})
		setOpen(false)
	}, [])

	const handleSettingsClick = useCallback(() => {
		vscode.postMessage({
			type: "switchTab",
			tab: "settings",
			values: { section: "worktrees" },
		})
		setOpen(false)
	}, [])

	// Don't render if not a git repo
	if (!isGitRepo) {
		return null
	}

	const title = t("worktrees:selector.tooltip")

	return (
		<Popover open={open} onOpenChange={setOpen} data-testid="worktree-selector-root">
			<StandardTooltip content={title}>
				<PopoverTrigger
					disabled={disabled}
					data-testid="worktree-selector-trigger"
					className={cn(
						"inline-flex gap-1.5 items-center relative whitespace-nowrap px-2.5 py-1",
						"bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] rounded-md text-vscode-foreground text-left text-xs",
						"transition-all duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-vscode-focusBorder focus-visible:ring-inset",
						disabled
							? "opacity-50 cursor-not-allowed"
							: "opacity-85 hover:opacity-100 hover:bg-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.15)] cursor-pointer",
					)}>
					<span className="font-semibold">{t("worktrees:selector.worktree")}:</span>
					<GitBranch className="w-3 h-3 text-mirror-brand-via" />
					<span className="truncate max-w-[140px]">{currentWorktree?.branch || t("worktrees:noBranch")}</span>
					{isSandboxEnabled && (
						<span className="text-[10px] px-1 py-0.2 bg-mirror-brand-from/20 text-mirror-brand-to border border-mirror-brand-from/30 rounded">
							sandbox
						</span>
					)}
					<ChevronDown className="size-3 opacity-60" />
				</PopoverTrigger>
			</StandardTooltip>
			<PopoverContent
				align="start"
				sideOffset={4}
				container={portalContainer}
				className="p-0 overflow-hidden min-w-80 max-w-9/10">
				<div className="flex flex-col w-full">
					{/* Header with settings cog and title */}
					<div className="px-3 pt-3 pb-2 border-b border-vscode-panel-border">
						<div className="flex flex-row items-center justify-between">
							<div className="flex items-center gap-1.5">
								<GitBranch className="size-3.5 text-mirror-brand-via" />
								<h4 className="font-semibold text-xs text-vscode-foreground m-0">
									{t("worktrees:selector.title")}
								</h4>
							</div>
							<IconButton
								iconClass="codicon-settings-gear"
								title={t("worktrees:selector.settings")}
								onClick={handleSettingsClick}
							/>
						</div>
						<p className="m-0 mt-0.5 text-xs text-vscode-descriptionForeground">
							{t("worktrees:selector.description")}
						</p>
					</div>

					{/* Task Sandbox Isolation Option */}
					<div className="px-3 py-2 border-b border-vscode-panel-border bg-vscode-editor-background/40 flex items-center justify-between gap-2">
						<div className="flex flex-col pr-2">
							<span className="text-xs font-semibold text-vscode-foreground">
								{t("worktrees:taskIsolation.title")}
							</span>
							<span className="text-[11px] text-vscode-descriptionForeground">
								{isSandboxEnabled
									? t("worktrees:taskIsolation.enabledShort")
									: t("worktrees:taskIsolation.disabledShort")}
							</span>
						</div>
						<ToggleSwitch
							checked={isSandboxEnabled}
							onChange={() => setExperimentEnabled?.("gitWorktreeSandbox", !isSandboxEnabled)}
						/>
					</div>

					{/* Worktree list */}
					<div className="max-h-[260px] overflow-y-auto py-1">
						{worktrees.map((worktree) => {
							const isSelected = worktree.isCurrent
							return (
								<div
									key={worktree.path}
									onClick={() => !isSelected && handleSelect(worktree.path)}
									data-testid="worktree-selector-item"
									className={cn(
										"px-3 py-2 text-sm cursor-pointer flex items-center gap-2",
										"hover:bg-vscode-list-hoverBackground transition-colors",
										isSelected &&
											"bg-vscode-list-activeSelectionBackground text-vscode-list-activeSelectionForeground",
									)}>
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-2">
											<GitBranch className="w-3.5 h-3.5 shrink-0 text-vscode-descriptionForeground" />
											<span className="font-semibold truncate">
												{worktree.branch || t("worktrees:noBranch")}
											</span>
											{worktree.isBare && (
												<span className="text-xs opacity-70 border border-vscode-editorGroup-border px-1 rounded">
													{t("worktrees:primary")}
												</span>
											)}
										</div>
										<div className="text-xs opacity-75 ml-5 truncate">{worktree.path}</div>
									</div>
									{isSelected && <Check className="ml-auto size-4 p-0.5 shrink-0" />}
								</div>
							)
						})}
					</div>

					{/* New worktree button */}
					<div className="px-3 py-2 border-t border-vscode-panel-border bg-vscode-sideBar-background/50">
						<Button
							variant="secondary"
							size="sm"
							className="w-full justify-start text-xs font-medium"
							onClick={() => {
								setShowCreateModal(true)
								setOpen(false)
							}}>
							<Plus className="w-3.5 h-3.5 mr-1.5" />
							{t("worktrees:newWorktree")}
						</Button>
					</div>
				</div>
			</PopoverContent>

			{/* Create Worktree Modal */}
			{showCreateModal && (
				<CreateWorktreeModal
					open={showCreateModal}
					onClose={() => setShowCreateModal(false)}
					openAfterCreate={true}
					onSuccess={() => {
						setShowCreateModal(false)
						fetchWorktrees()
					}}
				/>
			)}
		</Popover>
	)
}

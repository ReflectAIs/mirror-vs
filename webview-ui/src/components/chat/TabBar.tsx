import { memo, useCallback, useState } from "react"
import { Plus, X, HelpCircle, Share2, GitBranch } from "lucide-react"

import type { TabInfo, TabStatus } from "@mirror-vs/types"

import { cn } from "@src/lib/utils"
import { vscode } from "@src/utils/vscode"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@src/components/ui/alert-dialog"
import SessionTutorialModal from "./SessionTutorialModal"
import SharedContextDialog from "./SharedContextDialog"
import BranchWorkspaceDialog from "./BranchWorkspaceDialog"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMascotForTab(status: TabStatus, hasPendingApproval?: boolean) {
	if (hasPendingApproval || status === "interactive") {
		return {
			dotClass: "w-2 h-2 rounded-full bg-amber-400 animate-ping shrink-0",
			ringClass: "w-2 h-2 rounded-full bg-amber-400/30 shrink-0",
			title: "Waiting for your input / approval",
		}
	}
	switch (status) {
		case "streaming":
			return {
				dotClass: "w-2 h-2 rounded-full bg-mirror-brand-via animate-pulse shrink-0",
				ringClass: "w-2 h-2 rounded-full bg-purple-500/20 shrink-0",
				title: "Thinking & Generating...",
			}
		case "completed":
			return {
				dotClass: "w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0",
				ringClass: "w-1.5 h-1.5 rounded-full bg-emerald-400/20 shrink-0",
				title: "Task complete",
			}
		case "error":
			return {
				dotClass: "w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0",
				ringClass: "w-1.5 h-1.5 rounded-full bg-rose-400/20 shrink-0",
				title: "Encountered an issue",
			}
		case "idle":
		default:
			return {
				dotClass: "w-1.5 h-1.5 rounded-full bg-white/20 shrink-0",
				ringClass: "w-1.5 h-1.5 rounded-full bg-transparent shrink-0",
				title: "Ready",
			}
	}
}

// ---------------------------------------------------------------------------
// Close Confirmation Dialog
// ---------------------------------------------------------------------------

interface CloseConfirmState {
	isOpen: boolean
	taskId: string
	title: string
	status: TabStatus
}

const initialCloseConfirm: CloseConfirmState = {
	isOpen: false,
	taskId: "",
	title: "",
	status: "idle",
}

// ---------------------------------------------------------------------------
// TabBar Component
// ---------------------------------------------------------------------------

export interface TabBarProps {
	tabs: TabInfo[]
	activeTabId: string
}

const TabBar = ({ tabs, activeTabId }: TabBarProps) => {
	const {
		currentSessionId,
		sessionNames,
		sessionNotes,
		sessionSharedContexts,
		workspaceFolders,
		currentWorkspacePath,
	} = useExtensionState()
	const [closeConfirm, setCloseConfirm] = useState<CloseConfirmState>(initialCloseConfirm)
	const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
	const [editingTabTitle, setEditingTabTitle] = useState("")
	const [showTutorial, setShowTutorial] = useState(false)
	const [showSharedContext, setShowSharedContext] = useState(false)
	const [showBranchDialog, setShowBranchDialog] = useState(false)

	const handleTabClick = useCallback(
		(taskId: string) => {
			if (taskId !== activeTabId) {
				vscode.postMessage({ type: "switchTaskTab", taskId })
			}
		},
		[activeTabId],
	)

	const handleSaveTabTitle = useCallback(
		(taskId: string) => {
			setEditingTaskId(null)
			const trimmed = editingTabTitle.trim()
			if (trimmed) {
				vscode.postMessage({
					type: "renameTask",
					taskId,
					sessionName: trimmed,
				})
			}
		},
		[editingTabTitle],
	)

	const handleCloseClick = useCallback(
		(e: React.MouseEvent | React.KeyboardEvent, tab: TabInfo) => {
			e.stopPropagation()

			// Active task with streaming/interactive status — confirm with user
			if (tab.taskId === activeTabId && (tab.status === "streaming" || tab.status === "interactive")) {
				setCloseConfirm({
					isOpen: true,
					taskId: tab.taskId,
					title: tab.title,
					status: tab.status,
				})
				return
			}

			// Everything else — close immediately
			vscode.postMessage({ type: "closeTaskTab", taskId: tab.taskId })
		},
		[activeTabId],
	)

	const handleConfirmClose = useCallback(() => {
		vscode.postMessage({ type: "closeTaskTab", taskId: closeConfirm.taskId })
		setCloseConfirm(initialCloseConfirm)
	}, [closeConfirm.taskId])

	const handleCancelClose = useCallback(() => {
		setCloseConfirm(initialCloseConfirm)
	}, [])

	const handleNewTab = useCallback(() => {
		vscode.postMessage({ type: "newTask", text: "", images: [] })
	}, [])

	return (
		<>
			<div className="flex items-center justify-between border-b border-vscode-panel-border bg-vscode-sideBar-background shrink-0 select-none">
				{/* Tabs scroll area */}
				<div className="flex items-center gap-0 overflow-x-auto min-w-0 flex-1">
					{/* "+" button to create a new task/tab */}
					<button
						onClick={handleNewTab}
						className={cn(
							"flex items-center justify-center px-2.5 py-2 text-xs cursor-pointer border-r border-vscode-panel-border transition-colors shrink-0",
							"bg-transparent text-vscode-descriptionForeground hover:text-vscode-foreground hover:bg-vscode-list-hoverBackground",
						)}
						title="New tab in this session (Cmd/Ctrl+N)"
						aria-label="New tab">
						<Plus className="w-4 h-4" />
					</button>
					{tabs.map((tab) => {
						const isActive = tab.taskId === activeTabId
						const mascot = getMascotForTab(tab.status, tab.hasPendingApproval)
						const isEditingThisTab = editingTaskId === tab.taskId

						return (
							<div
								key={tab.taskId}
								className={cn(
									"group flex items-center gap-2 px-2.5 py-1 text-xs rounded-md transition-all duration-150 whitespace-nowrap shrink-0 min-w-0 max-w-[180px]",
									isActive
										? "bg-white/[0.08] text-vscode-foreground border border-white/10 shadow-sm"
										: "bg-transparent text-vscode-descriptionForeground hover:text-vscode-foreground hover:bg-white/[0.04]",
								)}
								title={tab.title}>
								{/* Clickable area: icon + title (or edit input) */}
								<div
									onClick={() => handleTabClick(tab.taskId)}
									onDoubleClick={(e) => {
										e.stopPropagation()
										setEditingTaskId(tab.taskId)
										setEditingTabTitle(tab.title)
									}}
									className="flex items-center gap-1.5 flex-1 min-w-0 text-left bg-transparent border-none cursor-pointer p-0 text-inherit">
									<div className="relative flex items-center justify-center">
										<span className={mascot.dotClass} />
									</div>
									{isEditingThisTab ? (
										<input
											type="text"
											value={editingTabTitle}
											onChange={(e) => setEditingTabTitle(e.target.value)}
											onKeyDown={(e) => {
												if (e.key === "Enter") handleSaveTabTitle(tab.taskId)
												if (e.key === "Escape") setEditingTaskId(null)
											}}
											onBlur={() => handleSaveTabTitle(tab.taskId)}
											autoFocus
											onClick={(e) => e.stopPropagation()}
											className="text-xs px-1 py-0 rounded bg-vscode-input-background text-vscode-input-foreground border border-vscode-focusBorder outline-none w-full"
										/>
									) : (
										<span className="truncate flex-1 font-medium text-[11px]">{tab.title}</span>
									)}
								</div>
								{/* Close button - separate from clickable area */}
								<span
									onMouseDown={(e) => {
										e.stopPropagation()
										e.preventDefault()
										handleCloseClick(e, tab)
									}}
									onClick={(e) => {
										e.stopPropagation()
										e.preventDefault()
									}}
									className="shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-white/10 text-vscode-descriptionForeground hover:text-vscode-foreground transition-all cursor-pointer"
									role="button"
									aria-label={`Close ${tab.title}`}
									tabIndex={0}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault()
											handleCloseClick(e, tab)
										}
									}}>
									<X className="w-3 h-3" />
								</span>
							</div>
						)
					})}
				</div>

				{/* Right action icons: Branch to Workspace, Shared Context Inspector & Tutorial button */}
				<div className="flex items-center gap-1 px-2 shrink-0 border-l border-vscode-panel-border bg-vscode-sideBar-background">
					<button
						onClick={() => setShowBranchDialog(true)}
						className="p-1 rounded text-vscode-descriptionForeground hover:text-vscode-foreground hover:bg-vscode-list-hoverBackground cursor-pointer transition-colors"
						title="Branch Active Chat to Another Workspace..."
						aria-label="Branch Chat to Workspace">
						<GitBranch className="w-3.5 h-3.5" />
					</button>
					<button
						onClick={() => setShowSharedContext(true)}
						className="p-1 rounded text-vscode-descriptionForeground hover:text-vscode-foreground hover:bg-vscode-list-hoverBackground cursor-pointer transition-colors"
						title="Inspect Shared Session Context"
						aria-label="Shared Session Context">
						<Share2 className="w-3.5 h-3.5" />
					</button>
					<button
						onClick={() => setShowTutorial(true)}
						className="p-1 rounded text-vscode-descriptionForeground hover:text-vscode-foreground hover:bg-vscode-list-hoverBackground cursor-pointer transition-colors"
						title="How Sessions & Tabs Work (Tutorial)"
						aria-label="How Tabs Work Tutorial">
						<HelpCircle className="w-3.5 h-3.5" />
					</button>
				</div>
			</div>

			{/* Branch Chat to Workspace Dialog */}
			<BranchWorkspaceDialog
				isOpen={showBranchDialog}
				onClose={() => setShowBranchDialog(false)}
				currentTaskId={activeTabId}
				workspaceFolders={workspaceFolders}
				currentWorkspacePath={currentWorkspacePath}
			/>

			{/* Session Tutorial Modal */}
			<SessionTutorialModal isOpen={showTutorial} onClose={() => setShowTutorial(false)} />

			{/* Shared Context Inspector Dialog */}
			<SharedContextDialog
				isOpen={showSharedContext}
				onClose={() => setShowSharedContext(false)}
				tabs={tabs}
				activeTabId={activeTabId}
				currentSessionId={currentSessionId}
				sessionNames={sessionNames}
				sessionNotes={sessionNotes}
				sessionSharedContexts={sessionSharedContexts}
			/>

			{/* Close confirmation dialog for active streaming/interactive tasks */}
			<AlertDialog
				open={closeConfirm.isOpen}
				onOpenChange={(open) => !open && setCloseConfirm(initialCloseConfirm)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Close Tab</AlertDialogTitle>
						<AlertDialogDescription>
							{closeConfirm.status === "streaming"
								? `"${closeConfirm.title}" is currently streaming. Closing it will abort the in-progress operation. Are you sure?`
								: `"${closeConfirm.title}" is waiting for your approval. Closing it will abort the tab. Are you sure?`}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel onClick={handleCancelClose}>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={handleConfirmClose}>Close</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	)
}

export default memo(TabBar)

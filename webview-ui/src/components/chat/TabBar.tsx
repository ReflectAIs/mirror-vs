import { memo, useCallback, useState } from "react"
import { Plus, Loader2, Circle, CheckCircle2, AlertCircle, Ban, X } from "lucide-react"

import type { TabInfo, TabStatus } from "@mirror-vs/types"

import { cn } from "@src/lib/utils"
import { vscode } from "@src/utils/vscode"
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMascotForTab(status: TabStatus, hasPendingApproval?: boolean) {
	if (hasPendingApproval || status === "interactive") {
		return {
			symbol: "(•_•;)",
			className: "text-yellow-400 font-mono text-[10px] font-bold tracking-tighter shrink-0 animate-pulse",
			title: "Model asks a followup / waiting approval",
		}
	}
	switch (status) {
		case "streaming":
			return {
				symbol: "(•̀ᴗ•́)⚡",
				className: "text-purple-400 font-mono text-[10px] font-bold tracking-tighter shrink-0 animate-pulse",
				title: "Model is working",
			}
		case "completed":
			return {
				symbol: "(★‿★)",
				className: "text-green-500 font-mono text-[10px] font-bold tracking-tighter shrink-0",
				title: "Task complete",
			}
		case "error":
			return {
				symbol: "(x_x)",
				className: "text-red-500 font-mono text-[10px] font-bold tracking-tighter shrink-0",
				title: "Model is stuck / error",
			}
		case "idle":
		default:
			return {
				symbol: "(•‿•)",
				className:
					"text-vscode-descriptionForeground font-mono text-[10px] font-medium tracking-tighter shrink-0 opacity-80",
				title: "Idle",
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
	const [closeConfirm, setCloseConfirm] = useState<CloseConfirmState>(initialCloseConfirm)
	const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
	const [editingTabTitle, setEditingTabTitle] = useState("")

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
		(e: React.MouseEvent, tab: TabInfo) => {
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
			<div className="flex items-center gap-0 overflow-x-auto border-b border-vscode-panel-border bg-vscode-sideBar-background shrink-0 select-none">
				{/* "+" button to create a new task/tab */}
				<button
					onClick={handleNewTab}
					className={cn(
						"flex items-center justify-center px-2 py-2 text-xs cursor-pointer border-r border-vscode-panel-border transition-colors shrink-0",
						"bg-transparent text-vscode-descriptionForeground hover:text-vscode-foreground hover:bg-vscode-list-hoverBackground",
					)}
					title="New tab"
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
								"flex items-center gap-1.5 px-3 py-1.5 text-xs border-r border-vscode-panel-border transition-colors whitespace-nowrap shrink-0 min-w-0 max-w-[200px]",
								isActive
									? "bg-vscode-sideBarSticky-background text-vscode-foreground border-b-2 border-b-vscode-focusBorder"
									: "bg-transparent text-vscode-descriptionForeground hover:text-vscode-foreground hover:bg-vscode-list-hoverBackground",
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
								<span className={mascot.className}>{mascot.symbol}</span>
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
									<span className="truncate flex-1">{tab.title}</span>
								)}
								{tab.hasPendingApproval && (
									<span className="w-1.5 h-1.5 rounded-full bg-vscode-testing-iconFailed shrink-0" />
								)}
							</div>
							{/* Close button - separate from clickable area */}
							<span
								onClick={(e) => handleCloseClick(e, tab)}
								className="shrink-0 p-0.5 rounded hover:bg-vscode-toolbar-activeBackground text-vscode-descriptionForeground hover:text-vscode-foreground ml-1 cursor-pointer"
								role="button"
								aria-label={`Close ${tab.title}`}
								tabIndex={0}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										e.preventDefault()
										handleCloseClick(e as unknown as React.MouseEvent, tab)
									}
								}}>
								<X className="w-3 h-3" />
							</span>
						</div>
					)
				})}
			</div>

			{/* Close confirmation dialog for active streaming/interactive tasks */}
			<AlertDialog
				open={closeConfirm.isOpen}
				onOpenChange={(open) => !open && setCloseConfirm(initialCloseConfirm)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Close Task</AlertDialogTitle>
						<AlertDialogDescription>
							{closeConfirm.status === "streaming"
								? `"${closeConfirm.title}" is currently streaming. Closing it will abort the in-progress operation. Are you sure?`
								: `"${closeConfirm.title}" is waiting for your approval. Closing it will abort the task. Are you sure?`}
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

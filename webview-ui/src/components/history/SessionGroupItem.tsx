import { memo, useState, useCallback, useRef, useEffect } from "react"
import { ChevronRight, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatTimeAgo } from "@/utils/format"
import type { SessionGroup } from "./types"
import TaskItem from "./TaskItem"

interface SessionGroupItemProps {
	/** The session group to render */
	session: SessionGroup
	/** Display variant */
	variant: "compact" | "full"
	/** Whether to show workspace info */
	showWorkspace?: boolean
	/** Whether selection mode is active */
	isSelectionMode?: boolean
	/** Set of selected task IDs */
	selectedTaskIds: Set<string>
	/** Callback when selection state changes */
	onToggleSelection?: (taskId: string, isSelected: boolean) => void
	/** Callback when delete is requested */
	onDelete?: (taskId: string) => void
	/** Callback when session expand/collapse is toggled */
	onToggleExpand: () => void
	/** Callback to rename the session */
	onRenameSession: (newName: string) => void
	/** Callback to delete the entire session (all its tabs) */
	onDeleteSession?: () => void
	/** Custom display names for tabs (from taskNames map) */
	taskNames?: Record<string, string>
	/** Callback to rename a tab */
	onRenameTab?: (taskId: string, newName: string) => void
	/** Optional className for styling */
	className?: string
}

/**
 * Renders a session group with a collapsible header and a flat list of tabs inside.
 *
 * - Single-click on the header toggles expand/collapse
 * - Double-click on the session name opens inline rename
 * - Rename commits on Enter or blur; reverts on Escape
 */
const SessionGroupItem = ({
	session,
	variant,
	showWorkspace = false,
	isSelectionMode = false,
	selectedTaskIds,
	onToggleSelection,
	onDelete,
	onToggleExpand,
	onRenameSession,
	onDeleteSession,
	taskNames,
	onRenameTab,
	className,
}: SessionGroupItemProps) => {
	const { sessionId, sessionName, tabs, taskCount, isExpanded } = session
	const [isRenaming, setIsRenaming] = useState(false)
	const [renameValue, setRenameValue] = useState(sessionName)
	const inputRef = useRef<HTMLInputElement>(null)

	// Focus the input when rename mode activates
	useEffect(() => {
		if (isRenaming && inputRef.current) {
			inputRef.current.focus()
			inputRef.current.select()
		}
	}, [isRenaming])

	const handleDoubleClick = useCallback(() => {
		if (isSelectionMode) return
		setRenameValue(sessionName)
		setIsRenaming(true)
	}, [isSelectionMode, sessionName])

	const commitRename = useCallback(() => {
		const trimmed = renameValue.trim()
		if (trimmed && trimmed !== sessionName) {
			onRenameSession(trimmed)
		}
		setIsRenaming(false)
	}, [renameValue, sessionName, onRenameSession])

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLInputElement>) => {
			if (e.key === "Enter") {
				e.preventDefault()
				commitRename()
			} else if (e.key === "Escape") {
				setRenameValue(sessionName)
				setIsRenaming(false)
			}
		},
		[commitRename, sessionName],
	)

	// Compute timestamp range for display
	const newestTs = session.newestTs
	const oldestTs = tabs.length > 0 ? tabs[0].ts : newestTs
	const timeLabel =
		tabs.length > 0 ? `${formatTimeAgo(oldestTs)} – ${formatTimeAgo(newestTs)}` : formatTimeAgo(newestTs)

	return (
		<div
			data-testid={`session-group-${sessionId}`}
			className={cn(
				"bg-vscode-editor-background rounded-xl border border-vscode-panel-border/20 overflow-hidden",
				className,
			)}>
			{/* Collapsible session header */}
			<div
				className={cn(
					"group flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none",
					"bg-vscode-sideBar-background/20 border-b border-vscode-panel-border/10",
					"hover:bg-vscode-sideBar-background/40 transition-colors",
				)}
				onClick={onToggleExpand}
				role="button"
				aria-expanded={isExpanded}
				aria-label={`${sessionName} — ${taskCount} tab${taskCount !== 1 ? "s" : ""}`}
				tabIndex={0}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault()
						onToggleExpand()
					}
				}}>
				{/* Chevron */}
				<ChevronRight
					className={cn(
						"size-4 shrink-0 text-vscode-descriptionForeground transition-transform duration-200",
						isExpanded && "rotate-90",
					)}
				/>

				{/* Session name — inline editable */}
				{isRenaming ? (
					<input
						ref={inputRef}
						className={cn(
							"flex-1 min-w-0 bg-vscode-input-background text-vscode-input-foreground",
							"border border-vscode-input-border rounded px-1.5 py-0.5 text-xs font-medium",
							"outline-none focus:border-mirror-brand-via/60",
						)}
						value={renameValue}
						onChange={(e) => setRenameValue(e.target.value)}
						onBlur={commitRename}
						onKeyDown={handleKeyDown}
						onClick={(e) => e.stopPropagation()}
					/>
				) : (
					<span
						className="flex-1 min-w-0 text-xs font-semibold text-vscode-foreground truncate"
						onDoubleClick={handleDoubleClick}
						title={`${tabs.length > 0 ? timeLabel : ""}`}>
						{sessionName}
					</span>
				)}

				{/* Task count badge */}
				<span className="shrink-0 text-[10px] text-vscode-descriptionForeground/60 bg-vscode-sideBar-background/40 rounded-full px-2 py-0.5">
					{taskCount} tab{taskCount !== 1 ? "s" : ""}
				</span>

				{/* Timestamp */}
				<span className="shrink-0 text-[10px] text-vscode-descriptionForeground/40 whitespace-nowrap">
					{timeLabel}
				</span>

				{/* Delete session button — only shown when there are tabs */}
				{taskCount > 0 && !isSelectionMode && onDeleteSession && (
					<button
						onClick={(e) => {
							e.stopPropagation()
							onDeleteSession()
						}}
						className={cn(
							"shrink-0 p-1 rounded-md border border-transparent",
							"text-vscode-descriptionForeground/40 hover:text-vscode-errorForeground",
							"hover:bg-vscode-input-background/50 hover:border-vscode-panel-border/30",
							"opacity-0 group-hover:opacity-100 transition-all duration-150",
						)}
						aria-label="Delete session"
						title="Delete session">
						<Trash2 className="size-3.5" />
					</button>
				)}
			</div>

			{/* Expanded tab list */}
			<div
				className={cn(
					"overflow-clip transition-all duration-300",
					isExpanded ? "max-h-[6000px] pb-2" : "max-h-0",
				)}
				data-testid="session-tab-list">
				{tabs.map((tab) => (
					<TaskItem
						key={tab.id}
						item={tab}
						variant={variant}
						showWorkspace={showWorkspace}
						isSelectionMode={isSelectionMode}
						isSelected={selectedTaskIds.has(tab.id)}
						onToggleSelection={onToggleSelection}
						onDelete={onDelete}
						displayName={taskNames?.[tab.id]}
						onRenameTab={onRenameTab}
					/>
				))}
			</div>
		</div>
	)
}

export default memo(SessionGroupItem)

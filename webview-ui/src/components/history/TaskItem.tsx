import { memo, useState, useCallback, useRef, useEffect } from "react"
import { ArrowRight, Folder } from "lucide-react"
import type { DisplayHistoryItem } from "./types"

import { vscode } from "@/utils/vscode"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"

import TaskItemFooter from "./TaskItemFooter"
import { StandardTooltip } from "../ui"

interface TaskItemProps {
	item: DisplayHistoryItem
	variant: "compact" | "full"
	showWorkspace?: boolean
	hasSubtasks?: boolean
	isSelectionMode?: boolean
	isSelected?: boolean
	onToggleSelection?: (taskId: string, isSelected: boolean) => void
	onDelete?: (taskId: string) => void
	/** Custom display name for the tab (from taskNames map) */
	displayName?: string
	/** Callback to rename the tab */
	onRenameTab?: (taskId: string, newName: string) => void
	className?: string
}

const TaskItem = ({
	item,
	variant,
	showWorkspace = false,
	hasSubtasks = false,
	isSelectionMode = false,
	isSelected = false,
	onToggleSelection,
	onDelete,
	displayName,
	onRenameTab,
	className,
}: TaskItemProps) => {
	const [isRenaming, setIsRenaming] = useState(false)
	const [renameValue, setRenameValue] = useState(displayName || "")
	const inputRef = useRef<HTMLInputElement>(null)
	const blurTimeoutRef = useRef<ReturnType<typeof setTimeout>>()

	// Keep rename value in sync when displayName changes externally
	useEffect(() => {
		if (!isRenaming) {
			setRenameValue(displayName || "")
		}
	}, [displayName, isRenaming])

	// Focus the input when rename mode activates
	useEffect(() => {
		if (isRenaming && inputRef.current) {
			inputRef.current.focus()
			inputRef.current.select()
		}
	}, [isRenaming])

	const handleClick = () => {
		if (isSelectionMode && onToggleSelection) {
			onToggleSelection(item.id, !isSelected)
		} else {
			vscode.postMessage({ type: "showTaskWithId", text: item.id })
		}
	}

	const handleDoubleClick = useCallback(() => {
		if (isSelectionMode) return
		setRenameValue(displayName || item.task || "")
		setIsRenaming(true)
	}, [isSelectionMode, displayName, item.task])

	const commitRename = useCallback(() => {
		const trimmed = renameValue.trim()
		if (trimmed && onRenameTab) {
			onRenameTab(item.id, trimmed)
		}
		setIsRenaming(false)
	}, [renameValue, onRenameTab, item.id])

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLInputElement>) => {
			if (e.key === "Enter") {
				e.preventDefault()
				clearTimeout(blurTimeoutRef.current)
				commitRename()
			} else if (e.key === "Escape") {
				clearTimeout(blurTimeoutRef.current)
				setRenameValue(displayName || "")
				setIsRenaming(false)
			}
		},
		[commitRename, displayName],
	)

	const handleBlur = useCallback(() => {
		// Use a small timeout so that click events on the input don't get lost
		blurTimeoutRef.current = setTimeout(() => {
			commitRename()
		}, 100)
	}, [commitRename])

	// Cleanup timeout on unmount
	useEffect(() => {
		return () => {
			clearTimeout(blurTimeoutRef.current)
		}
	}, [])

	const isCompact = variant === "compact"
	const effectiveDisplayName = displayName || undefined

	return (
		<div
			key={item.id}
			data-testid={`task-item-${item.id}`}
			className={cn(
				"cursor-pointer group relative overflow-hidden rounded-md p-2 bg-vscode-sideBar-background/30 hover:bg-vscode-sideBar-background/60 border border-vscode-panel-border/30 hover:border-mirror-brand-via/40 transition-all duration-150 my-1 mx-2",
				"text-vscode-foreground/80 hover:text-vscode-foreground",
				className,
			)}
			onClick={handleClick}>
			<div className="flex gap-2.5 p-1">
				{/* Selection checkbox - only in full variant */}
				{!isCompact && isSelectionMode && (
					<div
						className="task-checkbox mt-0.5"
						onClick={(e) => {
							e.stopPropagation()
						}}>
						<Checkbox
							checked={isSelected}
							onCheckedChange={(checked: boolean) => onToggleSelection?.(item.id, checked === true)}
							variant="description"
						/>
					</div>
				)}

				<div className="flex-1 min-w-0">
					<div className="flex items-start gap-1 justify-between">
						{/* Inline rename input — on double-click */}
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
								onBlur={handleBlur}
								onKeyDown={handleKeyDown}
								onClick={(e) => e.stopPropagation()}
							/>
						) : item.highlight ? (
							<div
								className="flex-1 min-w-0 overflow-hidden whitespace-pre-wrap font-light text-ellipsis line-clamp-2 text-xs"
								data-testid="task-content"
								onDoubleClick={handleDoubleClick}
								dangerouslySetInnerHTML={{ __html: item.highlight }}
							/>
						) : (
							<div
								className="flex-1 min-w-0 overflow-hidden whitespace-pre-wrap font-light text-ellipsis line-clamp-2 text-xs"
								data-testid="task-content"
								onDoubleClick={handleDoubleClick}>
								<StandardTooltip content={item.task}>
									<span>{effectiveDisplayName || item.task}</span>
								</StandardTooltip>
							</div>
						)}
						{/* Arrow icon that appears on hover */}
						<ArrowRight className="size-3.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 text-mirror-brand-via" />
					</div>

					{showWorkspace && item.workspace && (
						<div className="flex items-center font-mono gap-1 text-vscode-descriptionForeground text-[10px] mt-0.5">
							<Folder className="size-2.5" />
							<span>{item.workspace}</span>
						</div>
					)}

					<div className="mt-1">
						<TaskItemFooter
							item={item}
							variant={variant}
							isSelectionMode={isSelectionMode}
							onDelete={onDelete}
						/>
					</div>
				</div>
			</div>
		</div>
	)
}

export default memo(TaskItem)

import React, { memo, useState, useCallback } from "react"
import { cn } from "@/lib/utils"
import { DeleteTaskDialog } from "./DeleteTaskDialog"
import { BatchDeleteTaskDialog } from "./BatchDeleteTaskDialog"
import { Virtuoso } from "react-virtuoso"

import {
	Button,
	Checkbox,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	StandardTooltip,
} from "@/components/ui"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { vscode } from "@/utils/vscode"

import { Tab, TabContent, TabHeader } from "../common/Tab"
import { useTaskSearch } from "./useTaskSearch"
import { useGroupedTasks } from "./useGroupedTasks"
import TaskItem from "./TaskItem"
import SessionGroupItem from "./SessionGroupItem"

type HistoryViewProps = {
	onDone: () => void
}

type SortOption = "newest" | "oldest" | "mostExpensive" | "mostTokens" | "mostRelevant"

const HistoryView = ({ onDone }: HistoryViewProps) => {
	const {
		tasks,
		searchQuery,
		setSearchQuery,
		sortOption,
		setSortOption,
		setLastNonRelevantSort,
		showAllWorkspaces,
		setShowAllWorkspaces,
	} = useTaskSearch()
	const { t } = useAppTranslation()
	const { sessionNames, taskNames } = useExtensionState()

	// Use grouped tasks hook — returns session groups
	const { sessionGroups, flatTasks, toggleSessionExpand, setSessionName, isSearchMode } = useGroupedTasks(
		tasks,
		searchQuery,
		sessionNames ?? {},
		sortOption,
	)

	// Handle tab rename
	const handleRenameTab = useCallback((taskId: string, newName: string) => {
		vscode.postMessage({ type: "renameTask", taskId, sessionName: newName })
	}, [])

	const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null)
	const [isSelectionMode, setIsSelectionMode] = useState(false)
	const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
	const [showBatchDeleteDialog, setShowBatchDeleteDialog] = useState<boolean>(false)

	// Handle delete
	const handleDelete = useCallback((taskId: string) => {
		setDeleteTaskId(taskId)
	}, [])

	// Toggle selection mode
	const toggleSelectionMode = useCallback(() => {
		setIsSelectionMode((prev) => {
			if (prev) {
				setSelectedTaskIds(new Set())
			}
			return !prev
		})
	}, [])

	// Toggle selection for a single task
	const toggleTaskSelection = useCallback((taskId: string, isSelected: boolean) => {
		setSelectedTaskIds((prev) => {
			const next = new Set(prev)
			if (isSelected) {
				next.add(taskId)
			} else {
				next.delete(taskId)
			}
			return next
		})
	}, [])

	// Toggle select all tasks
	const toggleSelectAll = useCallback(
		(selectAll: boolean) => {
			if (selectAll) {
				setSelectedTaskIds(new Set(tasks.map((task) => task.id)))
			} else {
				setSelectedTaskIds(new Set())
			}
		},
		[tasks],
	)

	// Handle batch delete button click
	const handleBatchDelete = useCallback(() => {
		if (selectedTaskIds.size > 0) {
			setShowBatchDeleteDialog(true)
		}
	}, [selectedTaskIds])

	return (
		<Tab>
			<TabHeader className="flex flex-col gap-2.5 px-4 pt-3 pb-1 border-b border-vscode-panel-border/30 bg-vscode-sideBar-background/25">
				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-1.5">
						<Button
							variant="ghost"
							className="p-0 flex items-center justify-center h-6 w-6 hover:bg-vscode-list-hoverBackground"
							onClick={onDone}
							aria-label={t("history:done")}
							data-testid="history-done-button">
							<span className="codicon codicon-arrow-left text-xs flex items-center justify-center" />
							<span className="sr-only">{t("history:done")}</span>
						</Button>
						<h3 className="text-vscode-foreground font-semibold text-[13px] tracking-wide m-0">
							{t("history:history")}
						</h3>
					</div>
					<StandardTooltip
						content={
							isSelectionMode ? `${t("history:exitSelectionMode")}` : `${t("history:enterSelectionMode")}`
						}>
						<Button
							variant="ghost"
							className={cn(
								"h-6 px-2 text-[10px] flex items-center gap-1 rounded-full border transition-all duration-150 font-medium",
								isSelectionMode
									? "bg-mirror-brand-via/15 text-vscode-foreground border-mirror-brand-via/40"
									: "bg-vscode-sideBar-background/30 text-vscode-descriptionForeground border-vscode-panel-border/30 hover:border-mirror-brand-via/40 hover:text-vscode-foreground",
							)}
							onClick={toggleSelectionMode}
							data-testid="toggle-selection-mode-button">
							<span
								className={`codicon ${isSelectionMode ? "codicon-check-all" : "codicon-checklist"} text-[10px]`}
							/>
							<span>{isSelectionMode ? t("history:exitSelection") : t("history:selectionMode")}</span>
						</Button>
					</StandardTooltip>
				</div>
				<div className="flex flex-col gap-2">
					<div className="relative flex items-center">
						<span className="codicon codicon-search absolute left-2.5 opacity-60 text-[11px]" />
						<input
							type="text"
							placeholder={t("history:searchPlaceholder")}
							value={searchQuery}
							className="w-full h-7 pl-8 pr-7 text-xs bg-vscode-input-background text-vscode-input-foreground border border-vscode-input-border rounded focus:outline-none focus:border-mirror-brand-via"
							data-testid="history-search-input"
							onInput={(e) => {
								const newValue = (e.target as HTMLInputElement)?.value
								setSearchQuery(newValue)
								if (newValue && !searchQuery && sortOption !== "mostRelevant") {
									setLastNonRelevantSort(sortOption)
									setSortOption("mostRelevant")
								}
							}}
						/>
						{searchQuery && (
							<button
								className="absolute right-2 p-0 border-none bg-transparent cursor-pointer text-vscode-descriptionForeground hover:text-vscode-foreground flex items-center justify-center"
								aria-label="Clear search"
								onClick={() => setSearchQuery("")}>
								<span className="codicon codicon-close text-[10px]" />
							</button>
						)}
					</div>
					<div className="flex gap-2">
						<Select
							value={showAllWorkspaces ? "all" : "current"}
							onValueChange={(value) => setShowAllWorkspaces(value === "all")}>
							<SelectTrigger className="flex-1 h-6.5 rounded-full bg-vscode-sideBar-background/30 border-vscode-panel-border/30 hover:border-mirror-brand-via/40 text-[10px] px-2.5 focus:ring-0 focus:ring-offset-0">
								<SelectValue>
									{t("history:workspace.prefix")}{" "}
									{t(`history:workspace.${showAllWorkspaces ? "all" : "current"}`)}
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="current">
									<div className="flex items-center gap-2 text-xs">
										<span className="codicon codicon-folder" />
										{t("history:workspace.current")}
									</div>
								</SelectItem>
								<SelectItem value="all">
									<div className="flex items-center gap-2 text-xs">
										<span className="codicon codicon-folder-opened" />
										{t("history:workspace.all")}
									</div>
								</SelectItem>
							</SelectContent>
						</Select>
						<Select value={sortOption} onValueChange={(value) => setSortOption(value as SortOption)}>
							<SelectTrigger className="flex-1 h-6.5 rounded-full bg-vscode-sideBar-background/30 border-vscode-panel-border/30 hover:border-mirror-brand-via/40 text-[10px] px-2.5 focus:ring-0 focus:ring-offset-0">
								<SelectValue>
									{t("history:sort.prefix")} {t(`history:sort.${sortOption}`)}
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="newest" data-testid="select-newest">
									<div className="flex items-center gap-2">
										<span className="codicon codicon-arrow-down" />
										{t("history:newest")}
									</div>
								</SelectItem>
								<SelectItem value="oldest" data-testid="select-oldest">
									<div className="flex items-center gap-2">
										<span className="codicon codicon-arrow-up" />
										{t("history:oldest")}
									</div>
								</SelectItem>
								<SelectItem value="mostExpensive" data-testid="select-most-expensive">
									<div className="flex items-center gap-2">
										<span className="codicon codicon-credit-card" />
										{t("history:mostExpensive")}
									</div>
								</SelectItem>
								<SelectItem value="mostTokens" data-testid="select-most-tokens">
									<div className="flex items-center gap-2">
										<span className="codicon codicon-symbol-numeric" />
										{t("history:mostTokens")}
									</div>
								</SelectItem>
								<SelectItem
									value="mostRelevant"
									disabled={!searchQuery}
									data-testid="select-most-relevant">
									<div className="flex items-center gap-2">
										<span className="codicon codicon-search" />
										{t("history:mostRelevant")}
									</div>
								</SelectItem>
							</SelectContent>
						</Select>
					</div>

					{/* Select all control in selection mode */}
					{isSelectionMode && tasks.length > 0 && (
						<div className="flex items-center py-1">
							<div className="flex items-center gap-2">
								<Checkbox
									checked={tasks.length > 0 && selectedTaskIds.size === tasks.length}
									onCheckedChange={(checked) => toggleSelectAll(checked === true)}
									variant="description"
								/>
								<span className="text-vscode-foreground">
									{selectedTaskIds.size === tasks.length
										? t("history:deselectAll")
										: t("history:selectAll")}
								</span>
								<span className="ml-auto text-vscode-descriptionForeground text-xs">
									{t("history:selectedItems", {
										selected: selectedTaskIds.size,
										total: tasks.length,
									})}
								</span>
							</div>
						</div>
					)}
				</div>
			</TabHeader>

			<TabContent className="px-2 py-0">
				{isSearchMode && flatTasks ? (
					// Search mode: flat list with subtask prefix
					<Virtuoso
						className="flex-1 overflow-y-scroll"
						data={flatTasks}
						data-testid="virtuoso-container"
						initialTopMostItemIndex={0}
						components={{
							List: React.forwardRef((props, ref) => (
								<div {...props} ref={ref} data-testid="virtuoso-item-list" />
							)),
						}}
						itemContent={(_index, item) => (
							<TaskItem
								key={item.id}
								item={item}
								variant="full"
								showWorkspace={showAllWorkspaces}
								isSelectionMode={isSelectionMode}
								isSelected={selectedTaskIds.has(item.id)}
								onToggleSelection={toggleTaskSelection}
								onDelete={handleDelete}
								displayName={taskNames?.[item.id]}
								onRenameTab={handleRenameTab}
								className="m-2"
							/>
						)}
					/>
				) : (
					// Session-grouped mode: render SessionGroupItem for each session
					<Virtuoso
						className="flex-1 overflow-y-scroll"
						data={sessionGroups}
						data-testid="virtuoso-container"
						initialTopMostItemIndex={0}
						components={{
							List: React.forwardRef((props, ref) => (
								<div {...props} ref={ref} data-testid="virtuoso-item-list" />
							)),
						}}
						itemContent={(_index, session) => (
							<SessionGroupItem
								key={session.sessionId}
								session={session}
								variant="full"
								showWorkspace={showAllWorkspaces}
								isSelectionMode={isSelectionMode}
								selectedTaskIds={selectedTaskIds}
								onToggleSelection={toggleTaskSelection}
								onDelete={handleDelete}
								onDeleteSession={() => {
									const ids = session.tabs.map((t) => t.id)
									vscode.postMessage({ type: "deleteMultipleTasksWithIds", ids })
								}}
								onToggleExpand={() => toggleSessionExpand(session.sessionId)}
								onRenameSession={(name) => setSessionName(session.sessionId, name)}
								taskNames={taskNames}
								onRenameTab={handleRenameTab}
								className="m-2"
							/>
						)}
					/>
				)}
			</TabContent>

			{/* Fixed action bar at bottom - only shown in selection mode with selected items */}
			{isSelectionMode && selectedTaskIds.size > 0 && (
				<div className="fixed bottom-0 left-0 right-2 bg-vscode-editor-background border-t border-vscode-panel-border p-2 flex justify-between items-center">
					<div className="text-vscode-foreground">
						{t("history:selectedItems", { selected: selectedTaskIds.size, total: tasks.length })}
					</div>
					<div className="flex gap-2">
						<Button variant="secondary" onClick={() => setSelectedTaskIds(new Set())}>
							{t("history:clearSelection")}
						</Button>
						<Button variant="primary" onClick={handleBatchDelete}>
							{t("history:deleteSelected")}
						</Button>
					</div>
				</div>
			)}

			{/* Delete dialog */}
			{deleteTaskId && (
				<DeleteTaskDialog
					taskId={deleteTaskId}
					onOpenChange={(open) => {
						if (!open) {
							setDeleteTaskId(null)
						}
					}}
					open
				/>
			)}

			{/* Batch delete dialog */}
			{showBatchDeleteDialog && (
				<BatchDeleteTaskDialog
					taskIds={Array.from(selectedTaskIds)}
					open={showBatchDeleteDialog}
					onOpenChange={(open) => {
						if (!open) {
							setShowBatchDeleteDialog(false)
							setSelectedTaskIds(new Set())
							setIsSelectionMode(false)
						}
					}}
				/>
			)}
		</Tab>
	)
}

export default memo(HistoryView)

import { memo } from "react"

import { vscode } from "@src/utils/vscode"
import { useAppTranslation } from "@src/i18n/TranslationContext"

import { useTaskSearch } from "./useTaskSearch"
import TaskItem from "./TaskItem"

const HistoryPreview = () => {
	const { tasks } = useTaskSearch()
	const { t } = useAppTranslation()

	const handleViewAllHistory = () => {
		vscode.postMessage({ type: "switchTab", tab: "history" })
	}

	// Show up to 4 most recent tasks
	const displayTasks = tasks.slice(0, 4)

	return (
		<div className="flex flex-col gap-1">
			<div className="flex flex-wrap items-center justify-between mt-4 mb-2">
				<h2 className="font-semibold text-lg grow m-0">{t("history:recentTasks")}</h2>
				<button
					onClick={handleViewAllHistory}
					className="text-base text-vscode-descriptionForeground hover:text-vscode-textLink-foreground transition-colors cursor-pointer"
					aria-label={t("history:viewAllHistory")}>
					{t("history:viewAllHistory")}
				</button>
			</div>
			{displayTasks.length !== 0 && (
				<>
					{displayTasks.map((task) => (
						<TaskItem key={task.id} item={task as any} variant="compact" />
					))}
				</>
			)}
		</div>
	)
}

export default memo(HistoryPreview)

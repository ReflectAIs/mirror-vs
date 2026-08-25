import { useCallback } from "react"
import { useAppTranslation } from "@/i18n/TranslationContext"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	Button,
} from "@/components/ui"
import { vscode } from "@/utils/vscode"
import { AlertDialogProps } from "@radix-ui/react-alert-dialog"

interface BatchDeleteTaskDialogProps extends AlertDialogProps {
	taskIds: string[]
}

export const BatchDeleteTaskDialog = ({ taskIds, ...props }: BatchDeleteTaskDialogProps) => {
	const { t } = useAppTranslation()
	const { onOpenChange } = props

	const onDelete = useCallback(() => {
		if (taskIds.length > 0) {
			vscode.postMessage({ type: "deleteMultipleTasksWithIds", ids: taskIds })
			onOpenChange?.(false)
		}
	}, [taskIds, onOpenChange])

	return (
		<AlertDialog {...props}>
			<AlertDialogContent className="max-w-md">
				<AlertDialogHeader>
					<AlertDialogTitle>{t("history:deleteTasks")}</AlertDialogTitle>
					<AlertDialogDescription className="text-vscode-descriptionForeground text-xs flex flex-col gap-1.5 mt-1">
						<span>{t("history:confirmDeleteTasks", { count: taskIds.length })}</span>
						<span className="text-vscode-descriptionForeground/80">{t("history:deleteTasksWarning")}</span>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel asChild>
						<Button variant="secondary">{t("history:cancel")}</Button>
					</AlertDialogCancel>
					<AlertDialogAction asChild>
						<Button variant="destructive" onClick={onDelete}>
							<span className="codicon codicon-trash mr-1"></span>
							{t("history:deleteItems", { count: taskIds.length })}
						</Button>
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}

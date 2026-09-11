import React from "react"
import { useAppTranslation } from "@src/i18n/TranslationContext"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@src/components/ui"
import { cn } from "@src/lib/utils"

interface CheckpointRestoreDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	onConfirm: (restoreCheckpoint: boolean) => void
	type: "edit" | "delete"
	hasCheckpoint: boolean
}

export const CheckpointRestoreDialog: React.FC<CheckpointRestoreDialogProps> = ({
	open,
	onOpenChange,
	onConfirm,
	type,
	hasCheckpoint,
}) => {
	const { t } = useAppTranslation()

	const isEdit = type === "edit"
	const title = isEdit ? t("common:confirmation.editMessage") : t("common:confirmation.deleteMessage")
	const description = isEdit
		? t("common:confirmation.editQuestionWithCheckpoint")
		: t("common:confirmation.deleteQuestionWithCheckpoint")

	const handleConfirmWithRestore = () => {
		onConfirm(true)
		onOpenChange(false)
	}

	const handleConfirmWithoutRestore = () => {
		onConfirm(false)
		onOpenChange(false)
	}

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle className="text-lg">{title}</AlertDialogTitle>
					<AlertDialogDescription className="text-base">{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter className="flex flex-col sm:flex-col gap-2 pt-2">
					{hasCheckpoint && (
						<AlertDialogAction
							onClick={handleConfirmWithRestore}
							className="w-full bg-vscode-button-background hover:bg-vscode-button-hoverBackground text-vscode-button-foreground font-medium py-1.5 px-3 rounded text-xs cursor-pointer transition-colors shadow-sm">
							{t("common:confirmation.restoreToCheckpoint")}
						</AlertDialogAction>
					)}
					<AlertDialogAction
						onClick={handleConfirmWithoutRestore}
						className={cn(
							"w-full py-1.5 px-3 rounded text-xs font-medium cursor-pointer transition-colors",
							hasCheckpoint
								? "bg-vscode-button-secondaryBackground hover:bg-vscode-button-secondaryHoverBackground text-vscode-button-secondaryForeground border border-vscode-button-border/40"
								: "bg-vscode-button-background hover:bg-vscode-button-hoverBackground text-vscode-button-foreground",
						)}>
						{isEdit ? t("common:confirmation.editOnly") : t("common:confirmation.deleteOnly")}
					</AlertDialogAction>
					<AlertDialogCancel className="w-full bg-transparent hover:bg-vscode-toolbar-hoverBackground text-vscode-descriptionForeground hover:text-vscode-foreground border-none text-xs font-normal cursor-pointer py-1 mt-0.5">
						{t("common:answers.cancel")}
					</AlertDialogCancel>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}

// Export convenience components for backward compatibility
export const EditMessageWithCheckpointDialog: React.FC<Omit<CheckpointRestoreDialogProps, "type">> = (props) => (
	<CheckpointRestoreDialog {...props} type="edit" />
)

export const DeleteMessageWithCheckpointDialog: React.FC<Omit<CheckpointRestoreDialogProps, "type">> = (props) => (
	<CheckpointRestoreDialog {...props} type="delete" />
)

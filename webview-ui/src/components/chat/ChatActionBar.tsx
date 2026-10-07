import React from "react"
import { StandardTooltip, Button } from "@src/components/ui"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatActionBarProps {
	primaryButtonText: string | undefined
	secondaryButtonText: string | undefined
	enableButtons: boolean
	inputValue: string
	selectedImages: string[]
	onPrimaryButtonClick: (text?: string, images?: string[]) => void
	onSecondaryButtonClick: (text?: string, images?: string[]) => void
	t: (key: string) => string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ChatActionBar = ({
	primaryButtonText,
	secondaryButtonText,
	enableButtons,
	inputValue,
	selectedImages,
	onPrimaryButtonClick,
	onSecondaryButtonClick,
	t,
}: ChatActionBarProps) => {
	if (!primaryButtonText && !secondaryButtonText) {
		return null
	}

	return (
		<div
			className={`flex h-8 items-center mb-1.5 px-3 justify-end gap-2 ${
				enableButtons ? "opacity-100" : "opacity-50"
			}`}>
			{secondaryButtonText && (
				<StandardTooltip
					content={
						secondaryButtonText === t("chat:reject.title")
							? t("chat:reject.tooltip")
							: secondaryButtonText === t("chat:terminate.title")
								? t("chat:terminate.tooltip")
								: secondaryButtonText === t("chat:killCommand.title")
									? t("chat:killCommand.tooltip")
									: undefined
					}>
					<Button
						variant="secondary"
						disabled={!enableButtons}
						className="h-7 px-3 rounded-md flex items-center justify-center text-[11px] font-medium"
						onClick={() => onSecondaryButtonClick(inputValue, selectedImages)}>
						{secondaryButtonText}
					</Button>
				</StandardTooltip>
			)}
			{primaryButtonText && (
				<StandardTooltip
					content={
						primaryButtonText === t("chat:retry.title")
							? t("chat:retry.tooltip")
							: primaryButtonText === t("chat:save.title")
								? t("chat:save.tooltip")
								: primaryButtonText === t("chat:approve.title")
									? t("chat:approve.tooltip")
									: primaryButtonText === t("chat:runCommand.title")
										? t("chat:runCommand.tooltip")
										: primaryButtonText === t("chat:resumeTask.title")
											? t("chat:resumeTask.tooltip")
											: primaryButtonText === t("chat:proceedAnyways.title")
												? t("chat:proceedAnyways.tooltip")
												: primaryButtonText === t("chat:proceedWhileRunning.title")
													? t("chat:proceedWhileRunning.tooltip")
													: primaryButtonText === t("chat:startNewTask.title")
														? t("chat:startNewTask.tooltip")
														: undefined
					}>
					<Button
						variant="primary"
						disabled={!enableButtons}
						className="h-7 px-3.5 rounded-md flex items-center justify-center text-[11px] font-semibold"
						onClick={() => onPrimaryButtonClick(inputValue, selectedImages)}>
						{primaryButtonText}
					</Button>
				</StandardTooltip>
			)}
		</div>
	)
}

export default ChatActionBar

import React from "react"
import { StandardTooltip, Button } from "@src/components/ui"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatActionBarProps {
	showScrollToBottom: boolean
	primaryButtonText: string | undefined
	secondaryButtonText: string | undefined
	enableButtons: boolean
	hasLatestCheckpoint: boolean
	inputValue: string
	selectedImages: string[]
	onScrollToBottom: () => void
	onScrollToCheckpoint: () => void
	onPrimaryButtonClick: (text?: string, images?: string[]) => void
	onSecondaryButtonClick: (text?: string, images?: string[]) => void
	t: (key: string) => string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ChatActionBar = ({
	showScrollToBottom,
	primaryButtonText,
	secondaryButtonText,
	enableButtons,
	hasLatestCheckpoint,
	inputValue,
	selectedImages,
	onScrollToBottom,
	onScrollToCheckpoint,
	onPrimaryButtonClick,
	onSecondaryButtonClick,
	t,
}: ChatActionBarProps) => {
	return (
		<div
			className={`flex h-8 items-center mb-1.5 px-4 justify-end gap-2 ${
				showScrollToBottom ? "opacity-100" : enableButtons ? "opacity-100" : "opacity-50"
			}`}>
			{showScrollToBottom ? (
				<>
					<StandardTooltip content={t("chat:scrollToBottom")}>
						<Button
							variant="secondary"
							className="h-7 px-2.5 rounded-md flex items-center justify-center gap-1 text-[11px]"
							onClick={onScrollToBottom}>
							<span className="codicon codicon-chevron-down text-xs"></span>
							<span>To Bottom</span>
						</Button>
					</StandardTooltip>
					{hasLatestCheckpoint && (
						<StandardTooltip content={t("chat:scrollToLatestCheckpoint")}>
							<Button
								variant="secondary"
								className="h-7 px-2.5 rounded-md flex items-center justify-center gap-1 text-[11px]"
								onClick={onScrollToCheckpoint}
								aria-label={t("chat:scrollToLatestCheckpoint")}>
								<span className="codicon codicon-history text-xs"></span>
								<span>Checkpoint</span>
							</Button>
						</StandardTooltip>
					)}
				</>
			) : (
				<>
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
				</>
			)}
		</div>
	)
}

export default ChatActionBar

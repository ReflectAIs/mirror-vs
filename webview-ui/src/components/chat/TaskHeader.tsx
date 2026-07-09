import { memo, useState, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { ChevronUp, ChevronDown, RotateCcw, CircleUser } from "lucide-react"

import type { MirrorMessage } from "@mirror-vs/types"

import { cn } from "@src/lib/utils"
import { StandardTooltip } from "@src/components/ui"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import { vscode } from "@src/utils/vscode"
import Thumbnails from "../common/Thumbnails"
import { Mention } from "./Mention"

export interface TaskHeaderProps {
	task: MirrorMessage
	parentTaskId?: string
	buttonsDisabled: boolean
}

const TaskHeader = ({ task, buttonsDisabled }: TaskHeaderProps) => {
	const { t } = useTranslation()
	const { mirrorMessages } = useExtensionState()
	const [isTaskExpanded, setIsTaskExpanded] = useState(false)

	const latestUserMsg = useMemo(() => {
		for (let i = mirrorMessages.length - 1; i >= 0; i--) {
			const msg = mirrorMessages[i]
			if (msg.say === "user_feedback" && msg.text) {
				return msg
			}
		}
		return null
	}, [mirrorMessages])

	const displayText = latestUserMsg?.text || task.text
	const displayImages = latestUserMsg?.images || task.images

	return (
		<div className="group pt-2 pb-1 px-3 shrink-0">
			<div
				className={cn(
					"p-3 rounded-lg transition-all border border-dashed border-vscode-button-background/15 bg-vscode-button-background/[0.03] hover:bg-vscode-button-background/[0.06] hover:border-vscode-button-background/25",
					"text-vscode-foreground relative cursor-pointer",
				)}
				onClick={() => setIsTaskExpanded(!isTaskExpanded)}>
				<div className="flex justify-between items-center ml-1 w-full select-none">
					<div className="flex items-center gap-1.5 select-none">
						<CircleUser
							className="w-3.5 h-3.5 shrink-0 text-vscode-button-background/80"
							aria-label="User icon"
						/>
						<span style={{ fontWeight: "bold" }}>{t("chat:feedback.youSaid")}</span>
					</div>
					<div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
						{latestUserMsg && (
							<StandardTooltip content="Revert session to before this message">
								<button
									onClick={() => {
										vscode.postMessage({
											type: "revertHistory",
											messageTs: latestUserMsg.ts,
											inclusive: false,
										})
									}}
									className="cursor-pointer text-vscode-descriptionForeground hover:text-vscode-foreground p-0.5 rounded transition-colors bg-transparent border-none">
									<RotateCcw className="w-3.5 h-3.5" aria-label="Revert to here icon" />
								</button>
							</StandardTooltip>
						)}
						<StandardTooltip content={isTaskExpanded ? t("chat:task.collapse") : t("chat:task.expand")}>
							<button
								onClick={() => setIsTaskExpanded(!isTaskExpanded)}
								className="cursor-pointer text-vscode-descriptionForeground hover:text-vscode-foreground p-0.5 rounded transition-colors bg-transparent border-none">
								{isTaskExpanded ? (
									<ChevronUp className="w-3.5 h-3.5" />
								) : (
									<ChevronDown className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100" />
								)}
							</button>
						</StandardTooltip>
					</div>
				</div>
				<div className="text-vscode-font-size overflow-y-auto break-words break-anywhere mt-2 ml-1">
					<div
						className={cn(
							"overflow-auto whitespace-pre-wrap break-words break-anywhere cursor-text py-0.5",
							!isTaskExpanded ? "max-h-[3em] overflow-hidden text-ellipsis line-clamp-2" : "max-h-40",
						)}>
						<Mention text={displayText} />
					</div>
					{isTaskExpanded && displayImages && displayImages.length > 0 && (
						<div className="mt-2.5">
							<Thumbnails images={displayImages} />
						</div>
					)}
				</div>
			</div>
		</div>
	)
}

export default memo(TaskHeader)

import { memo, useState, useCallback, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { ChevronUp, ChevronDown, RotateCcw, CircleUser, Edit } from "lucide-react"

import type { MirrorMessage } from "@mirror-vs/types"
import type { Mode } from "@shared/modes"

import { cn } from "@src/lib/utils"
import { StandardTooltip } from "@src/components/ui"
import { vscode } from "@src/utils/vscode"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import { appendImages } from "@src/utils/imageUtils"
import Thumbnails from "../common/Thumbnails"
import { Mention } from "./Mention"
import { ChatTextArea } from "./ChatTextArea"
import { MAX_IMAGES_PER_MESSAGE } from "./ChatView"

export interface TaskHeaderProps {
	task: MirrorMessage
	parentTaskId?: string
	buttonsDisabled: boolean
}

const TaskHeader = ({ task, buttonsDisabled }: TaskHeaderProps) => {
	const { t } = useTranslation()
	const { mode } = useExtensionState()
	const [isTaskExpanded, setIsTaskExpanded] = useState(false)
	const [isEditing, setIsEditing] = useState(false)
	const [editedContent, setEditedContent] = useState("")
	const [editMode, setEditMode] = useState<Mode>(mode || "code")
	const [editImages, setEditImages] = useState<string[]>([])

	// Handle message events for image selection during edit mode
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const msg = event.data
			if (msg.type === "selectedImages" && msg.context === "edit" && msg.messageTs === task.ts && isEditing) {
				setEditImages((prevImages) => appendImages(prevImages, msg.images, MAX_IMAGES_PER_MESSAGE))
			}
		}

		window.addEventListener("message", handleMessage)
		return () => window.removeEventListener("message", handleMessage)
	}, [isEditing, task.ts])

	const handleEditClick = useCallback(() => {
		setIsEditing(true)
		setEditedContent(task.text || "")
		setEditImages(task.images || [])
		setEditMode(mode || "code")
	}, [task.text, task.images, mode])

	const handleCancelEdit = useCallback(() => {
		setIsEditing(false)
		setEditedContent(task.text || "")
		setEditImages(task.images || [])
		setEditMode(mode || "code")
	}, [task.text, task.images, mode])

	const handleSaveEdit = useCallback(() => {
		setIsEditing(false)
		vscode.postMessage({
			type: "submitEditedMessage",
			value: task.ts,
			editedMessageContent: editedContent,
			images: editImages,
		})
	}, [task.ts, editedContent, editImages])

	const handleSelectImages = useCallback(() => {
		vscode.postMessage({ type: "selectImages", context: "edit", messageTs: task.ts })
	}, [task.ts])

	const displayText = task.text
	const displayImages = task.images

	return (
		<div className="group pt-2 pb-1 px-3 shrink-0" data-ts={task.ts}>
			<div
				className={cn(
					"p-3 rounded-lg transition-all border border-dashed border-vscode-button-background/15 bg-vscode-button-background/[0.03] hover:bg-vscode-button-background/[0.06] hover:border-vscode-button-background/25",
					"text-vscode-foreground relative cursor-pointer",
				)}
				onClick={() => {
					if (!isEditing) {
						setIsTaskExpanded(!isTaskExpanded)
					}
				}}>
				<div className="flex justify-between items-center ml-1 w-full select-none">
					<div className="flex items-center gap-1.5 select-none">
						<CircleUser
							className="w-3.5 h-3.5 shrink-0 text-vscode-button-background/80"
							aria-label="User icon"
						/>
						<span style={{ fontWeight: "bold" }}>{t("chat:feedback.youSaid")}</span>
					</div>
					<div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
						{task.ts && (
							<>
								<StandardTooltip content="Revert session to before this message">
									<button
										onClick={() => {
											vscode.postMessage({
												type: "revertHistory",
												messageTs: task.ts,
												inclusive: false,
											})
										}}
										className="cursor-pointer text-vscode-descriptionForeground hover:text-vscode-foreground p-0.5 rounded transition-colors bg-transparent border-none">
										<RotateCcw className="w-3.5 h-3.5" aria-label="Revert to here icon" />
									</button>
								</StandardTooltip>
								<StandardTooltip content={t("chat:task.edit") || "Edit message"}>
									<button
										onClick={handleEditClick}
										className="cursor-pointer text-vscode-descriptionForeground hover:text-vscode-foreground p-0.5 rounded transition-colors bg-transparent border-none">
										<Edit className="w-3.5 h-3.5" aria-label="Edit message icon" />
									</button>
								</StandardTooltip>
							</>
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

				{isEditing ? (
					<div className="flex flex-col gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
						<ChatTextArea
							inputValue={editedContent}
							setInputValue={setEditedContent}
							sendingDisabled={false}
							selectApiConfigDisabled={true}
							placeholderText={t("chat:editMessage.placeholder")}
							selectedImages={editImages}
							setSelectedImages={setEditImages}
							onSend={handleSaveEdit}
							onSelectImages={handleSelectImages}
							shouldDisableImages={false}
							mode={editMode}
							setMode={setEditMode}
							modeShortcutText=""
							isEditMode={true}
							onCancel={handleCancelEdit}
						/>
					</div>
				) : (
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
				)}
			</div>
		</div>
	)
}

export default memo(TaskHeader)

import { memo, useState, useCallback, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { ChevronUp, ChevronDown, RotateCcw, Edit, Sparkles } from "lucide-react"

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
	buttonsDisabled?: boolean
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
		<div className="group pt-1 pb-1.5 px-3 shrink-0 z-10 sticky top-0" data-ts={task.ts}>
			<div
				className={cn(
					"px-3 py-2 rounded-lg transition-all duration-200",
					"border border-white/5 bg-[rgba(24,24,32,0.75)] backdrop-blur-md shadow-sm",
					"hover:border-white/10 hover:bg-[rgba(28,28,38,0.85)]",
					"text-vscode-foreground relative cursor-pointer select-none",
				)}
				onClick={() => {
					if (!isEditing) {
						setIsTaskExpanded(!isTaskExpanded)
					}
				}}>
				<div className="flex justify-between items-center w-full">
					<div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
						<div className="w-5 h-5 rounded-full flex items-center justify-center bg-gradient-to-br from-mirror-brand-from/20 to-mirror-brand-to/20 border border-mirror-brand-via/30 shrink-0">
							<Sparkles className="w-3 h-3 text-mirror-brand-via" />
						</div>
						<span className="font-semibold text-xs tracking-tight text-vscode-foreground shrink-0">
							Goal:
						</span>
						{!isEditing && !isTaskExpanded && (
							<span className="text-xs text-vscode-descriptionForeground font-normal truncate">
								{displayText}
							</span>
						)}
					</div>
					<div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
						{task.ts && !isEditing && (
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
										className="cursor-pointer text-vscode-descriptionForeground hover:text-vscode-foreground p-1 rounded transition-colors bg-transparent border-none">
										<RotateCcw className="w-3.5 h-3.5" aria-label="Revert to here icon" />
									</button>
								</StandardTooltip>
								<StandardTooltip content={t("chat:task.edit") || "Edit message"}>
									<button
										onClick={handleEditClick}
										className="cursor-pointer text-vscode-descriptionForeground hover:text-vscode-foreground p-1 rounded transition-colors bg-transparent border-none">
										<Edit className="w-3.5 h-3.5" aria-label="Edit message icon" />
									</button>
								</StandardTooltip>
							</>
						)}
						<StandardTooltip content={isTaskExpanded ? t("chat:task.collapse") : t("chat:task.expand")}>
							<button
								onClick={() => setIsTaskExpanded(!isTaskExpanded)}
								className="cursor-pointer text-vscode-descriptionForeground hover:text-vscode-foreground p-1 rounded transition-colors bg-transparent border-none">
								{isTaskExpanded ? (
									<ChevronUp className="w-3.5 h-3.5" />
								) : (
									<ChevronDown className="w-3.5 h-3.5" />
								)}
							</button>
						</StandardTooltip>
					</div>
				</div>

				{isEditing ? (
					<div className="flex flex-col gap-2 mt-2 pt-2 border-t border-white/5" onClick={(e) => e.stopPropagation()}>
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
					isTaskExpanded && (
						<div className="text-xs text-vscode-foreground overflow-y-auto break-words break-anywhere mt-2 pt-2 border-t border-white/5 cursor-text select-text">
							<div className="overflow-auto whitespace-pre-wrap break-words break-anywhere max-h-48 py-0.5 leading-relaxed">
								<Mention text={displayText} />
							</div>
							{displayImages && displayImages.length > 0 && (
								<div className="mt-2.5">
									<Thumbnails images={displayImages} />
								</div>
							)}
						</div>
					)
				)}
			</div>
		</div>
	)
}

export default memo(TaskHeader)


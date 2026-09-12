import { useMemo, useRef, useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"

import { CheckpointMenu } from "./CheckpointMenu"
import { checkpointSchema } from "./schema"
import { GitCommitVertical } from "lucide-react"

type CheckpointSavedProps = {
	ts: number
	commitHash: string
	currentHash?: string
	checkpoint?: Record<string, unknown>
	onJumpToPreviousCheckpoint?: () => void
}

export const CheckpointSaved = ({
	checkpoint,
	currentHash,
	onJumpToPreviousCheckpoint,
	...props
}: CheckpointSavedProps) => {
	const { t } = useTranslation()
	const isCurrent = currentHash === props.commitHash
	const [isPopoverOpen, setIsPopoverOpen] = useState(false)
	const [isClosing, setIsClosing] = useState(false)
	const [isHovering, setIsHovering] = useState(false)
	const closeTimer = useRef<number | null>(null)

	useEffect(() => {
		return () => {
			if (closeTimer.current) {
				window.clearTimeout(closeTimer.current)
				closeTimer.current = null
			}
		}
	}, [])

	const handlePopoverOpenChange = (open: boolean) => {
		setIsPopoverOpen(open)
		if (open) {
			setIsClosing(false)
			if (closeTimer.current) {
				window.clearTimeout(closeTimer.current)
				closeTimer.current = null
			}
		} else {
			setIsClosing(true)
			closeTimer.current = window.setTimeout(() => {
				setIsClosing(false)
				closeTimer.current = null
			}, 200) // keep menu visible briefly to avoid popover jump
		}
	}

	const handleMouseEnter = () => {
		setIsHovering(true)
	}

	const handleMouseLeave = () => {
		setIsHovering(false)
	}

	// Menu is visible when hovering, popover is open, or briefly after popover closes
	const menuVisible = isHovering || isPopoverOpen || isClosing

	const metadata = useMemo(() => {
		if (!checkpoint) {
			return undefined
		}

		const result = checkpointSchema.safeParse(checkpoint)

		if (!result.success) {
			return undefined
		}

		return result.data
	}, [checkpoint])

	if (!metadata) {
		return null
	}

	return (
		<div
			className="group flex items-center justify-between gap-2 py-0.5 my-1"
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}>
			<div className="flex items-center gap-1.5 text-vscode-descriptionForeground/60 group-hover:text-vscode-foreground whitespace-nowrap select-none transition-colors">
				<GitCommitVertical className="w-3.5 h-3.5 text-vscode-descriptionForeground/40 group-hover:text-blue-400 transition-colors" />
				<span className="text-[11px] font-medium tracking-tight">{t("chat:checkpoint.regular")}</span>
				{isCurrent && <span className="text-[10px] text-vscode-descriptionForeground/40">({t("chat:checkpoint.current")})</span>}
			</div>
			<span
				className="block w-full h-[1px] transition-all duration-200"
				style={{
					backgroundImage: menuVisible
						? "linear-gradient(90deg, rgba(59, 130, 246, 0.4), rgba(59, 130, 246, 0.1) 70%, transparent 100%)"
						: "linear-gradient(90deg, rgba(128, 128, 128, 0.18), transparent 90%)",
				}}></span>

			{/* Keep menu visible while hovering, popover is open, or briefly after close to prevent jump */}
			<div data-testid="checkpoint-menu-container" className={cn("h-6 -my-1 shrink-0 flex items-center", menuVisible ? "block" : "hidden")}>
				<CheckpointMenu
					ts={props.ts}
					commitHash={props.commitHash}
					checkpoint={metadata}
					onOpenChange={handlePopoverOpenChange}
					onJumpToPreviousCheckpoint={onJumpToPreviousCheckpoint}
				/>
			</div>
		</div>
	)
}

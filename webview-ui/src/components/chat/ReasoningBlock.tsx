import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useExtensionState } from "@src/context/ExtensionStateContext"

import MarkdownBlock from "../common/MarkdownBlock"
import { Lightbulb, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"

interface ReasoningBlockProps {
	content: string
	ts: number
	isStreaming: boolean
	isLast: boolean
	isPartial?: boolean
	duration?: number
	metadata?: any
}

export const ReasoningBlock = ({
	content,
	ts,
	isStreaming,
	isLast,
	isPartial,
	duration,
}: ReasoningBlockProps) => {
	const { t } = useTranslation()
	const { reasoningBlockCollapsed } = useExtensionState()

	const [isCollapsed, setIsCollapsed] = useState(reasoningBlockCollapsed)

	// Is thinking actively in-progress?
	const isActivelyThinking = isStreaming && isLast && (isPartial === true || isPartial === undefined)

	const startTimeRef = useRef<number>(ts || Date.now())
	const [elapsed, setElapsed] = useState<number>(() => duration ?? (isActivelyThinking ? Math.max(0, Date.now() - (ts || Date.now())) : 0))
	const contentRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		setIsCollapsed(reasoningBlockCollapsed)
	}, [reasoningBlockCollapsed])

	useEffect(() => {
		if (duration !== undefined) {
			setElapsed(duration)
			return
		}

		if (!isActivelyThinking) {
			// Once thinking stops or moves to text/tools, freeze the final elapsed duration
			setElapsed((prev) => (prev > 0 ? prev : Math.max(0, Date.now() - startTimeRef.current)))
			return
		}

		const tick = () => setElapsed(Date.now() - startTimeRef.current)
		tick()
		const id = setInterval(tick, 1000)
		return () => clearInterval(id)
	}, [isActivelyThinking, duration, ts])

	const seconds = Math.floor(elapsed / 1000)
	const secondsLabel = t("chat:reasoning.seconds", { count: seconds })

	const handleToggle = () => {
		setIsCollapsed(!isCollapsed)
	}

	return (
		<div className="group">
			<div
				className="flex items-center justify-between mb-2.5 pr-2 cursor-pointer select-none"
				onClick={handleToggle}>
				<div className="flex items-center gap-2">
					<Lightbulb className={cn("w-4 text-vscode-foreground", isActivelyThinking && "text-mirror-brand-via animate-pulse")} />
					<span className="font-bold text-vscode-foreground">{t("chat:reasoning.thinking")}</span>
					{elapsed > 0 && (
						<span className="text-xs text-vscode-descriptionForeground mt-0.5">
							{secondsLabel}
							{isActivelyThinking && " ..."}
						</span>
					)}
				</div>
				<div className="flex items-center gap-2">
					<ChevronUp
						className={cn(
							"w-4 transition-all opacity-0 group-hover:opacity-100",
							isCollapsed && "-rotate-180",
						)}
					/>
				</div>
			</div>
			{(content?.trim()?.length ?? 0) > 0 && !isCollapsed && (
				<div
					ref={contentRef}
					className="border-l border-vscode-descriptionForeground/20 ml-2 pl-4 pb-1 text-vscode-descriptionForeground break-words">
					<MarkdownBlock markdown={content} />
				</div>
			)}
		</div>
	)
}

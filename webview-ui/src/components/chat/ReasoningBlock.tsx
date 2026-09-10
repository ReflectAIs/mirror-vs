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

export const ReasoningBlock = ({ content, ts, isStreaming, isLast, isPartial, duration }: ReasoningBlockProps) => {
	const { t } = useTranslation()
	const { reasoningBlockCollapsed } = useExtensionState()

	const [isCollapsed, setIsCollapsed] = useState(reasoningBlockCollapsed)

	// Is thinking actively in-progress?
	const isActivelyThinking = isStreaming && isLast && (isPartial === true || isPartial === undefined)

	const startTimeRef = useRef<number>(ts || Date.now())
	const [elapsed, setElapsed] = useState<number>(
		() => duration ?? (isActivelyThinking ? Math.max(0, Date.now() - (ts || Date.now())) : 0),
	)
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
		<div className="my-1.5 group">
			<div
				className={cn(
					"inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs cursor-pointer select-none transition-all duration-150 shadow-xs",
					isActivelyThinking
						? "border-mirror-brand-via/35 bg-mirror-brand-via/10 text-vscode-foreground"
						: "border-vscode-editorGroup-border/30 bg-vscode-sideBar-background/50 hover:bg-vscode-sideBar-background/80 text-vscode-descriptionForeground hover:text-vscode-foreground",
				)}
				onClick={handleToggle}>
				<div className="flex items-center gap-1.5">
					<Lightbulb
						className={cn(
							"size-3.5",
							isActivelyThinking
								? "text-mirror-brand-via animate-pulse"
								: "text-vscode-descriptionForeground",
						)}
					/>
					<span className="font-medium">
						{isActivelyThinking
							? t("chat:reasoning.thinking")
							: t("chat:reasoning.thought", { defaultValue: "Thought" })}
					</span>
					{elapsed > 0 && (
						<span className="text-[11px] opacity-75 font-mono">
							· {secondsLabel}
							{isActivelyThinking && " ..."}
						</span>
					)}
				</div>
				<ChevronUp
					className={cn(
						"size-3 transition-transform duration-200 text-vscode-descriptionForeground/70 group-hover:text-vscode-foreground",
						isCollapsed && "-rotate-180",
					)}
				/>
			</div>
			{(content?.trim()?.length ?? 0) > 0 && !isCollapsed && (
				<div
					ref={contentRef}
					className="mt-2 rounded-xl border border-vscode-editorGroup-border/25 bg-vscode-editor-background/30 p-3 text-xs leading-relaxed text-vscode-descriptionForeground font-mono break-words max-h-72 overflow-y-auto">
					<MarkdownBlock markdown={content} />
				</div>
			)}
		</div>
	)
}

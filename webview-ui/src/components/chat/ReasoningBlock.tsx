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

	// A block is only actively thinking if it is explicitly partial, streaming is active,
	// this message is the latest in the chat, and no backend duration has been fixed yet.
	const isStreamActive = isStreaming && isLast && isPartial === true && duration === undefined

	const startTimeRef = useRef<number>(ts || Date.now())
	const frozenDurationRef = useRef<number | null>(duration !== undefined ? duration : null)

	const [elapsedMs, setElapsedMs] = useState<number>(() => {
		if (duration !== undefined) return duration
		if (isStreamActive) {
			return Math.max(0, Date.now() - (ts || Date.now()))
		}
		// If already concluded on mount without duration, estimate from content length
		return Math.max(1000, Math.round(((content?.length ?? 0) / 120) * 1000))
	})

	const contentRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		setIsCollapsed(reasoningBlockCollapsed)
	}, [reasoningBlockCollapsed])

	useEffect(() => {
		// 1. If backend duration is present, use it and freeze
		if (duration !== undefined) {
			frozenDurationRef.current = duration
			setElapsedMs(duration)
			return
		}

		// 2. If stream is no longer active for this block, freeze at current elapsed time
		if (!isStreamActive) {
			setElapsedMs((prev) => {
				if (prev > 0) {
					frozenDurationRef.current = prev
					return prev
				}
				const fallback = Math.max(1000, Math.round(((content?.length ?? 0) / 120) * 1000))
				frozenDurationRef.current = fallback
				return fallback
			})
			return
		}

		// 3. Actively thinking: smoothly tick every 500ms without interruption
		const start = ts || startTimeRef.current || Date.now()
		startTimeRef.current = start

		const tick = () => {
			setElapsedMs(Math.max(0, Date.now() - start))
		}

		tick()
		const timerId = setInterval(tick, 500)
		return () => clearInterval(timerId)
	}, [isStreamActive, duration, ts])

	const isActivelyThinking = isStreamActive
	const finalMs = frozenDurationRef.current !== null ? frozenDurationRef.current : elapsedMs
	const seconds = Math.max(1, Math.round(finalMs / 1000))
	const secondsLabel = t("chat:reasoning.seconds", { count: seconds })

	const handleToggle = () => {
		setIsCollapsed(!isCollapsed)
	}

	return (
		<div className="my-1 group">
			<div
				className={cn(
					"inline-flex items-center gap-1.5 py-0.5 text-[11px] cursor-pointer select-none transition-colors duration-150",
					isActivelyThinking
						? "text-vscode-foreground font-medium"
						: "text-vscode-descriptionForeground hover:text-vscode-foreground",
				)}
				onClick={handleToggle}>
				<Lightbulb
					className={cn(
						"size-3 shrink-0",
						isActivelyThinking
							? "text-amber-400 animate-pulse"
							: "text-vscode-descriptionForeground/70 group-hover:text-vscode-descriptionForeground",
					)}
				/>
				<span className="tracking-tight">
					{isActivelyThinking
						? t("chat:reasoning.thinking")
						: t("chat:reasoning.thought", { defaultValue: "Thought" })}
				</span>
				{seconds > 0 && (
					<span className="text-[10px] font-mono opacity-60">
						· {secondsLabel}
						{isActivelyThinking && " …"}
					</span>
				)}
				<ChevronUp
					className={cn(
						"size-2.5 shrink-0 transition-transform duration-150 text-vscode-descriptionForeground/50 group-hover:text-vscode-descriptionForeground",
						isCollapsed && "-rotate-180",
					)}
				/>
			</div>
			{(content?.trim()?.length ?? 0) > 0 && !isCollapsed && (
				<div
					ref={contentRef}
					className="mt-1.5 pl-3 border-l border-vscode-editorGroup-border/40 py-1 text-[11px] leading-relaxed text-vscode-descriptionForeground/85 font-mono break-words max-h-64 overflow-y-auto">
					<MarkdownBlock markdown={content} />
				</div>
			)}
		</div>
	)
}

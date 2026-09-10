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
	const lastChunkAtRef = useRef<number>(Date.now())
	const prevContentLengthRef = useRef<number>(content?.length ?? 0)
	const frozenDurationRef = useRef<number | null>(duration !== undefined ? duration : null)

	// Keep track of content updates to detect when thinking tokens stop arriving
	const currentLength = content?.length ?? 0
	if (currentLength !== prevContentLengthRef.current) {
		prevContentLengthRef.current = currentLength
		lastChunkAtRef.current = Date.now()
	}

	const [isDoneThinking, setIsDoneThinking] = useState<boolean>(() => !isStreamActive)
	const [elapsedMs, setElapsedMs] = useState<number>(() => {
		if (duration !== undefined) return duration
		if (!isStreamActive) {
			// If already concluded on initial render, estimate from content length rather than Date.now() - ts
			return Math.max(1000, Math.round(((content?.length ?? 0) / 120) * 1000))
		}
		return Math.max(0, Date.now() - (ts || Date.now()))
	})

	const contentRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		setIsCollapsed(reasoningBlockCollapsed)
	}, [reasoningBlockCollapsed])

	// If backend duration arrives or stream is no longer active, freeze immediately
	useEffect(() => {
		if (duration !== undefined) {
			frozenDurationRef.current = duration
			setElapsedMs(duration)
			setIsDoneThinking(true)
			return
		}

		if (!isStreamActive) {
			setIsDoneThinking(true)
			if (frozenDurationRef.current === null) {
				const finalMs = Math.max(1000, lastChunkAtRef.current - startTimeRef.current)
				frozenDurationRef.current = finalMs
				setElapsedMs(finalMs)
			}
			return
		}

		// Actively thinking: tick timer every 500ms
		setIsDoneThinking(false)
		let timerId: NodeJS.Timeout | undefined

		const tick = () => {
			const now = Date.now()
			const idleMs = now - lastChunkAtRef.current

			// If no new reasoning tokens arrived for > 2 seconds, thinking is concluded
			if (idleMs > 2000 && currentLength > 0) {
				const finalMs = Math.max(1000, lastChunkAtRef.current - startTimeRef.current)
				frozenDurationRef.current = finalMs
				setElapsedMs(finalMs)
				setIsDoneThinking(true)
				if (timerId) clearInterval(timerId)
				return
			}

			setElapsedMs(Math.max(0, now - startTimeRef.current))
		}

		timerId = setInterval(tick, 500)
		return () => {
			if (timerId) clearInterval(timerId)
		}
	}, [isStreamActive, duration, currentLength])

	const isActivelyThinking = isStreamActive && !isDoneThinking
	const seconds = Math.max(
		1,
		Math.round((frozenDurationRef.current !== null ? frozenDurationRef.current : elapsedMs) / 1000),
	)
	const secondsLabel = t("chat:reasoning.seconds", { count: seconds })

	const handleToggle = () => {
		setIsCollapsed(!isCollapsed)
	}

	return (
		<div className="my-1 group">
			<div
				className={cn(
					"inline-flex items-center gap-1.5 h-6 px-2 rounded-full border text-[11px] cursor-pointer select-none transition-colors duration-150",
					isActivelyThinking
						? "border-amber-500/40 bg-amber-500/10 text-vscode-foreground"
						: "border-vscode-editorGroup-border/30 bg-vscode-sideBar-background/40 hover:bg-vscode-sideBar-background/70 text-vscode-descriptionForeground hover:text-vscode-foreground",
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
				<span className="font-medium tracking-tight">
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
					className="mt-1.5 rounded-lg border border-vscode-editorGroup-border/20 bg-vscode-editor-background/20 p-2.5 text-[11px] leading-relaxed text-vscode-descriptionForeground font-mono break-words max-h-64 overflow-y-auto">
					<MarkdownBlock markdown={content} />
				</div>
			)}
		</div>
	)
}

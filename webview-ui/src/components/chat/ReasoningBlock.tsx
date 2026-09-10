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

	// Explicit check: only actively thinking if streaming is active, this is the last message,
	// and the message is explicitly marked partial.
	const isStreamActive = isStreaming && isLast && isPartial === true

	const startTimeRef = useRef<number>(ts || Date.now())
	const lastChunkAtRef = useRef<number>(Date.now())
	const prevContentLengthRef = useRef<number>(content?.length ?? 0)

	// Track whether thinking has concluded
	const [thinkingConcluded, setThinkingConcluded] = useState<boolean>(!isStreamActive || duration !== undefined)
	const [elapsed, setElapsed] = useState<number>(() => {
		if (duration !== undefined) return duration
		if (!isStreamActive) return 0
		return Math.max(0, Date.now() - (ts || Date.now()))
	})

	const contentRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		setIsCollapsed(reasoningBlockCollapsed)
	}, [reasoningBlockCollapsed])

	// Detect content updates
	const currentLength = content?.length ?? 0
	if (currentLength !== prevContentLengthRef.current) {
		prevContentLengthRef.current = currentLength
		lastChunkAtRef.current = Date.now()
	}

	// Once stream is not active or duration provided, finalize immediately
	useEffect(() => {
		if (duration !== undefined) {
			setElapsed(duration)
			setThinkingConcluded(true)
			return
		}

		if (!isStreamActive) {
			setThinkingConcluded(true)
			setElapsed((prev) => {
				if (prev > 0) return prev
				const total = Math.max(1000, lastChunkAtRef.current - startTimeRef.current)
				return total
			})
			return
		}

		// Actively streaming: tick timer every second, but auto-conclude if no new thinking tokens for > 2.5s
		setThinkingConcluded(false)
		const tick = () => {
			const now = Date.now()
			const idleMs = now - lastChunkAtRef.current

			// If no new reasoning tokens arrived in 2.5 seconds, model finished thinking and moved to next phase
			if (idleMs > 2500 && currentLength > 0) {
				setThinkingConcluded(true)
				setElapsed(Math.max(1000, lastChunkAtRef.current - startTimeRef.current))
				return
			}

			setElapsed(Math.max(0, now - startTimeRef.current))
		}

		tick()
		const id = setInterval(tick, 500)
		return () => clearInterval(id)
	}, [isStreamActive, duration, currentLength])

	const isActivelyThinking = isStreamActive && !thinkingConcluded
	const seconds = Math.max(1, Math.round(elapsed / 1000))
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
				{elapsed > 0 && (
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

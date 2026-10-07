import React, { memo, useMemo } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"
import type { MirrorMessage } from "@mirror-vs/types"

interface StickyUserMessageHudProps {
	displayedMessages: MirrorMessage[]
	visibleRange: { startIndex: number; endIndex: number }
	onJumpToMessage: (index: number) => void
	hasFloatingChatHud?: boolean
}

function cleanMessagePreview(text?: string): string {
	if (!text) return "User prompt"
	const cleaned = text.replace(/\[Terminal (Notice|Callback):.*?\]/gs, "").trim()
	const firstLine = cleaned.split("\n")[0]?.trim() || "User prompt"
	return firstLine.length > 55 ? firstLine.slice(0, 55) + "…" : firstLine
}

export const StickyUserMessageHud = memo(
	({ displayedMessages, visibleRange, onJumpToMessage, hasFloatingChatHud = false }: StickyUserMessageHudProps) => {
		// Collect all user feedback messages with their list indices
		const userTurns = useMemo(() => {
			const list: { index: number; message: MirrorMessage }[] = []
			displayedMessages.forEach((msg, idx) => {
				if (msg.say === "user_feedback") {
					list.push({ index: idx, message: msg })
				}
			})
			return list
		}, [displayedMessages])

		// Top sticky turn: User message that started at or before visibleRange.startIndex,
		// but has scrolled above the top of the viewport
		const topStickyTurn = useMemo(() => {
			if (userTurns.length === 0 || visibleRange.startIndex === 0) return null
			let candidate: { index: number; message: MirrorMessage } | null = null
			for (const turn of userTurns) {
				if (turn.index < visibleRange.startIndex) {
					candidate = turn
				} else {
					break
				}
			}
			return candidate
		}, [userTurns, visibleRange.startIndex])

		// Bottom sticky turn: If user has scrolled up to earlier turns, show the next/latest user prompt
		const bottomStickyTurn = useMemo(() => {
			if (userTurns.length === 0) return null
			for (const turn of userTurns) {
				if (turn.index > visibleRange.endIndex) {
					return turn
				}
			}
			return null
		}, [userTurns, visibleRange.endIndex])

		const topPreview = cleanMessagePreview(topStickyTurn?.message.text)
		const bottomPreview = cleanMessagePreview(bottomStickyTurn?.message.text)

		return (
			<>
				{/* Top Sticky Prompt Bar */}
				{topStickyTurn && (
					<div
						data-testid="sticky-user-top"
						className="absolute top-0 left-0 right-0 z-20 px-3 py-1.5 bg-[#18181b]/95 backdrop-blur border-b border-white/[0.08] flex items-center justify-between gap-2 shadow-sm text-xs animate-in fade-in slide-in-from-top-1 duration-150">
						<div className="flex items-center gap-1.5 min-w-0 flex-1">
							<span className="size-1.5 rounded-full bg-blue-400 shrink-0" />
							<span className="text-[11px] font-semibold text-zinc-400 shrink-0 uppercase tracking-wider">
								Prompt
							</span>
							<span
								className="text-zinc-200 text-xs truncate font-medium cursor-pointer hover:text-white transition-colors"
								title={topStickyTurn.message.text}
								onClick={() => onJumpToMessage(topStickyTurn.index)}>
								{topPreview}
							</span>
						</div>
						<button
							type="button"
							onClick={() => onJumpToMessage(topStickyTurn.index)}
							className="px-2 py-0.5 rounded text-[11px] font-medium bg-white/10 hover:bg-white/15 text-zinc-200 flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
							title="Scroll up to this user prompt">
							<span>Go to prompt</span>
							<ChevronUp className="size-3" />
						</button>
					</div>
				)}

				{/* Bottom Sticky Prompt Pill */}
				{bottomStickyTurn && (
					<div
						data-testid="sticky-user-bottom"
						className={cn(
							"absolute left-0 right-0 z-20 px-4 flex justify-center pointer-events-none animate-in fade-in slide-in-from-bottom-2 duration-150",
							hasFloatingChatHud ? "bottom-10" : "bottom-2",
						)}>
						<button
							type="button"
							onClick={() => onJumpToMessage(bottomStickyTurn.index)}
							className="pointer-events-auto max-w-[85%] px-3 py-1 rounded-full bg-[#202026]/95 hover:bg-[#282830] backdrop-blur border border-white/10 hover:border-white/20 shadow-lg shadow-black/40 flex items-center gap-2 text-xs text-zinc-200 transition-all cursor-pointer group"
							title={bottomStickyTurn.message.text}>
							<span className="size-1.5 rounded-full bg-emerald-400 shrink-0" />
							<span className="text-[11px] font-medium text-zinc-400 shrink-0">Next prompt:</span>
							<span className="text-[11px] text-zinc-200 truncate font-medium max-w-[180px]">
								{bottomPreview}
							</span>
							<span className="inline-flex items-center gap-0.5 text-[10px] font-semibold bg-white/10 group-hover:bg-white/20 px-1.5 py-0.5 rounded-full text-zinc-200 ml-0.5 shrink-0 transition-colors">
								Jump <ChevronDown className="size-3" />
							</span>
						</button>
					</div>
				)}
			</>
		)
	},
)

import React, { memo, useEffect, useState } from "react"
import { ChevronDown, History } from "lucide-react"
import { cn } from "@/lib/utils"
import type { MirrorMessage } from "@mirror-vs/types"

interface FloatingChatHudProps {
	show: boolean
	isStreaming?: boolean
	lastMessage?: MirrorMessage
	hasLatestCheckpoint?: boolean
	onScrollToBottom: () => void
	onScrollToCheckpoint?: () => void
}

export const FloatingChatHud = memo(
	({
		show,
		isStreaming = false,
		lastMessage,
		hasLatestCheckpoint = false,
		onScrollToBottom,
		onScrollToCheckpoint,
	}: FloatingChatHudProps) => {
		const [seconds, setSeconds] = useState(1)

		const isReasoning = isStreaming && lastMessage?.say === "reasoning" && !lastMessage?.duration

		// Track elapsed seconds while reasoning actively streams
		useEffect(() => {
			if (!isReasoning) {
				setSeconds(1)
				return
			}
			const timer = setInterval(() => {
				setSeconds((s) => s + 1)
			}, 1000)
			return () => clearInterval(timer)
		}, [isReasoning])

		if (!show) {
			return null
		}

		return (
			<div className="absolute bottom-2 left-0 right-0 flex items-center justify-center pointer-events-none z-20 px-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
				<div className="flex items-center gap-1.5 pointer-events-auto shadow-lg shadow-black/20">
					{/* Main Status & Jump Button */}
					<button
						onClick={onScrollToBottom}
						className={cn(
							"h-6.5 px-2.5 rounded-md flex items-center gap-1.5 text-xs font-medium cursor-pointer transition-colors duration-150",
							"bg-vscode-editor-background hover:bg-vscode-sideBar-background text-vscode-foreground",
							"border border-vscode-panel-border/80 shadow-sm",
						)}
						title="Jump to latest message">
						{isReasoning ? (
							<>
								<span className="size-1.5 rounded-full bg-vscode-focusBorder animate-pulse shrink-0" />
								<span className="text-vscode-foreground font-medium">Thinking · {seconds}s</span>
							</>
						) : isStreaming ? (
							<>
								<span className="size-1.5 rounded-full bg-vscode-focusBorder animate-pulse shrink-0" />
								<span className="text-vscode-foreground font-medium">Working...</span>
							</>
						) : (
							<span className="text-vscode-descriptionForeground hover:text-vscode-foreground">
								Jump to bottom
							</span>
						)}
						<ChevronDown className="size-3 text-vscode-descriptionForeground shrink-0" />
					</button>

					{/* Checkpoint button if available */}
					{hasLatestCheckpoint && onScrollToCheckpoint && (
						<button
							onClick={onScrollToCheckpoint}
							className={cn(
								"h-6.5 px-2 rounded-md flex items-center gap-1 text-xs font-medium cursor-pointer transition-colors duration-150",
								"bg-vscode-editor-background hover:bg-vscode-sideBar-background text-vscode-descriptionForeground hover:text-vscode-foreground",
								"border border-vscode-panel-border/80 shadow-sm",
							)}
							title="Scroll to latest checkpoint">
							<History className="size-3 shrink-0" />
							<span>Checkpoint</span>
						</button>
					)}
				</div>
			</div>
		)
	},
)

FloatingChatHud.displayName = "FloatingChatHud"
export default FloatingChatHud

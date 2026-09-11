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
							"h-7 px-3 rounded-full flex items-center gap-1.5 text-xs font-medium cursor-pointer transition-all duration-150",
							"bg-vscode-sideBar-background/90 hover:bg-vscode-sideBar-background text-vscode-foreground",
							"border border-vscode-panel-border/60 hover:border-mirror-brand-via/50 backdrop-blur-md",
							"hover:scale-[1.02] active:scale-[0.98]",
						)}
						title="Jump to latest message">
						{isReasoning ? (
							<>
								<span className="relative flex h-2 w-2 mr-0.5">
									<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-mirror-brand-via opacity-75" />
									<span className="relative inline-flex rounded-full h-2 w-2 bg-mirror-brand-via" />
								</span>
								<span className="bg-gradient-to-r from-mirror-brand-from via-mirror-brand-via to-mirror-brand-to bg-clip-text text-transparent font-semibold">
									Thinking · {seconds}s
								</span>
							</>
						) : isStreaming ? (
							<>
								<span className="relative flex h-2 w-2 mr-0.5">
									<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-mirror-brand-via opacity-75" />
									<span className="relative inline-flex rounded-full h-2 w-2 bg-mirror-brand-via" />
								</span>
								<span className="text-vscode-foreground font-medium">Working...</span>
							</>
						) : (
							<span className="text-vscode-descriptionForeground hover:text-vscode-foreground">
								Jump to bottom
							</span>
						)}
						<ChevronDown className="size-3.5 text-vscode-descriptionForeground shrink-0" />
					</button>

					{/* Checkpoint button if available */}
					{hasLatestCheckpoint && onScrollToCheckpoint && (
						<button
							onClick={onScrollToCheckpoint}
							className={cn(
								"h-7 px-2.5 rounded-full flex items-center gap-1 text-xs font-medium cursor-pointer transition-all duration-150",
								"bg-vscode-sideBar-background/90 hover:bg-vscode-sideBar-background text-vscode-descriptionForeground hover:text-vscode-foreground",
								"border border-vscode-panel-border/60 hover:border-mirror-brand-via/50 backdrop-blur-md",
								"hover:scale-[1.02] active:scale-[0.98]",
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

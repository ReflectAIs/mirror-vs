import { memo } from "react"
import { CircleUser, ArrowDownRight } from "lucide-react"
import { cn } from "@src/lib/utils"
import type { MirrorMessage } from "@mirror-vs/types"
import { StandardTooltip } from "@src/components/ui"

interface StickyUserMessageProps {
	message: MirrorMessage | null
	onScrollToMessage: (ts: number) => void
}

export const StickyUserMessage = memo(({ message, onScrollToMessage }: StickyUserMessageProps) => {
	if (!message || !message.text) {
		return null
	}

	const displayText = message.text.trim()

	return (
		<div className="pt-1 pb-1 px-3 shrink-0 z-10 sticky top-0">
			<StandardTooltip content="Jump to this message in chat">
				<button
					onClick={() => onScrollToMessage(message.ts)}
					className={cn(
						"w-full flex items-center justify-between px-3 py-1.5 rounded-lg transition-all duration-150",
						"border border-white/5 bg-[rgba(20,20,28,0.75)] backdrop-blur-md shadow-sm",
						"hover:border-mirror-brand-via/30 hover:bg-[rgba(28,28,38,0.9)] cursor-pointer text-left",
						"text-vscode-foreground select-none group",
					)}>
					<div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
						<CircleUser className="w-3.5 h-3.5 text-mirror-brand-via shrink-0 group-hover:scale-110 transition-transform" />
						<span className="text-[11px] font-semibold text-vscode-foreground shrink-0">
							You:
						</span>
						<span className="text-[11px] text-vscode-descriptionForeground truncate font-normal">
							{displayText}
						</span>
					</div>
					<div className="flex items-center gap-1 shrink-0 text-vscode-descriptionForeground group-hover:text-mirror-brand-via transition-colors">
						<span className="text-[10px] hidden group-hover:inline">Jump</span>
						<ArrowDownRight className="w-3 h-3" />
					</div>
				</button>
			</StandardTooltip>
		</div>
	)
})

StickyUserMessage.displayName = "StickyUserMessage"

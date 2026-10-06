import React from "react"
import { MessageSquarePlus, Plus } from "lucide-react"

import MirrorTips from "@src/components/welcome/MirrorTips"
import { vscode } from "@src/utils/vscode"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatWelcomeContentProps {
	taskHistoryLength: number
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ChatWelcomeContent = ({ taskHistoryLength }: ChatWelcomeContentProps) => {
	const handleNewChat = () => {
		vscode.postMessage({ type: "newTask", text: "", images: [] })
	}

	return (
		<div className="flex flex-col h-full min-h-0 relative">
			<div className="flex-1 overflow-y-auto p-5 flex flex-col justify-start gap-4">
				<div className="flex flex-col items-center justify-center py-6 px-4 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center shadow-xs">
					<div className="w-10 h-10 rounded-full bg-mirror-brand-from/10 border border-mirror-brand-from/20 flex items-center justify-center text-mirror-brand-from mb-3">
						<MessageSquarePlus className="w-5 h-5" />
					</div>
					<h3 className="text-sm font-semibold text-vscode-foreground mb-1">Start a New Chat</h3>
					<p className="text-xs text-vscode-descriptionForeground max-w-[280px] mb-4">
						Type your instructions in the prompt below, or click to open a new tab in this session.
					</p>
					<button
						onClick={handleNewChat}
						className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-mirror-brand-from hover:bg-mirror-brand-from/90 text-white transition-colors cursor-pointer shadow-sm">
						<Plus className="w-3.5 h-3.5" />
						New Tab
					</button>
				</div>
				<div className="flex flex-col gap-4 w-full pt-1">{taskHistoryLength < 6 && <MirrorTips />}</div>
			</div>
		</div>
	)
}

export default ChatWelcomeContent

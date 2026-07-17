import React from "react"
import MirrorTips from "@src/components/welcome/MirrorTips"

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
	return (
		<div className="flex flex-col h-full min-h-0 relative">
			<div className="flex-1 overflow-y-auto p-5 flex flex-col justify-start gap-4">
				<div className="flex flex-col gap-4 w-full pt-2">{taskHistoryLength < 6 && <MirrorTips />}</div>
			</div>
		</div>
	)
}

export default ChatWelcomeContent

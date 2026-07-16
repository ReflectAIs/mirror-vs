import React from "react"
import { Terminal } from "lucide-react"

import { cn } from "@/lib/utils"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useMirrorPortal } from "@/components/ui/hooks/useMirrorPortal"
import { Popover, PopoverContent, PopoverTrigger, StandardTooltip } from "@/components/ui"

interface TerminalStatusBadgeProps {
	className?: string
}

export const TerminalStatusBadge: React.FC<TerminalStatusBadgeProps> = ({ className }) => {
	const [open, setOpen] = React.useState(false)
	const portalContainer = useMirrorPortal("mirror-portal")
	const { activeTerminalCount, activeTerminals } = useExtensionState()

	const count = activeTerminalCount ?? 0

	if (count === 0) {
		return null
	}

	return (
		<Popover open={open} onOpenChange={setOpen} data-testid="terminal-status-root">
			<StandardTooltip content={`${count} active terminal${count !== 1 ? "s" : ""} running`}>
				<PopoverTrigger
					data-testid="terminal-status-trigger"
					className={cn(
						"inline-flex items-center gap-1 relative whitespace-nowrap px-1.5 py-1 text-xs",
						"bg-transparent border border-[rgba(255,255,255,0.08)] rounded-md text-vscode-foreground",
						"transition-all duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-vscode-focusBorder focus-visible:ring-inset",
						"opacity-90 hover:opacity-100 hover:bg-[rgba(255,255,255,0.03)] hover:border-[rgba(255,255,255,0.15)] cursor-pointer",
						className,
					)}>
					<Terminal className="size-3 flex-shrink-0 text-green-500" />
					<span className="hidden min-[450px]:inline truncate min-w-0">{count}</span>
				</PopoverTrigger>
			</StandardTooltip>
			<PopoverContent
				align="start"
				sideOffset={4}
				container={portalContainer}
				className="p-0 overflow-hidden w-[min(400px,calc(100vw-2rem))]"
				onOpenAutoFocus={(e) => e.preventDefault()}>
				<div className="flex flex-col w-full max-h-[70vh]">
					{/* Header */}
					<div className="p-3 border-b border-vscode-dropdown-border shrink-0">
						<h4 className="m-0 font-bold text-base text-vscode-foreground">Active Terminals</h4>
						<p className="m-0 mt-0.5 text-xs text-vscode-descriptionForeground">
							{count} terminal{count !== 1 ? "s" : ""} currently running
						</p>
					</div>

					{/* Terminal list */}
					<div className="flex-1 overflow-y-auto">
						<div className="flex flex-col">
							{activeTerminals.map((term) => (
								<TerminalRow key={term.id} terminal={term} />
							))}
						</div>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	)
}

/**
 * A single terminal row in the popover list.
 */
const TerminalRow = React.memo(
	({ terminal }: { terminal: { id: number; command: string; cwd: string; taskId?: string } }) => {
		const displayCommand = terminal.command || "Ready"
		const displayCwd = terminal.cwd || "—"

		return (
			<div className="flex flex-col gap-0.5 px-3 py-2.5 border-b border-vscode-dropdown-border last:border-b-0 hover:bg-[rgba(255,255,255,0.03)] transition-colors">
				<div className="flex items-center gap-2">
					<span className="text-[10px] font-semibold text-vscode-descriptionForeground uppercase tracking-wider shrink-0">
						#{terminal.id}
					</span>
					{terminal.taskId && (
						<span className="text-[10px] text-vscode-descriptionForeground truncate shrink-0 max-w-[120px]">
							task: {terminal.taskId}
						</span>
					)}
				</div>
				<div className="flex items-center gap-1.5 min-w-0">
					<span className="text-xs font-mono text-vscode-foreground truncate" title={displayCommand}>
						{displayCommand}
					</span>
				</div>
				{displayCwd !== "—" && (
					<div className="flex items-center gap-1 min-w-0">
						<span className="text-[10px] text-vscode-descriptionForeground truncate" title={displayCwd}>
							{displayCwd}
						</span>
					</div>
				)}
			</div>
		)
	},
)

TerminalRow.displayName = "TerminalRow"

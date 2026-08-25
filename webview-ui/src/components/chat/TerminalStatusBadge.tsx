import React from "react"
import { Terminal, Server, OctagonX } from "lucide-react"

import { cn } from "@/lib/utils"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useMirrorPortal } from "@/components/ui/hooks/useMirrorPortal"
import { vscode } from "@/utils/vscode"
import { Popover, PopoverContent, PopoverTrigger, StandardTooltip, Button } from "@/components/ui"

interface TerminalStatusBadgeProps {
	className?: string
}

export const TerminalStatusBadge: React.FC<TerminalStatusBadgeProps> = ({ className }) => {
	const [open, setOpen] = React.useState(false)
	const portalContainer = useMirrorPortal("mirror-portal")
	const { activeTerminalCount, activeTerminals = [] } = useExtensionState()

	const count = activeTerminalCount ?? 0

	return (
		<Popover open={open} onOpenChange={setOpen} data-testid="terminal-status-root">
			<StandardTooltip
				content={
					count > 0 ? `${count} active terminal${count !== 1 ? "s" : ""} running` : "No active terminals"
				}>
				<PopoverTrigger
					data-testid="terminal-status-trigger"
					className={cn(
						"inline-flex items-center gap-1 relative whitespace-nowrap px-1.5 py-1 text-xs",
						"bg-transparent border border-[rgba(255,255,255,0.08)] rounded-md text-vscode-foreground",
						"transition-all duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-vscode-focusBorder focus-visible:ring-inset",
						"opacity-90 hover:opacity-100 hover:bg-[rgba(255,255,255,0.03)] hover:border-[rgba(255,255,255,0.15)] cursor-pointer",
						className,
					)}>
					<Terminal
						className={cn(
							"size-3 flex-shrink-0",
							count > 0 ? "text-green-500" : "text-vscode-descriptionForeground",
						)}
					/>
					<span className="hidden min-[450px]:inline truncate min-w-0">{count > 0 ? count : "—"}</span>
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
						<h4 className="m-0 font-bold text-base text-vscode-foreground">
							{count > 0 ? "Active Terminals" : "Terminals"}
						</h4>
						<p className="m-0 mt-0.5 text-xs text-vscode-descriptionForeground">
							{count > 0
								? `${count} terminal${count !== 1 ? "s" : ""} currently running`
								: "No terminals are currently running"}
						</p>
					</div>

					{/* Terminal list */}
					<div className="flex-1 overflow-y-auto">
						{activeTerminals.length > 0 ? (
							<div className="flex flex-col">
								{activeTerminals.map((term) => (
									<TerminalRow key={term.id} terminal={term} onClose={() => setOpen(false)} />
								))}
							</div>
						) : (
							<div className="p-6 text-center text-xs text-vscode-descriptionForeground">
								No active terminals or SSH sessions.
							</div>
						)}
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
	({
		terminal,
		onClose,
	}: {
		terminal: {
			id: number
			command: string
			cwd: string
			taskId?: string
			type?: "terminal" | "ssh"
			host?: string
			port?: number
		}
		onClose?: () => void
	}) => {
		const displayCommand = terminal.command || (terminal.type === "ssh" ? "SSH Session" : "Ready")
		const displayCwd = terminal.cwd || "—"

		const handleKill = (e: React.MouseEvent) => {
			e.stopPropagation()
			vscode.postMessage({
				type: "killTerminal",
				terminalId: terminal.id,
				terminalType: terminal.type || "terminal",
			})
		}

		const handleRowClick = () => {
			if (terminal.command) {
				const allRows = document.querySelectorAll("[data-ts]")
				for (let i = allRows.length - 1; i >= 0; i--) {
					const el = allRows[i] as HTMLElement
					if (el.textContent?.includes(terminal.command)) {
						el.scrollIntoView({ behavior: "smooth", block: "center" })
						el.classList.add("ring-2", "ring-mirror-brand-via/60", "transition-all")
						setTimeout(() => {
							el.classList.remove("ring-2", "ring-mirror-brand-via/60", "transition-all")
						}, 2000)
						break
					}
				}
			}
			onClose?.()
		}

		return (
			<div
				onClick={handleRowClick}
				className="flex flex-col gap-0.5 px-3 py-2.5 border-b border-vscode-dropdown-border last:border-b-0 hover:bg-[rgba(255,255,255,0.06)] cursor-pointer transition-colors group">
				<div className="flex items-center gap-2">
					{terminal.type === "ssh" ? (
						<Server className="size-3 text-amber-500 shrink-0" />
					) : (
						<Terminal className="size-3 text-green-500 shrink-0" />
					)}
					<span className="text-[10px] font-semibold text-vscode-descriptionForeground uppercase tracking-wider shrink-0">
						{terminal.type === "ssh" ? `SSH` : `#${terminal.id}`}
					</span>
					{terminal.taskId && (
						<span className="text-[10px] text-vscode-descriptionForeground truncate shrink-0 max-w-[120px]">
							task: {terminal.taskId}
						</span>
					)}
					<div className="flex-1" />
					<Button
						variant="ghost"
						size="icon"
						className="size-5 opacity-0 group-hover:opacity-100 transition-opacity"
						onClick={handleKill}
						title="Terminate process">
						<OctagonX className="size-3.5 text-red-400 hover:text-red-300" />
					</Button>
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

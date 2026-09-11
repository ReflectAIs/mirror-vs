import React, { memo, useState } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@src/lib/utils"

interface ToolDisclosureProps {
	title: React.ReactNode
	children: React.ReactNode
	defaultExpanded?: boolean
	isExpanded?: boolean
	onToggle?: () => void
	status?: React.ReactNode
	className?: string
	contentClassName?: string
}

export const ToolDisclosure = memo(
	({
		title,
		children,
		defaultExpanded = false,
		isExpanded: controlledExpanded,
		onToggle,
		status,
		className,
		contentClassName,
	}: ToolDisclosureProps) => {
		const [internalExpanded, setInternalExpanded] = useState(defaultExpanded)
		const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded

		const handleToggle = () => {
			if (onToggle) {
				onToggle()
			} else {
				setInternalExpanded((prev) => !prev)
			}
		}

		return (
			<div className={cn("my-1 select-none", className)}>
				<div
					onClick={handleToggle}
					className="flex items-center gap-1.5 py-1 px-1 rounded hover:bg-vscode-list-hoverBackground/30 text-xs text-vscode-descriptionForeground hover:text-vscode-foreground cursor-pointer transition-colors group">
					<span className="font-normal flex items-center gap-1.5">{title}</span>
					<ChevronDown
						className={cn(
							"size-3 text-vscode-descriptionForeground/70 transition-transform duration-150 shrink-0",
							isExpanded ? "rotate-0" : "-rotate-90",
						)}
					/>
					{status && <div className="ml-auto text-[11px] shrink-0 font-normal">{status}</div>}
				</div>
				{isExpanded && (
					<div className={cn("pl-2 pt-0.5 pb-1 flex flex-col gap-0.5", contentClassName)}>{children}</div>
				)}
			</div>
		)
	},
)

ToolDisclosure.displayName = "ToolDisclosure"

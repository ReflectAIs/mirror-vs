import React, { memo, useState } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@src/lib/utils"

interface ToolDisclosureProps {
	title: React.ReactNode
	children: React.ReactNode
	defaultExpanded?: boolean
	isExpanded?: boolean
	onToggle?: () => void
	onRowClick?: () => void
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
		onRowClick,
		status,
		className,
		contentClassName,
	}: ToolDisclosureProps) => {
		const [internalExpanded, setInternalExpanded] = useState(defaultExpanded)
		const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded

		const handleToggle = (e?: React.MouseEvent) => {
			e?.stopPropagation()
			if (onToggle) {
				onToggle()
			} else {
				setInternalExpanded((prev) => !prev)
			}
		}

		const handleRowClick = (e: React.MouseEvent) => {
			if (onRowClick) {
				onRowClick()
			} else {
				handleToggle(e)
			}
		}

		return (
			<div className={cn("my-1 select-none min-w-0 max-w-full", className)}>
				<div
					onClick={handleRowClick}
					className="flex items-center gap-1.5 py-1 px-1 rounded hover:bg-vscode-list-hoverBackground/30 text-xs text-vscode-descriptionForeground hover:text-vscode-foreground cursor-pointer transition-colors group min-w-0 max-w-full overflow-hidden">
					<span
						className="font-normal flex items-center gap-1.5 min-w-0 flex-1 truncate"
						title={typeof title === "string" ? title : undefined}>
						{title}
					</span>
					<button
						type="button"
						onClick={handleToggle}
						className="p-0.5 rounded hover:bg-vscode-toolbar-hoverBackground/60 text-vscode-descriptionForeground hover:text-vscode-foreground transition-colors shrink-0 flex items-center justify-center cursor-pointer"
						title={isExpanded ? "Collapse" : "Expand preview"}>
						<ChevronDown
							className={cn(
								"size-3.5 text-vscode-descriptionForeground/70 group-hover:text-vscode-foreground transition-transform duration-150 shrink-0",
								isExpanded ? "rotate-0" : "-rotate-90",
							)}
						/>
					</button>
					{status && <div className="ml-auto text-[11px] shrink-0 font-normal pl-1">{status}</div>}
				</div>
				{isExpanded && (
					<div
						className={cn(
							"pl-2 pt-0.5 pb-1 flex flex-col gap-0.5 min-w-0 max-w-full overflow-hidden",
							contentClassName,
						)}>
						{children}
					</div>
				)}
			</div>
		)
	},
)

ToolDisclosure.displayName = "ToolDisclosure"

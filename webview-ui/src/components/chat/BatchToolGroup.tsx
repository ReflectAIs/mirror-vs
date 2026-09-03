import { memo, useState } from "react"
import { ChevronDown, ChevronRight, Wrench, CheckCircle2, Loader2, AlertCircle } from "lucide-react"
import { cn } from "@src/lib/utils"

export interface BatchToolItem {
	id: string
	type: string
	name: string
	status: "completed" | "running" | "error"
	summary?: string
	details?: React.ReactNode
}

export interface BatchToolGroupProps {
	title?: string
	tools: BatchToolItem[]
	defaultExpanded?: boolean
	className?: string
}

export const BatchToolGroup = memo(({
	title,
	tools = [],
	defaultExpanded = false,
	className,
}: BatchToolGroupProps) => {
	const [isExpanded, setIsExpanded] = useState(defaultExpanded)

	if (!tools || tools.length === 0) {
		return null
	}

	const hasRunning = tools.some((t) => t.status === "running")
	const hasError = tools.some((t) => t.status === "error")
	const completedCount = tools.filter((t) => t.status === "completed").length

	const displayTitle =
		title ||
		`Executed ${tools.length} tool${tools.length === 1 ? "" : "s"}${
			hasRunning ? " (in progress...)" : ""
		}`

	return (
		<div className={cn("my-1.5 rounded-lg border border-white/5 bg-[rgba(20,20,28,0.6)] overflow-hidden transition-all duration-150", className)}>
			<button
				onClick={() => setIsExpanded(!isExpanded)}
				className={cn(
					"w-full flex items-center justify-between px-3 py-2 text-left cursor-pointer select-none",
					"bg-transparent hover:bg-white/[0.03] transition-colors",
					"text-vscode-foreground text-xs font-medium border-none",
				)}>
				<div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
					<div className="w-4 h-4 rounded flex items-center justify-center bg-white/5 text-vscode-descriptionForeground shrink-0">
						{hasRunning ? (
							<Loader2 className="w-3 h-3 text-mirror-brand-via animate-spin" />
						) : hasError ? (
							<AlertCircle className="w-3 h-3 text-rose-400" />
						) : (
							<Wrench className="w-3 h-3 text-emerald-400" />
						)}
					</div>
					<span className="truncate text-vscode-foreground/90 font-mono text-[11.5px]">
						{displayTitle}
					</span>
				</div>

				<div className="flex items-center gap-2 shrink-0">
					<span className="text-[10.5px] px-1.5 py-0.5 rounded-full bg-white/5 text-vscode-descriptionForeground font-mono">
						{completedCount}/{tools.length}
					</span>
					{isExpanded ? (
						<ChevronDown className="w-3.5 h-3.5 text-vscode-descriptionForeground" />
					) : (
						<ChevronRight className="w-3.5 h-3.5 text-vscode-descriptionForeground" />
					)}
				</div>
			</button>

			{isExpanded && (
				<div className="px-3 pb-2.5 pt-1 border-t border-white/5 flex flex-col gap-1.5 text-xs">
					{tools.map((item, idx) => (
						<div
							key={item.id || idx}
							className="flex flex-col gap-1 p-2 rounded bg-black/20 border border-white/[0.03]">
							<div className="flex items-center justify-between text-[11px]">
								<div className="flex items-center gap-1.5 min-w-0">
									{item.status === "completed" ? (
										<CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
									) : item.status === "running" ? (
										<Loader2 className="w-3 h-3 text-mirror-brand-via animate-spin shrink-0" />
									) : (
										<AlertCircle className="w-3 h-3 text-rose-400 shrink-0" />
									)}
									<span className="font-semibold text-vscode-foreground truncate">
										{item.name}
									</span>
								</div>
								{item.summary && (
									<span className="text-vscode-descriptionForeground text-[10px] truncate max-w-[50%]">
										{item.summary}
									</span>
								)}
							</div>
							{item.details && <div className="mt-1">{item.details}</div>}
						</div>
					))}
				</div>
			)}
		</div>
	)
})

BatchToolGroup.displayName = "BatchToolGroup"

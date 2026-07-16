import React, { useMemo } from "react"
import { Sparkles, ImageIcon, LoaderCircle } from "lucide-react"
import { CircularProgress } from "../ui/circular-progress"
import { cn } from "@/lib/utils"

interface ImageProgressData {
	stage?: string
	progress: number
	value?: number
	max?: number
	state?: string
	eta?: number
	currentNode?: string
}

interface ImageProgressRowProps {
	text?: string
	partial?: boolean
}

/**
 * An animated image generation progress row that displays a circular progress ring,
 * stage label, step counter, ETA, and current node. When `partial` is true, the
 * component adds a subtle pulse animation to indicate ongoing activity.
 *
 * The `text` field is expected to contain a JSON string matching ImageProgressData.
 */
export const ImageProgressRow: React.FC<ImageProgressRowProps> = ({ text, partial }) => {
	const data = useMemo<ImageProgressData | null>(() => {
		if (!text) return null
		try {
			return JSON.parse(text) as ImageProgressData
		} catch {
			return null
		}
	}, [text])

	if (!data) {
		return null
	}

	const { progress, stage, value, max, state, eta, currentNode } = data
	const clampedProgress = Math.max(0, Math.min(100, progress ?? 0))
	const isRunning = partial || state === "running" || state === "preparing"
	const isComplete = state === "completed"
	const isFailed = state === "failed"

	// Determine icon and label color based on state
	const iconColor = isFailed
		? "text-vscode-errorForeground"
		: isComplete
			? "text-vscode-testing-iconPassed"
			: "text-vscode-chart-yellow"

	const IconComponent = isFailed ? LoaderCircle : isComplete ? Sparkles : ImageIcon

	const stageLabel = stage || "generating"
	const stepInfo = value !== undefined && max !== undefined && max > 0 ? `${value}/${max}` : null
	const etaInfo = eta !== undefined && eta > 0 ? `${Math.round(eta)}s` : null

	return (
		<div className="group pr-2 py-2">
			<div className="flex items-center gap-3">
				{/* Animated circular progress ring */}
				<div className={cn("shrink-0", isRunning && "animate-pulse")}>
					<CircularProgress
						percentage={clampedProgress}
						size={24}
						strokeWidth={2.5}
						className={cn(
							"transition-colors duration-300",
							isFailed && "text-vscode-errorForeground",
							isComplete && "text-vscode-testing-iconPassed",
							isRunning && "text-vscode-chart-yellow",
						)}
					/>
				</div>

				{/* Stage + step details */}
				<div className="flex flex-col min-w-0 gap-0.5">
					<div className="flex items-center gap-1.5">
						<IconComponent className={cn("size-3.5 shrink-0", iconColor)} />
						<span className="font-medium text-sm text-vscode-foreground truncate">{stageLabel}</span>
						{isRunning && (
							<LoaderCircle className="size-3 shrink-0 animate-spin text-vscode-descriptionForeground" />
						)}
					</div>

					{/* Secondary info line: progress %, step, ETA, node */}
					<div className="flex items-center gap-2 text-xs text-vscode-descriptionForeground">
						<span>{Math.round(clampedProgress)}%</span>
						{stepInfo && (
							<>
								<span className="opacity-40">·</span>
								<span>{stepInfo} steps</span>
							</>
						)}
						{etaInfo && (
							<>
								<span className="opacity-40">·</span>
								<span>~{etaInfo}</span>
							</>
						)}
						{currentNode && (
							<>
								<span className="opacity-40">·</span>
								<span className="truncate max-w-[120px]" title={currentNode}>
									{currentNode}
								</span>
							</>
						)}
					</div>
				</div>
			</div>
		</div>
	)
}

export default ImageProgressRow

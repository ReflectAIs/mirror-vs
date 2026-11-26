import React, { useMemo } from "react"
import { Sparkles, ImageIcon, LoaderCircle, Square } from "lucide-react"
import { CircularProgress } from "../ui/circular-progress"
import { cn } from "@/lib/utils"
import { vscode } from "@/utils/vscode"

interface ImageProgressData {
	stage?: string
	progress: number
	value?: number
	max?: number
	state?: string
	eta?: number
	currentNode?: string
	previewDataUrl?: string
}

interface ImageProgressRowProps {
	text?: string
	partial?: boolean
	isStreaming?: boolean
}

/**
 * An animated image generation progress row that displays a circular progress ring,
 * stage label, step counter, ETA, and current node. When `partial` is true, the
 * component adds a subtle pulse animation to indicate ongoing activity.
 *
 * The `text` field is expected to contain a JSON string matching ImageProgressData.
 */
export const ImageProgressRow: React.FC<ImageProgressRowProps> = ({ text, partial, isStreaming = true }) => {
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

	const { progress, stage, value, max, state, eta, currentNode, previewDataUrl } = data
	const clampedProgress = Math.max(0, Math.min(100, progress ?? 0))
	const isComplete = state === "completed"
	const isFailed = state === "failed"
	const isInterrupted = !isStreaming && !isComplete && !isFailed
	const isRunning = !isInterrupted && (partial || state === "running" || state === "preparing")

	// Determine icon and label color based on state
	const iconColor = isFailed
		? "text-vscode-errorForeground"
		: isComplete
			? "text-vscode-testing-iconPassed"
			: "text-vscode-chart-yellow"

	const IconComponent = isFailed ? LoaderCircle : isComplete ? Sparkles : ImageIcon

	const stageLabel = isInterrupted ? "Image generation cancelled" : stage || "generating"
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
						{isRunning && !isComplete && !isFailed && (
							<button
								type="button"
								onClick={() => vscode.postMessage({ type: "cancelImageGeneration" } as any)}
								className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-vscode-button-secondaryBackground hover:bg-vscode-button-secondaryHoverBackground text-vscode-button-secondaryForeground border border-vscode-editorGroup-border/50 cursor-pointer transition-colors"
								title="Interrupt image generation">
								<Square className="size-2.5 fill-current" />
								<span>Stop</span>
							</button>
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

			{/* Gemini-style animated generation canvas / live latent preview while running */}
			{isRunning && !isFailed && (
				<div
					data-testid="gemini-image-placeholder"
					className="relative mt-2.5 w-64 sm:w-72 aspect-square rounded-xl overflow-hidden border border-vscode-editorGroup-border/60 bg-vscode-editor-background/60 shadow-md">
					{/* Live latent preview from ComfyUI WebSocket, progressively sharpening */}
					{previewDataUrl && (
						<img
							src={previewDataUrl}
							alt="Live image preview"
							className="absolute inset-0 w-full h-full object-cover transition-all duration-500"
							style={{
								filter: `blur(${Math.max(0, Math.round((1 - clampedProgress / 100) * 12))}px)`,
								transform: "scale(1.03)",
							}}
						/>
					)}

					{/* Animated Gemini-style iridescent aurora mesh */}
					<div
						className={cn(
							"absolute inset-0 gemini-aurora-bg backdrop-blur-xl transition-opacity duration-500",
							previewDataUrl ? "opacity-30 backdrop-blur-[2px]" : "opacity-100",
						)}
					/>

					{/* Sweeping diagonal light shimmer */}
					<div className="pointer-events-none absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/20 to-transparent gemini-shimmer-sweep" />

					{/* Center frosted sparkle pill */}
					<div className="relative z-10 h-full w-full flex flex-col items-center justify-center p-4 text-center">
						<div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/35 backdrop-blur-md border border-white/15 text-white text-xs font-medium shadow-sm">
							<Sparkles className="size-3.5 text-amber-300 animate-pulse" />
							<span>{previewDataUrl ? "Refining image..." : "Creating image..."}</span>
						</div>
					</div>

					{/* Bottom smooth progress bar */}
					<div className="absolute inset-x-0 bottom-0 h-1 bg-black/25">
						<div
							className="h-full bg-gradient-to-r from-blue-400 via-purple-400 to-amber-300 transition-all duration-300"
							style={{ width: `${Math.max(4, clampedProgress)}%` }}
						/>
					</div>
				</div>
			)}
		</div>
	)
}

export default ImageProgressRow

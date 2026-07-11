import React from "react"
import { FileText, Eye, FileCode } from "lucide-react"

import { cn } from "@/lib/utils"

import { useExtensionState } from "@/context/ExtensionStateContext"
import { vscode } from "@/utils/vscode"

import { useMirrorPortal } from "@/components/ui/hooks/useMirrorPortal"

import { Popover, PopoverContent, PopoverTrigger, StandardTooltip } from "@/components/ui"
import { artifactsFromMessages, type ArtifactEntry } from "./utils/artifactsFromMessages"

interface SessionArtifactsProps {
	triggerClassName?: string
}

function formatTimestamp(ts: number): string {
	const date = new Date(ts)
	const hours = date.getHours().toString().padStart(2, "0")
	const minutes = date.getMinutes().toString().padStart(2, "0")
	const seconds = date.getSeconds().toString().padStart(2, "0")
	return `${hours}:${minutes}:${seconds}`
}

/** Extract short filename from a path like "docs/plan.md" → "plan.md" */
function shortPath(p: string): string {
	const parts = p.split("/")
	return parts[parts.length - 1] ?? p
}

export const SessionArtifacts = ({ triggerClassName = "" }: SessionArtifactsProps) => {
	const [open, setOpen] = React.useState(false)
	const portalContainer = useMirrorPortal("mirror-portal")
	const { mirrorMessages } = useExtensionState()

	const artifacts = React.useMemo(() => {
		return artifactsFromMessages(mirrorMessages)
	}, [mirrorMessages])

	const totalCount = artifacts.length

	const handleOpenFile = React.useCallback((path: string) => {
		vscode.postMessage({ type: "openFile", text: path.startsWith("./") ? path : "./" + path })
	}, [])

	return (
		<Popover open={open} onOpenChange={setOpen} data-testid="session-artifacts-root">
			<StandardTooltip
				content={
					totalCount > 0
						? `${totalCount} artifact${totalCount !== 1 ? "s" : ""} in this session`
						: "No artifacts yet"
				}>
				<PopoverTrigger
					data-testid="session-artifacts-trigger"
					className={cn(
						"inline-flex items-center gap-1 relative whitespace-nowrap px-1.5 py-1 text-xs",
						"bg-transparent border border-[rgba(255,255,255,0.08)] rounded-md text-vscode-foreground",
						"transition-all duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-vscode-focusBorder focus-visible:ring-inset",
						"opacity-90 hover:opacity-100 hover:bg-[rgba(255,255,255,0.03)] hover:border-[rgba(255,255,255,0.15)] cursor-pointer",
						totalCount === 0 && "opacity-50",
						triggerClassName,
					)}>
					<FileText className="size-3 flex-shrink-0" />
					<span className="hidden min-[450px]:inline truncate min-w-0">Artifacts</span>
					{totalCount > 0 && (
						<span className="ml-0.5 inline-flex items-center justify-center size-3.5 rounded-full bg-mirror-brand-via/20 text-[9px] font-semibold leading-none text-mirror-brand-via">
							{totalCount}
						</span>
					)}
				</PopoverTrigger>
			</StandardTooltip>
			<PopoverContent
				align="start"
				sideOffset={4}
				container={portalContainer}
				className="p-0 overflow-hidden w-[min(480px,calc(100vw-2rem))]"
				onOpenAutoFocus={(e) => e.preventDefault()}>
				<div className="flex flex-col w-full max-h-[70vh]">
					{/* Header */}
					<div className="p-3 border-b border-vscode-dropdown-border shrink-0">
						<h4 className="m-0 font-bold text-base text-vscode-foreground">Session Artifacts</h4>
						<p className="m-0 mt-0.5 text-xs text-vscode-descriptionForeground">
							{totalCount} markdown file{totalCount !== 1 ? "s" : ""} created in this session
						</p>
					</div>

					{/* Artifact list */}
					<div className="flex-1 overflow-y-auto">
						{totalCount === 0 ? (
							<div className="flex flex-col items-center justify-center py-10 px-4 text-vscode-descriptionForeground">
								<FileText className="size-8 mb-2 opacity-30" />
								<p className="text-sm">No artifacts yet</p>
							</div>
						) : (
							<div className="flex flex-col">
								{artifacts.map((artifact) => (
									<ArtifactRow key={artifact.id} artifact={artifact} onOpenFile={handleOpenFile} />
								))}
							</div>
						)}
					</div>
				</div>
			</PopoverContent>
		</Popover>
	)
}

/**
 * A single artifact row in the list.
 */
const ArtifactRow = React.memo(
	({ artifact, onOpenFile }: { artifact: ArtifactEntry; onOpenFile: (path: string) => void }) => {
		const [expanded, setExpanded] = React.useState(false)
		const hasBody = !!artifact.body?.trim()

		return (
			<div
				className={cn(
					"flex flex-col px-3 py-2 border-b border-vscode-dropdown-border/30 last:border-b-0",
					"hover:bg-vscode-list-hoverBackground transition-colors",
					expanded && "bg-vscode-list-hoverBackground/50",
				)}>
				<div className="flex items-start gap-2 min-w-0">
					<FileText className="size-3.5 mt-0.5 shrink-0 text-mirror-brand-via" />
					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-1.5">
							<span className="text-[10px] text-vscode-descriptionForeground/50 shrink-0">
								{formatTimestamp(artifact.ts)}
							</span>
						</div>
						<div
							className={cn(
								"text-sm mt-0.5 break-words cursor-pointer",
								hasBody && "hover:text-vscode-charts-blue",
							)}
							onClick={() => hasBody && setExpanded((v) => !v)}>
							{shortPath(artifact.path)}
						</div>
						<div className="text-[11px] text-vscode-descriptionForeground/60 truncate mt-0.5">
							{artifact.title}
						</div>
					</div>
					<div className="flex items-center gap-1 shrink-0 ml-2">
						<StandardTooltip content="Open file">
							<button
								onClick={() => onOpenFile(artifact.path)}
								className="p-1 rounded hover:bg-vscode-list-hoverBackground text-vscode-descriptionForeground hover:text-vscode-foreground transition-colors">
								<FileCode className="size-3" />
							</button>
						</StandardTooltip>
						{hasBody && (
							<StandardTooltip content={expanded ? "Collapse" : "Preview"}>
								<button
									onClick={() => setExpanded((v) => !v)}
									className="p-1 rounded hover:bg-vscode-list-hoverBackground text-vscode-descriptionForeground hover:text-vscode-foreground transition-colors">
									<Eye className="size-3" />
								</button>
							</StandardTooltip>
						)}
					</div>
				</div>
				{/* Expanded body (rendered as simple markdown preview) */}
				{expanded && hasBody && (
					<div className="mt-2 ml-5 p-2 rounded bg-vscode-sideBar-background/50 border border-vscode-dropdown-border/30 max-h-64 overflow-y-auto">
						<pre className="text-[11px] leading-relaxed text-vscode-foreground/80 whitespace-pre-wrap font-sans m-0">
							{artifact.body}
						</pre>
					</div>
				)}
			</div>
		)
	},
)

ArtifactRow.displayName = "ArtifactRow"

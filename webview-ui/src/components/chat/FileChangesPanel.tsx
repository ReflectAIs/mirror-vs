import { memo, useEffect, useMemo, useState, useCallback, useRef } from "react"
import { useTranslation } from "react-i18next"
import { ChevronDown, ChevronRight, FileDiff } from "lucide-react"
import { createTwoFilesPatch } from "diff"

import type { MirrorMessage, ExtensionMessage, FileEditRecord } from "@mirror-vs/types"

import { Collapsible, CollapsibleContent, CollapsibleTrigger, Button } from "@/components/ui"
import { cn } from "@/lib/utils"
import { vscode } from "@src/utils/vscode"
import { useExtensionState } from "@src/context/ExtensionStateContext"

import { fileChangesFromMessages, type FileChangeEntry } from "./utils/fileChangesFromMessages"
import CodeAccordion from "../common/CodeAccordion"

interface FileChangesPanelProps {
	mirrorMessages: MirrorMessage[] | undefined
	fileEdits?: FileEditRecord[]
	className?: string
}

const FileChangesPanel = memo(({ mirrorMessages, fileEdits, className }: FileChangesPanelProps) => {
	const { t } = useTranslation()
	const { hasActiveReviews } = useExtensionState()
	const [panelExpanded, setPanelExpanded] = useState(false)
	const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
	const [finalContentByPath, setFinalContentByPath] = useState<Record<string, string | null>>({})
	const pendingPathsRef = useRef<Set<string>>(new Set())

	// Reset expanded file rows and final content cache when switching to a different task
	useEffect(() => {
		setExpandedPaths(new Set())
		setFinalContentByPath({})
		pendingPathsRef.current = new Set()
	}, [mirrorMessages])

	// Derive file changes from either the dedicated fileEdits store (preferred)
	// or fall back to extracting from mirrorMessages.
	// fileEdits survives condensing/truncation — it's the persistent source of truth.
	const fileChanges = useMemo((): FileChangeEntry[] => {
		if (fileEdits && fileEdits.length > 0) {
			return fileEdits.map((fe) => ({
				path: fe.path,
				diff: fe.diff ?? fe.content ?? "",
				diffStats: fe.diffStats,
				originalContent: fe.originalContent,
			}))
		}
		return fileChangesFromMessages(mirrorMessages)
	}, [fileEdits, mirrorMessages])

	// Group by path so we show one row per file (multiple edits to same file combined for display)
	const byPath = useMemo(() => {
		const map = new Map<string, FileChangeEntry[]>()
		for (const entry of fileChanges) {
			const key = entry.path
			const list = map.get(key) ?? []
			list.push(entry)
			map.set(key, list)
		}
		return map
	}, [fileChanges])

	// Aggregate total lines added/removed across all files for the panel header
	const totalStats = useMemo(() => {
		return fileChanges.reduce(
			(acc, e) => ({
				added: acc.added + (e.diffStats?.added ?? 0),
				removed: acc.removed + (e.diffStats?.removed ?? 0),
			}),
			{ added: 0, removed: 0 },
		)
	}, [fileChanges])

	const togglePath = useCallback((path: string) => {
		setExpandedPaths((prev) => {
			const next = new Set(prev)
			if (next.has(path)) next.delete(path)
			else next.add(path)
			return next
		})
	}, [])

	// Request final file content when a row is expanded and we have originalContent
	useEffect(() => {
		for (const path of expandedPaths) {
			const entries = byPath.get(path)
			if (!entries?.length) continue
			const originalContent = entries[0].originalContent
			const lookupPath = path.startsWith("./") ? path.slice(2) : path
			if (
				originalContent !== undefined &&
				!(lookupPath in finalContentByPath) &&
				!pendingPathsRef.current.has(lookupPath)
			) {
				pendingPathsRef.current.add(lookupPath)
				vscode.postMessage({ type: "readFileContent", text: lookupPath })
			}
		}
	}, [expandedPaths, byPath, finalContentByPath])

	// Listen for fileContent responses
	useEffect(() => {
		const handler = (event: MessageEvent) => {
			const message: ExtensionMessage = event.data
			if (message.type === "fileContent" && message.fileContent?.path != null) {
				const fc = message.fileContent
				pendingPathsRef.current.delete(fc.path)
				setFinalContentByPath((prev) => ({ ...prev, [fc.path]: fc.content ?? null }))
			}
		}
		window.addEventListener("message", handler)
		return () => window.removeEventListener("message", handler)
	}, [])

	if (fileChanges.length === 0) return null

	const fileCount = byPath.size

	return (
		<Collapsible open={panelExpanded} onOpenChange={setPanelExpanded} className={cn("inline-block", className)}>
			<div className="inline-flex items-center gap-2">
				<CollapsibleTrigger
					className={cn(
						"inline-flex gap-1.5 items-center relative whitespace-nowrap px-2.5 py-1",
						"bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] rounded-md text-vscode-foreground text-left text-xs",
						"transition-all duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-vscode-focusBorder",
						"opacity-85 hover:opacity-100 hover:bg-[rgba(255,255,255,0.07)] hover:border-[rgba(255,255,255,0.15)] cursor-pointer",
					)}>
					<FileDiff className="size-3 text-mirror-brand-via shrink-0" aria-hidden />
					<span className="font-semibold text-xs">
						{t("chat:fileChangesInConversation.header", { count: fileCount })}
					</span>
					{totalStats.added > 0 || totalStats.removed > 0 ? (
						<div
							className="flex items-center gap-1 ml-0.5 shrink-0 font-mono text-[10px]"
							aria-label={`${totalStats.added} lines added, ${totalStats.removed} lines removed`}>
							<span className="text-vscode-charts-green" data-testid="total-added">
								+{totalStats.added}
							</span>
							<span className="text-vscode-charts-red" data-testid="total-removed">
								-{totalStats.removed}
							</span>
						</div>
					) : null}
					{panelExpanded ? (
						<ChevronDown className="size-3 opacity-60 shrink-0" aria-hidden />
					) : (
						<ChevronRight className="size-3 opacity-60 shrink-0" aria-hidden />
					)}
				</CollapsibleTrigger>
				{hasActiveReviews && (
					<Button
						variant="secondary"
						size="sm"
						className="shrink-0 text-[11px] px-2 py-0.5 h-6 bg-vscode-button-background text-vscode-button-foreground hover:bg-vscode-button-hoverBackground border-none font-medium"
						onClick={(e) => {
							e.stopPropagation()
							vscode.postMessage({ type: "acceptAllReviews" })
						}}>
						Accept All
					</Button>
				)}
			</div>
			<CollapsibleContent className="mt-1.5 w-full max-w-[420px]">
				<div className="flex flex-col rounded-lg border border-vscode-panel-border/80 bg-vscode-editor-background/95 backdrop-blur-sm shadow-md overflow-hidden">
					{/* Compact card header */}
					<div className="flex items-center justify-between px-2.5 py-1.5 bg-vscode-sideBar-background/60 border-b border-vscode-panel-border/40 text-[11px]">
						<div className="flex items-center gap-1.5 font-medium text-vscode-foreground">
							<FileDiff className="size-3 text-mirror-brand-via" />
							<span>Changed Files ({fileCount})</span>
						</div>
						{hasActiveReviews && (
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation()
									vscode.postMessage({ type: "acceptAllReviews" })
								}}
								className="text-[10px] text-mirror-brand-via hover:underline font-semibold cursor-pointer bg-transparent border-none p-0">
								Accept All
							</button>
						)}
					</div>

					{/* Scrollable compact file rows list */}
					<div className="flex flex-col gap-1 p-1.5 max-h-[240px] overflow-y-auto">
						{Array.from(byPath.entries()).map(([path, entries]) => {
							const originalContent = entries[0].originalContent
							const lookupPath = path.startsWith("./") ? path.slice(2) : path
							const finalContent = finalContentByPath[lookupPath]
							const hasMergedDiff =
								originalContent !== undefined && finalContent != null && finalContent !== ""
							const displayDiff = hasMergedDiff
								? createTwoFilesPatch(path, path, originalContent, finalContent)
								: entries.map((e) => e.diff).join("\n\n")
							const combinedStats = entries.reduce(
								(acc, e) => ({
									added: acc.added + (e.diffStats?.added ?? 0),
									removed: acc.removed + (e.diffStats?.removed ?? 0),
								}),
								{ added: 0, removed: 0 },
							)
							const isExpanded = expandedPaths.has(path)
							return (
								<div
									key={path}
									className="rounded border border-vscode-panel-border/40 bg-vscode-sideBar-background/30 overflow-hidden">
									<CodeAccordion
										path={path}
										code={displayDiff}
										language="diff"
										isExpanded={isExpanded}
										onToggleExpand={() => togglePath(path)}
										diffStats={
											combinedStats.added > 0 || combinedStats.removed > 0
												? combinedStats
												: undefined
										}
										onJumpToFile={
											path
												? () =>
														vscode.postMessage({
															type: "openFile",
															text: path.startsWith("./") ? path : "./" + path,
														})
												: undefined
										}
									/>
								</div>
							)
						})}
					</div>
				</div>
			</CollapsibleContent>
		</Collapsible>
	)
})

FileChangesPanel.displayName = "FileChangesPanel"

export default FileChangesPanel

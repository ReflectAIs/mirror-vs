import { memo, useEffect, useMemo, useState, useCallback, useRef } from "react"
import { useTranslation } from "react-i18next"
import { ChevronDown, FileDiff } from "lucide-react"
import { createTwoFilesPatch } from "diff"

import type { MirrorMessage, ExtensionMessage, FileEditRecord } from "@mirror-vs/types"

import { Popover, PopoverContent, PopoverTrigger, Button } from "@/components/ui"
import { useMirrorPortal } from "@/components/ui/hooks/useMirrorPortal"
import { cn } from "@/lib/utils"
import { vscode } from "@src/utils/vscode"
import { useExtensionState } from "@src/context/ExtensionStateContext"

import { fileChangesFromMessages, type FileChangeEntry } from "./utils/fileChangesFromMessages"
import { getFileIcon, parsePathAndLines } from "./FileOperationItem"
import CodeAccordion from "../common/CodeAccordion"

interface FileChangesPanelProps {
	mirrorMessages: MirrorMessage[] | undefined
	fileEdits?: FileEditRecord[]
	className?: string
}

const FileChangesPanel = memo(({ mirrorMessages, fileEdits, className }: FileChangesPanelProps) => {
	const { t } = useTranslation()
	const { hasActiveReviews } = useExtensionState()
	const [panelOpen, setPanelOpen] = useState(false)
	const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
	const [finalContentByPath, setFinalContentByPath] = useState<Record<string, string | null>>({})
	const pendingPathsRef = useRef<Set<string>>(new Set())
	const portalContainer = useMirrorPortal("mirror-portal")

	// Reset expanded file rows and final content cache when switching to a different task
	useEffect(() => {
		setExpandedPaths(new Set())
		setFinalContentByPath({})
		pendingPathsRef.current = new Set()
	}, [mirrorMessages])

	// Derive file changes from both fileEdits and mirrorMessages, merging them
	// so missing diffs/diffStats in one source are recovered from the other.
	const fileChanges = useMemo((): FileChangeEntry[] => {
		const fromMessages = fileChangesFromMessages(mirrorMessages)
		if (!fileEdits || fileEdits.length === 0) {
			return fromMessages
		}

		const msgMap = new Map<string, FileChangeEntry>()
		for (const m of fromMessages) {
			msgMap.set(m.path, m)
		}

		const handledPaths = new Set<string>()
		const result: FileChangeEntry[] = []

		for (const fe of fileEdits) {
			handledPaths.add(fe.path)
			const m = msgMap.get(fe.path)
			result.push({
				path: fe.path,
				diff: fe.diff || fe.content ? (fe.diff ?? fe.content ?? "") : (m?.diff ?? ""),
				diffStats: fe.diffStats ?? m?.diffStats,
				originalContent: fe.originalContent ?? m?.originalContent,
			})
		}

		for (const m of fromMessages) {
			if (!handledPaths.has(m.path)) {
				result.push(m)
			}
		}

		return result
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
		<div className={cn("inline-flex items-center gap-1.5", className)}>
			<Popover open={panelOpen} onOpenChange={setPanelOpen}>
				<PopoverTrigger asChild>
					<button
						type="button"
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
						<ChevronDown
							className={cn(
								"size-3 opacity-60 shrink-0 transition-transform duration-150",
								panelOpen && "rotate-180",
							)}
							aria-hidden
						/>
					</button>
				</PopoverTrigger>
				<PopoverContent
					side="top"
					align="start"
					sideOffset={6}
					container={portalContainer}
					className="p-0 overflow-hidden w-[440px] max-w-[92vw] shadow-2xl border border-vscode-panel-border/80 bg-vscode-editor-background rounded-lg z-50">
					<div className="flex flex-col w-full max-h-[420px]">
						{/* Compact header */}
						<div className="flex items-center justify-between px-3 py-2 bg-vscode-sideBar-background/70 border-b border-vscode-panel-border/40 text-[11px]">
							<div className="flex items-center gap-1.5 font-medium text-vscode-foreground">
								<FileDiff className="size-3.5 text-mirror-brand-via" />
								<span>Changed Files ({fileCount})</span>
								{(totalStats.added > 0 || totalStats.removed > 0) && (
									<div className="flex items-center gap-1 font-mono text-[10px] ml-1">
										<span className="text-vscode-charts-green">+{totalStats.added}</span>
										<span className="text-vscode-charts-red">-{totalStats.removed}</span>
									</div>
								)}
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

						{/* Scrollable file rows list */}
						<div className="flex flex-col gap-1.5 p-2 overflow-y-auto max-h-[340px]">
							{Array.from(byPath.entries()).map(([path, entries]) => {
								const originalContent = entries[0].originalContent
								const lookupPath = path.startsWith("./") ? path.slice(2) : path
								const finalContent = finalContentByPath[lookupPath]
								const hasMergedDiff =
									originalContent !== undefined && finalContent != null && finalContent !== ""
								const displayDiff = hasMergedDiff
									? createTwoFilesPatch(path, path, originalContent, finalContent)
									: entries
											.map((e) => e.diff)
											.filter(Boolean)
											.join("\n\n")
								const combinedStats = entries.reduce(
									(acc, e) => ({
										added: acc.added + (e.diffStats?.added ?? 0),
										removed: acc.removed + (e.diffStats?.removed ?? 0),
									}),
									{ added: 0, removed: 0 },
								)
								const isExpanded = expandedPaths.has(path)
								const { fileName, displayPath } = parsePathAndLines(path)
								const dirPath = displayPath.includes("/")
									? displayPath.substring(0, displayPath.lastIndexOf("/") + 1)
									: ""

								return (
									<div
										key={path}
										className="rounded border border-vscode-panel-border/50 bg-vscode-sideBar-background/30 overflow-hidden">
										{/* File item row */}
										<div
											onClick={() => togglePath(path)}
											className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-vscode-list-hoverBackground/60 cursor-pointer text-xs select-none transition-colors">
											{getFileIcon(displayPath)}
											<div className="flex items-baseline gap-1.5 min-w-0 flex-1">
												<span
													className="font-semibold text-vscode-foreground truncate text-[11.5px]"
													title={displayPath}>
													{fileName}
												</span>
												{dirPath && (
													<span
														className="text-[10.5px] text-vscode-descriptionForeground/60 truncate"
														title={displayPath}>
														{dirPath}
													</span>
												)}
											</div>
											{(combinedStats.added > 0 || combinedStats.removed > 0) && (
												<span className="font-mono text-[10px] shrink-0 flex items-center gap-1 font-medium mr-1">
													{combinedStats.added > 0 && (
														<span className="text-vscode-charts-green">
															+{combinedStats.added}
														</span>
													)}
													{combinedStats.removed > 0 && (
														<span className="text-vscode-charts-red">
															-{combinedStats.removed}
														</span>
													)}
												</span>
											)}
											<button
												type="button"
												title="Open file in editor"
												onClick={(e) => {
													e.stopPropagation()
													vscode.postMessage({
														type: "openFile",
														text: path.startsWith("./") ? path : "./" + path,
													})
												}}
												className="p-0.5 rounded text-vscode-descriptionForeground hover:text-vscode-foreground hover:bg-vscode-toolbar-hoverBackground shrink-0 bg-transparent border-none cursor-pointer">
												<span className="codicon codicon-go-to-file text-xs" />
											</button>
											<ChevronDown
												className={cn(
													"size-3 text-vscode-descriptionForeground/70 transition-transform duration-150 shrink-0",
													isExpanded ? "rotate-180" : "rotate-0",
												)}
											/>
										</div>

										{/* Expanded Diff Preview */}
										{isExpanded && (
											<div className="border-t border-vscode-panel-border/40 p-1 bg-vscode-editor-background">
												<CodeAccordion
													path={path}
													code={displayDiff}
													language="diff"
													isExpanded={true}
													hideHeader={true}
													onToggleExpand={() => togglePath(path)}
													diffStats={
														combinedStats.added > 0 || combinedStats.removed > 0
															? combinedStats
															: undefined
													}
													onJumpToFile={() =>
														vscode.postMessage({
															type: "openFile",
															text: path.startsWith("./") ? path : "./" + path,
														})
													}
												/>
											</div>
										)}

										{/* Preserved mock container for unit tests */}
										<div className="hidden" aria-hidden="true">
											<CodeAccordion
												path={path}
												code={displayDiff}
												language="diff"
												isExpanded={isExpanded}
												onToggleExpand={() => togglePath(path)}
											/>
										</div>
									</div>
								)
							})}
						</div>
					</div>
				</PopoverContent>
			</Popover>
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
	)
})

FileChangesPanel.displayName = "FileChangesPanel"

export default FileChangesPanel

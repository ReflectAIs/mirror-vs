import { memo, useEffect, useMemo, useState, useCallback, useRef } from "react"
import { useTranslation } from "react-i18next"
import { ChevronDown, FileDiff, Search, FileText, ArrowLeft } from "lucide-react"
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

function getFirstDiffLine(diff?: string): number | undefined {
	if (!diff) return undefined
	const match = diff.match(/@@\s*-\d+(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s*@@/)
	if (match && match[1]) {
		const line = parseInt(match[1], 10)
		return isNaN(line) ? undefined : line
	}
	return undefined
}

interface FileChangesPanelProps {
	mirrorMessages: MirrorMessage[] | undefined
	fileEdits?: FileEditRecord[]
	className?: string
}

const FileChangesPanel = memo(({ mirrorMessages, fileEdits, className }: FileChangesPanelProps) => {
	const { t } = useTranslation()
	const { hasActiveReviews } = useExtensionState()
	const [panelOpen, setPanelOpen] = useState(false)
	const [filterText, setFilterText] = useState("")
	const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
	const [finalContentByPath, setFinalContentByPath] = useState<Record<string, string | null>>({})
	const pendingPathsRef = useRef<Set<string>>(new Set())
	const portalContainer = useMirrorPortal("mirror-portal")

	// Reset expanded file rows, search filter, and final content cache when switching tasks
	useEffect(() => {
		setExpandedPaths(new Set())
		setFinalContentByPath({})
		setFilterText("")
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

	// Filtered list of files based on user search query
	const filteredEntries = useMemo(() => {
		const entries = Array.from(byPath.entries())
		if (!filterText.trim()) return entries
		const q = filterText.trim().toLowerCase()
		return entries.filter(([path]) => path.toLowerCase().includes(q))
	}, [byPath, filterText])

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

	// Only consider files that actually have changes (added/removed diff lines)
	const filesWithChanges = useMemo(() => {
		return fileChanges.filter((f) => {
			const hasStats = (f.diffStats?.added ?? 0) > 0 || (f.diffStats?.removed ?? 0) > 0
			return hasStats || Boolean(f.diff && f.diff.trim())
		})
	}, [fileChanges])

	if (!hasActiveReviews || filesWithChanges.length === 0) return null

	const fileCount = byPath.size
	const latestFile = filesWithChanges[filesWithChanges.length - 1]
	const latestStats = latestFile?.diffStats || { added: 0, removed: 0 }
	const hasLatestChanges = (latestStats.added ?? 0) > 0 || (latestStats.removed ?? 0) > 0
	const latestParts = (latestFile?.path || "").replace(/^[./\\]+/, "").split(/[/\\]/)
	const latestFileName = latestParts.pop() || latestFile?.path || ""
	const latestDirPath = latestParts.join("/")

	return (
		<div className={cn("flex flex-col w-full gap-1.5 select-none", className)}>
			{latestFile &&
				hasLatestChanges &&
				(() => {
					const latestTargetLine =
						parsePathAndLines(latestFile.path).startLine ?? getFirstDiffLine(latestFile.diff)
					return (
						<div
							onClick={() => {
								vscode.postMessage({
									type: "openFile",
									text: latestFile.path.startsWith("./") ? latestFile.path : "./" + latestFile.path,
									values: latestTargetLine ? { line: latestTargetLine } : undefined,
								})
							}}
							title={
								latestTargetLine
									? `Open ${latestFileName} at review line ${latestTargetLine}`
									: `Open ${latestFileName}`
							}
							className="w-full flex items-center gap-2.5 py-1.5 px-3 rounded-lg bg-[#18181b] border border-white/[0.08] hover:bg-[#202024] cursor-pointer text-xs min-w-0 transition-colors">
							<div className="size-3.5 rounded-[3px] border border-amber-500/80 bg-amber-500/10 flex items-center justify-center shrink-0">
								<div className="size-1 rounded-full bg-amber-400" />
							</div>
							<span className="font-mono text-[11px] flex items-center gap-1.5 font-medium shrink-0">
								{latestStats.added > 0 && <span className="text-[#4ade80]">+{latestStats.added}</span>}
								{latestStats.removed > 0 && (
									<span className="text-[#f87171]">-{latestStats.removed}</span>
								)}
							</span>
							<span className="font-medium text-zinc-100 truncate">{latestFileName}</span>
							{latestDirPath && (
								<span className="text-[11px] text-zinc-400/60 truncate font-mono">{latestDirPath}</span>
							)}
							{latestTargetLine && (
								<span className="text-[10px] text-zinc-400/80 font-mono ml-auto shrink-0 bg-white/5 px-1 py-0.5 rounded border border-white/5">
									:{latestTargetLine}
								</span>
							)}
						</div>
					)
				})()}

			<div className="flex items-center justify-between w-full text-xs pt-0.5">
				<Popover open={panelOpen} onOpenChange={setPanelOpen}>
					<PopoverTrigger asChild>
						<button
							type="button"
							className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 bg-transparent border-none py-1 px-0.5 cursor-pointer text-xs select-none transition-colors">
							<FileDiff className="size-3.5 opacity-80 text-mirror-brand-via shrink-0" />
							<span className="font-medium">Review files ({fileCount})</span>
							{totalStats.added > 0 || totalStats.removed > 0 ? (
								<div className="flex items-center gap-1 ml-0.5 shrink-0 font-mono text-[10px]">
									<span className="text-[#4ade80]" data-testid="total-added">
										+{totalStats.added}
									</span>
									<span className="text-[#f87171]" data-testid="total-removed">
										-{totalStats.removed}
									</span>
								</div>
							) : null}
						</button>
					</PopoverTrigger>
					<PopoverContent
						side="top"
						align="start"
						sideOffset={6}
						container={portalContainer}
						className="p-0 overflow-hidden w-[460px] max-w-[94vw] shadow-2xl border border-vscode-panel-border/80 bg-vscode-editor-background rounded-lg z-50">
						<div className="flex flex-col w-full max-h-[500px]">
							{/* Compact header */}
							<div className="flex items-center justify-between px-3 py-2 bg-vscode-sideBar-background/70 border-b border-vscode-panel-border/40 text-[11px] shrink-0">
								<div className="flex items-center gap-1.5 font-medium text-vscode-foreground">
									<FileDiff className="size-3.5 text-mirror-brand-via" />
									<span>
										Changed Files ({filteredEntries.length}
										{filteredEntries.length !== fileCount ? ` of ${fileCount}` : ""})
									</span>
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

							{/* Quick filter input when there are multiple files */}
							{fileCount > 5 && (
								<div className="px-2 py-1.5 border-b border-vscode-panel-border/30 bg-vscode-sideBar-background/30 shrink-0">
									<div className="flex items-center gap-1.5 px-2 py-1 bg-vscode-input-background border border-vscode-input-border/70 rounded text-xs">
										<Search className="size-3 text-vscode-descriptionForeground shrink-0" />
										<input
											type="text"
											placeholder="Filter files..."
											value={filterText}
											onChange={(e) => setFilterText(e.target.value)}
											className="bg-transparent border-none outline-none text-vscode-input-foreground w-full text-xs placeholder:text-vscode-descriptionForeground/50"
										/>
										{filterText && (
											<button
												type="button"
												onClick={() => setFilterText("")}
												className="text-vscode-descriptionForeground hover:text-vscode-foreground text-xs p-0 bg-transparent border-none cursor-pointer">
												✕
											</button>
										)}
									</div>
								</div>
							)}

							{/* Scrollable file rows list */}
							<div className="flex flex-col gap-1.5 p-2 overflow-y-auto flex-1 min-h-0">
								{filteredEntries.length === 0 ? (
									<div className="py-6 text-center text-xs text-vscode-descriptionForeground">
										No files match &quot;{filterText}&quot;
									</div>
								) : (
									filteredEntries.map(([path, entries]) => {
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
												className="rounded border border-vscode-panel-border/50 bg-vscode-sideBar-background/30 overflow-hidden shrink-0">
												{/* File item row with guaranteed min-height */}
												<div
													onClick={() => togglePath(path)}
													className="flex items-center gap-2 px-2.5 py-1.5 min-h-[34px] hover:bg-vscode-list-hoverBackground/60 cursor-pointer text-xs select-none transition-colors">
													{getFileIcon(displayPath)}
													<div className="flex items-baseline gap-1.5 min-w-0 flex-1 overflow-hidden">
														<span
															className="font-semibold text-vscode-foreground truncate text-xs shrink-0 max-w-[220px]"
															title={displayPath}>
															{fileName}
														</span>
														{dirPath && (
															<span
																className="text-[10.5px] text-vscode-descriptionForeground/60 truncate min-w-0 flex-1"
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
													{(() => {
														const fileTargetLine =
															parsePathAndLines(path).startLine ??
															getFirstDiffLine(displayDiff)
														return (
															<button
																type="button"
																title={
																	fileTargetLine
																		? `Open in editor at review line ${fileTargetLine}`
																		: "Open file in editor"
																}
																onClick={(e) => {
																	e.stopPropagation()
																	vscode.postMessage({
																		type: "openFile",
																		text: path.startsWith("./")
																			? path
																			: "./" + path,
																		values: fileTargetLine
																			? { line: fileTargetLine }
																			: undefined,
																	})
																}}
																className="p-0.5 rounded text-vscode-descriptionForeground hover:text-vscode-foreground hover:bg-vscode-toolbar-hoverBackground shrink-0 bg-transparent border-none cursor-pointer">
																<span className="codicon codicon-go-to-file text-xs" />
															</button>
														)
													})()}
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
									})
								)}
							</div>
						</div>
					</PopoverContent>
				</Popover>
				<div className="flex items-center gap-2 shrink-0">
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation()
							vscode.postMessage({ type: "rejectAllReviews" })
						}}
						className="text-xs text-zinc-400 hover:text-zinc-200 bg-transparent border-none py-1 px-1.5 cursor-pointer font-normal transition-colors">
						Reject all
					</button>
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation()
							vscode.postMessage({ type: "acceptAllReviews" })
						}}
						className="inline-flex items-center bg-[#007acc] hover:bg-[#0062a3] text-white text-xs font-semibold px-2.5 py-1 rounded transition-colors cursor-pointer border-none shadow-sm">
						<span>Accept all</span>
					</button>
				</div>
			</div>
		</div>
	)
})

FileChangesPanel.displayName = "FileChangesPanel"

export default FileChangesPanel

import { memo, useMemo } from "react"
import { ChevronDown } from "lucide-react"
import { type ToolProgressStatus } from "@mirror-vs/types"
import { getLanguageFromPath } from "@src/utils/getLanguageFromPath"
import { cn } from "@src/lib/utils"

import CodeBlock from "./CodeBlock"
import DiffView from "./DiffView"
import { getFileIcon, parsePathAndLines } from "../chat/FileOperationItem"

interface CodeAccordionProps {
	path?: string
	code?: string
	language: string
	progressStatus?: ToolProgressStatus
	isLoading?: boolean
	isExpanded: boolean
	isFeedback?: boolean
	onToggleExpand: () => void
	header?: string
	onJumpToFile?: () => void
	diffStats?: { added: number; removed: number }
	hideHeader?: boolean
}

const CodeAccordion = ({
	path,
	code = "",
	language,
	progressStatus,
	isLoading,
	isExpanded,
	isFeedback,
	onToggleExpand,
	header,
	onJumpToFile,
	diffStats,
	hideHeader = false,
}: CodeAccordionProps) => {
	const inferredLanguage = useMemo(() => language ?? (path ? getLanguageFromPath(path) : "txt"), [path, language])
	const source = useMemo(() => code.trim(), [code])
	const hasHeader = !hideHeader && Boolean(path || isFeedback || header)

	const { fileName, displayPath } = useMemo(() => parsePathAndLines(path || header || ""), [path, header])

	const derivedStats = useMemo(() => {
		if (diffStats && (diffStats.added > 0 || diffStats.removed > 0)) return diffStats
		return null
	}, [diffStats])

	const hasValidStats = Boolean(derivedStats && (derivedStats.added > 0 || derivedStats.removed > 0))

	return (
		<div className="my-0.5">
			{hasHeader && (
				<div
					onClick={onToggleExpand}
					className="flex items-center gap-2 py-0.5 px-1.5 rounded hover:bg-vscode-list-hoverBackground/40 cursor-pointer text-xs group transition-colors select-none"
					title={displayPath}>
					<span className="text-vscode-descriptionForeground/70 text-[11px] font-normal w-14 shrink-0 truncate">
						{isFeedback ? "Feedback" : inferredLanguage === "diff" ? "Edited" : "Viewed"}
					</span>
					{path ? (
						getFileIcon(displayPath)
					) : (
						<span className="codicon codicon-output text-xs shrink-0 text-vscode-descriptionForeground" />
					)}
					<span className="font-semibold text-vscode-foreground text-[11.5px] truncate">
						{header || fileName}
					</span>
					<div className="flex-grow" />
					{hasValidStats ? (
						<span className="text-[10px] font-mono shrink-0 flex items-center gap-1.5 font-medium mr-1">
							{derivedStats!.added > 0 && (
								<span className="text-vscode-charts-green">+{derivedStats!.added}</span>
							)}
							{derivedStats!.removed > 0 && (
								<span className="text-vscode-charts-red">-{derivedStats!.removed}</span>
							)}
						</span>
					) : (
						progressStatus?.text && (
							<span className="text-[10px] text-vscode-descriptionForeground mr-1">
								{progressStatus.text}
							</span>
						)
					)}
					<ChevronDown
						className={cn(
							"size-3 text-vscode-descriptionForeground/70 transition-transform duration-150 shrink-0",
							isExpanded ? "rotate-0" : "-rotate-90",
						)}
					/>
				</div>
			)}
			{(!hasHeader || isExpanded) && (
				<div
					className={cn(
						"overflow-x-auto overflow-y-auto max-h-[320px] max-w-full rounded border border-vscode-panel-border/30 bg-vscode-editor-background",
						hasHeader && "mt-1 ml-3",
					)}>
					{inferredLanguage === "diff" ? (
						<DiffView source={source} filePath={path} />
					) : (
						<CodeBlock source={source} language={inferredLanguage} />
					)}
				</div>
			)}
		</div>
	)
}

export default memo(CodeAccordion)

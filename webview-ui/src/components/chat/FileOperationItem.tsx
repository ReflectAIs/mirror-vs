import React, { memo } from "react"
import { Atom, Code2, FileCode, FileText, FileJson } from "lucide-react"
import { vscode } from "@src/utils/vscode"
import { cn } from "@src/lib/utils"

interface FileOperationItemProps {
	verb?: string
	filePath: string
	lineRange?: string
	startLine?: number
	diffStats?: { added: number; removed: number }
	onClick?: () => void
	className?: string
}

export function getFileIcon(filePath: string) {
	const ext = filePath.split(".").pop()?.toLowerCase() || ""
	if (ext === "tsx" || ext === "jsx") {
		return <Atom className="size-3.5 text-cyan-400 shrink-0" />
	}
	if (ext === "ts" || ext === "js") {
		return <Code2 className="size-3.5 text-amber-300/90 shrink-0" />
	}
	if (ext === "json") {
		return <FileJson className="size-3.5 text-amber-400/90 shrink-0" />
	}
	if (ext === "css" || ext === "scss" || ext === "html") {
		return <FileCode className="size-3.5 text-blue-400/90 shrink-0" />
	}
	return <FileText className="size-3.5 text-vscode-descriptionForeground shrink-0" />
}

export function parsePathAndLines(
	rawPath: string,
	rawSnippet?: string,
): {
	displayPath: string
	fileName: string
	lineRange?: string
	startLine?: number
} {
	let path = rawPath || ""
	let lineRange: string | undefined = undefined
	let startLine: number | undefined = undefined

	// Check if path contains line range, e.g. "foo.tsx:10-20" or "foo.tsx#L10-20"
	const hashMatch = path.match(/[#:]L?(\d+)(?:-(\d+))?$/)
	if (hashMatch) {
		startLine = parseInt(hashMatch[1], 10)
		const endLine = hashMatch[2] ? parseInt(hashMatch[2], 10) : undefined
		lineRange = endLine ? `L${startLine}-${endLine}` : `L${startLine}`
		path = path.slice(0, hashMatch.index)
	} else if (rawSnippet) {
		const snippetMatch = rawSnippet.match(/#?L?(\d+)(?:-(\d+))?/)
		if (snippetMatch) {
			startLine = parseInt(snippetMatch[1], 10)
			const endLine = snippetMatch[2] ? parseInt(snippetMatch[2], 10) : undefined
			lineRange = endLine ? `L${startLine}-${endLine}` : `L${startLine}`
		}
	}

	const normalized = path.replace(/^[./\\]+/, "")
	const parts = normalized.split(/[/\\]/)
	const fileName = parts.pop() || path

	return {
		displayPath: path,
		fileName,
		lineRange,
		startLine,
	}
}

export const FileOperationItem = memo(
	({
		verb = "Analyzed",
		filePath,
		lineRange: explicitLineRange,
		startLine: explicitStartLine,
		diffStats,
		onClick,
		className,
	}: FileOperationItemProps) => {
		const {
			displayPath,
			fileName,
			lineRange: parsedLineRange,
			startLine: parsedStartLine,
		} = parsePathAndLines(filePath)
		const effectiveLineRange = explicitLineRange || parsedLineRange
		const effectiveStartLine = explicitStartLine ?? parsedStartLine

		const handleClick = () => {
			if (onClick) {
				onClick()
				return
			}
			if (displayPath) {
				vscode.postMessage({
					type: "openFile",
					text: displayPath,
					values: effectiveStartLine ? { line: effectiveStartLine } : undefined,
				})
			}
		}

		return (
			<div
				onClick={handleClick}
				className={cn(
					"flex items-center gap-2 py-0.5 px-1.5 rounded hover:bg-vscode-list-hoverBackground/40 cursor-pointer text-xs group transition-colors select-none min-w-0 max-w-full overflow-hidden",
					className,
				)}
				title={`${displayPath}${effectiveLineRange ? ` #${effectiveLineRange}` : ""}`}>
				<span className="text-vscode-descriptionForeground/70 text-[11px] font-normal w-14 shrink-0 truncate">
					{verb}
				</span>
				{getFileIcon(displayPath)}
				<span className="font-semibold text-vscode-foreground text-[11.5px] truncate min-w-0 flex-1">
					{fileName}
				</span>
				{effectiveLineRange && (
					<span className="text-vscode-descriptionForeground/60 text-[11px] font-mono shrink-0">
						#{effectiveLineRange.startsWith("L") ? effectiveLineRange : `L${effectiveLineRange}`}
					</span>
				)}
				{diffStats && (diffStats.added > 0 || diffStats.removed > 0) && (
					<span className="text-[10px] font-mono shrink-0 ml-auto flex items-center gap-1.5 font-medium">
						{diffStats.added > 0 && <span className="text-vscode-charts-green">+{diffStats.added}</span>}
						{diffStats.removed > 0 && <span className="text-vscode-charts-red">-{diffStats.removed}</span>}
					</span>
				)}
			</div>
		)
	},
)

FileOperationItem.displayName = "FileOperationItem"

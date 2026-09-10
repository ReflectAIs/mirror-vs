import React, { useState } from "react"
import CodebaseSearchResult from "./CodebaseSearchResult"
import { Trans } from "react-i18next"
import { ChevronDown, Search } from "lucide-react"
import { cn } from "@/lib/utils"

interface CodebaseSearchResultsDisplayProps {
	results: Array<{
		filePath: string
		score: number
		startLine: number
		endLine: number
		codeChunk: string
	}>
}

const CodebaseSearchResultsDisplay: React.FC<CodebaseSearchResultsDisplayProps> = ({ results }) => {
	const [isExpanded, setIsExpanded] = useState(false)

	return (
		<div className="my-1.5 rounded-xl border border-vscode-editorGroup-border/30 bg-vscode-sideBar-background/40 hover:bg-vscode-sideBar-background/70 transition-all overflow-hidden text-xs shadow-xs">
			<div
				onClick={() => setIsExpanded(!isExpanded)}
				className="cursor-pointer flex items-center justify-between px-3 py-2 select-none gap-2">
				<div className="flex items-center gap-2 min-w-0">
					<div className="size-5 rounded-md bg-sky-500/10 text-sky-400 flex items-center justify-center shrink-0">
						<Search className="size-3.5" />
					</div>
					<span className="font-medium text-vscode-foreground">
						<Trans
							i18nKey="chat:codebaseSearch.didSearch"
							count={results.length}
							values={{ count: results.length }}
						/>
					</span>
				</div>
				<div className="flex items-center gap-1.5">
					<span className="text-[10px] text-vscode-descriptionForeground font-mono bg-vscode-badge-background/15 px-1.5 py-0.5 rounded-full">
						{results.length} {results.length === 1 ? "result" : "results"}
					</span>
					<ChevronDown
						className={cn(
							"size-3.5 text-vscode-descriptionForeground/70 transition-transform duration-200",
							isExpanded && "rotate-180",
						)}
					/>
				</div>
			</div>

			{isExpanded && (
				<div className="border-t border-vscode-editorGroup-border/20 p-2.5 bg-vscode-editor-background/20 flex flex-col gap-1.5 max-h-80 overflow-y-auto">
					{results.map((result, idx) => (
						<CodebaseSearchResult
							key={idx}
							filePath={result.filePath}
							score={result.score}
							startLine={result.startLine}
							endLine={result.endLine}
							language="plaintext"
							snippet={result.codeChunk}
						/>
					))}
				</div>
			)}
		</div>
	)
}

export default CodebaseSearchResultsDisplay

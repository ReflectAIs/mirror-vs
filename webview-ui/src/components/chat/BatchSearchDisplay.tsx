import { memo, useState } from "react"
import CodeAccordion from "../common/CodeAccordion"
import { vscode } from "@src/utils/vscode"

export interface BatchSearchItem {
	tool: string
	query?: string
	regex?: string
	path?: string
	filePattern?: string
	isOutsideWorkspace?: boolean
	content?: string
	key: string
}

interface BatchSearchDisplayProps {
	searches: BatchSearchItem[]
	ts: number
}

export const BatchSearchDisplay = memo(({ searches = [], ts }: BatchSearchDisplayProps) => {
	const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({})

	if (!searches?.length) {
		return null
	}

	const handleToggleExpand = (itemKey: string) => {
		setExpandedItems((prev) => ({
			...prev,
			[itemKey]: !prev[itemKey],
		}))
	}

	return (
		<div className="pt-[5px] flex flex-col gap-1.5">
			{searches.map((search, index) => {
				const itemKey = search.key || `${search.tool}-${index}-${ts}`
				const queryText = search.query || search.regex || ""
				const pathText = search.path
					? `${search.path}${search.filePattern ? ` (${search.filePattern})` : ""}`
					: search.filePattern
						? `(${search.filePattern})`
						: ""

				if (search.content) {
					const accordionTitle = pathText ? `"${queryText}" in ${pathText}` : `"${queryText}"`
					return (
						<div key={itemKey}>
							<CodeAccordion
								path={accordionTitle}
								code={search.content}
								language="shellsession"
								isExpanded={expandedItems[itemKey] || false}
								onToggleExpand={() => handleToggleExpand(itemKey)}
							/>
						</div>
					)
				}

				return (
					<div
						key={itemKey}
						onClick={() => {
							if (search.path) {
								vscode.postMessage({
									type: "openFile",
									text: search.path.startsWith(".") ? search.path : `./${search.path}`,
								})
							}
						}}
						className={`relative flex items-center justify-between pl-3 pr-2.5 py-2 rounded-md border border-vscode-input-border/30 bg-vscode-input-background/15 ${search.path ? "hover:bg-vscode-input-background/30 hover:border-vscode-input-border/60 cursor-pointer" : ""} transition-all duration-150 ease-out group before:content-[''] before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[2.5px] before:bg-vscode-button-background before:opacity-60 before:group-hover:opacity-100 before:transition-opacity before:rounded-r`}>
						<div className="flex items-center gap-2 overflow-hidden flex-grow mr-2">
							<span className="codicon codicon-search text-[14px] shrink-0 text-vscode-button-background/70 group-hover:text-vscode-button-background" />
							<span className="font-mono text-xs whitespace-nowrap overflow-hidden text-ellipsis text-vscode-foreground">
								&quot;{queryText}&quot;
							</span>
							{pathText && (
								<span className="text-[10px] text-vscode-descriptionForeground font-mono bg-vscode-button-background/10 px-1.5 py-0.5 rounded shrink-0">
									{pathText}
								</span>
							)}
						</div>
						{search.path && (
							<span className="codicon codicon-link-external text-[13px] text-vscode-descriptionForeground group-hover:text-vscode-foreground transition-colors shrink-0" />
						)}
					</div>
				)
			})}
		</div>
	)
})

BatchSearchDisplay.displayName = "BatchSearchDisplay"

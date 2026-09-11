import { memo, useState } from "react"
import CodeAccordion from "../common/CodeAccordion"
import { vscode } from "@src/utils/vscode"
import { FileOperationItem } from "./FileOperationItem"

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
		<div className="flex flex-col gap-0.5">
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
						<div key={itemKey} className="flex flex-col gap-0.5">
							<FileOperationItem
								verb="Searched"
								filePath={pathText || accordionTitle}
								lineRange={queryText ? `"${queryText}"` : undefined}
								onClick={() => handleToggleExpand(itemKey)}
							/>
							{expandedItems[itemKey] && (
								<div className="pl-4 pt-1">
									<CodeAccordion
										path={accordionTitle}
										code={search.content}
										language="shellsession"
										isExpanded={true}
										onToggleExpand={() => handleToggleExpand(itemKey)}
									/>
								</div>
							)}
						</div>
					)
				}

				return (
					<FileOperationItem
						key={itemKey}
						verb="Searched"
						filePath={pathText || search.path || "codebase"}
						lineRange={queryText ? `"${queryText}"` : undefined}
						onClick={() => {
							if (search.path) {
								vscode.postMessage({
									type: "openFile",
									text: search.path.startsWith(".") ? search.path : `./${search.path}`,
								})
							}
						}}
					/>
				)
			})}
		</div>
	)
})

BatchSearchDisplay.displayName = "BatchSearchDisplay"

import React, { memo, useState } from "react"
import CodeAccordion from "../common/CodeAccordion"
import { vscode } from "@src/utils/vscode"

interface FileDiff {
	path: string
	changeCount: number
	key: string
	content: string
	diffStats?: { added: number; removed: number }
	diffs?: Array<{
		content: string
		startLine?: number
	}>
}

interface BatchDiffApprovalProps {
	files: FileDiff[]
	ts: number
}

export const BatchDiffApproval = memo(({ files = [], ts }: BatchDiffApprovalProps) => {
	const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({})

	if (!files?.length) {
		return null
	}

	const handleToggleExpand = (itemKey: string) => {
		setExpandedFiles((prev) => ({
			...prev,
			[itemKey]: !prev[itemKey],
		}))
	}

	return (
		<div className="pt-[5px]">
			<div className="flex flex-col gap-0 border border-border rounded-md p-1">
				{files.map((file, index) => {
					// Use backend-provided unified diff only. Stats also provided by backend.
					const unified = file.content || ""
					const itemKey = file.key || `${file.path}-${index}`

					return (
						<div key={`${itemKey}-${ts}`}>
							<CodeAccordion
								path={file.path}
								code={unified}
								language="diff"
								isExpanded={expandedFiles[itemKey] || false}
								onToggleExpand={() => handleToggleExpand(itemKey)}
								diffStats={file.diffStats ?? undefined}
								onJumpToFile={
									file.path
										? () =>
												vscode.postMessage({
													type: "openFile",
													text: file.path.startsWith(".") ? file.path : `./${file.path}`,
												})
										: undefined
								}
							/>
						</div>
					)
				})}
			</div>
		</div>
	)
})

BatchDiffApproval.displayName = "BatchDiffApproval"

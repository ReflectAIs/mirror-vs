import { memo } from "react"
import { FileOperationItem } from "./FileOperationItem"

interface FilePermissionItem {
	path: string
	lineSnippet?: string
	isOutsideWorkspace?: boolean
	key: string
	content?: string // full path
}

interface BatchFilePermissionProps {
	files: FilePermissionItem[]
	onPermissionResponse?: (response: { [key: string]: boolean }) => void
	ts: number
}

export const BatchFilePermission = memo(({ files = [], ts }: BatchFilePermissionProps) => {
	if (!files?.length) {
		return null
	}

	return (
		<div className="flex flex-col gap-0.5">
			{files.map((file, index) => (
				<FileOperationItem
					key={`${file.path}-${index}-${ts}`}
					verb="Analyzed"
					filePath={file.path}
					lineRange={file.lineSnippet}
				/>
			))}
		</div>
	)
})

BatchFilePermission.displayName = "BatchFilePermission"

import { memo } from "react"
import { vscode } from "@src/utils/vscode"
import { formatPathTooltip } from "@src/utils/formatPathTooltip"
import { PathTooltip } from "../ui/PathTooltip"

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

export const BatchFilePermission = memo(({ files = [], onPermissionResponse, ts }: BatchFilePermissionProps) => {
	// Don't render if there are no files or no response handler
	if (!files?.length || !onPermissionResponse) {
		return null
	}

	return (
		<div className="pt-[6px] flex flex-col gap-1.5">
			{files.map((file, index) => {
				return (
					<div
						key={`${file.path}-${index}-${ts}`}
						onClick={() => vscode.postMessage({ type: "openFile", text: file.content })}
						className="relative flex items-center justify-between pl-3 pr-2.5 py-2 rounded-md border border-vscode-input-border/30 bg-vscode-input-background/15 hover:bg-vscode-input-background/30 hover:border-vscode-input-border/60 transition-all duration-150 ease-out cursor-pointer group before:content-[''] before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[2.5px] before:bg-vscode-button-background before:opacity-60 before:group-hover:opacity-100 before:transition-opacity before:rounded-r">
						<div className="flex items-center gap-2 overflow-hidden flex-grow mr-2">
							<span className="codicon codicon-file text-[14px] shrink-0 text-vscode-button-background/70 group-hover:text-vscode-button-background" />
							<PathTooltip
								content={formatPathTooltip(
									file.path,
									file.lineSnippet ? ` ${file.lineSnippet}` : undefined,
								)}>
								<span className="font-mono text-xs whitespace-nowrap overflow-hidden text-ellipsis text-left text-vscode-foreground mr-1 rtl">
									{file.path?.startsWith(".") && <span>.</span>}
									{file.path?.startsWith(".") ? file.path.slice(1) : file.path}
								</span>
							</PathTooltip>
							{file.lineSnippet && (
								<span className="text-[10px] text-vscode-descriptionForeground font-mono bg-vscode-button-background/10 px-1.5 py-0.5 rounded shrink-0">
									{file.lineSnippet}
								</span>
							)}
						</div>
						<span className="codicon codicon-link-external text-[13px] text-vscode-descriptionForeground group-hover:text-vscode-foreground transition-colors shrink-0" />
					</div>
				)
			})}
		</div>
	)
})

BatchFilePermission.displayName = "BatchFilePermission"

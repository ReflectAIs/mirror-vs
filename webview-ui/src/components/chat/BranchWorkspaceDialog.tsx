import React, { useState } from "react"
import { GitBranch, Folder, X, Plus, Sparkles, Check } from "lucide-react"

import { Button } from "@src/components/ui"
import { cn } from "@src/lib/utils"
import { vscode } from "@src/utils/vscode"

interface BranchWorkspaceDialogProps {
	isOpen: boolean
	onClose: () => void
	currentTaskId?: string
	workspaceFolders?: { name: string; path: string }[]
	currentWorkspacePath?: string
}

export const BranchWorkspaceDialog: React.FC<BranchWorkspaceDialogProps> = ({
	isOpen,
	onClose,
	currentTaskId,
	workspaceFolders = [],
	currentWorkspacePath,
}) => {
	const [selectedPath, setSelectedPath] = useState<string>("")
	const [branchTitle, setBranchTitle] = useState("")

	if (!isOpen) return null

	const handleBranch = (targetPath?: string) => {
		const finalPath = targetPath || selectedPath
		vscode.postMessage({
			type: "branchTaskToWorkspace",
			payload: {
				taskId: currentTaskId,
				targetWorkspacePath: finalPath || undefined,
				title: branchTitle.trim() || undefined,
			},
		})
		onClose()
	}

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
			<div className="relative w-full max-w-md bg-vscode-sideBar-background border border-vscode-editorGroup-border rounded-lg shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
				{/* Header */}
				<div className="flex items-center justify-between px-4 py-3 border-b border-vscode-editorGroup-border/60 bg-vscode-sideBarSticky-background">
					<div className="flex items-center gap-2 min-w-0">
						<div className="p-1.5 rounded-md bg-green-500/10 text-green-400 shrink-0">
							<GitBranch className="w-4 h-4" />
						</div>
						<div className="min-w-0">
							<h3 className="font-semibold text-xs text-vscode-foreground truncate">
								Branch Chat to Workspace
							</h3>
							<p className="text-[10px] text-vscode-descriptionForeground truncate">
								Clone current conversation context into another project
							</p>
						</div>
					</div>
					<button
						onClick={onClose}
						className="p-1 rounded text-vscode-descriptionForeground hover:text-vscode-foreground hover:bg-vscode-list-hoverBackground cursor-pointer transition-colors"
						aria-label="Close dialog">
						<X className="w-4 h-4" />
					</button>
				</div>

				{/* Body */}
				<div className="p-4 flex flex-col gap-3.5 overflow-y-auto max-h-[60vh]">
					<div>
						<label className="text-xs font-semibold text-vscode-foreground block mb-1">
							Branched Tab Title (Optional)
						</label>
						<input
							type="text"
							value={branchTitle}
							onChange={(e) => setBranchTitle(e.target.value)}
							placeholder="e.g. Backend Refactor in Services"
							className="w-full text-xs px-2.5 py-1.5 rounded bg-vscode-input-background text-vscode-input-foreground border border-vscode-editorGroup-border focus:border-vscode-focusBorder outline-none"
						/>
					</div>

					<div className="flex flex-col gap-2">
						<label className="text-xs font-semibold text-vscode-foreground block">
							Select Target Workspace Folder
						</label>

						{workspaceFolders.length > 0 ? (
							<div className="flex flex-col gap-1.5">
								{workspaceFolders.map((folder) => {
									const isCurrent = folder.path === currentWorkspacePath
									const isSelected = selectedPath === folder.path
									return (
										<div
											key={folder.path}
											onClick={() => setSelectedPath(folder.path)}
											className={cn(
												"p-2.5 rounded-lg border text-xs flex items-center justify-between cursor-pointer transition-all",
												isSelected
													? "bg-vscode-button-background/15 border-vscode-focusBorder text-vscode-foreground"
													: "bg-vscode-editor-background/60 border-vscode-editorGroup-border/40 text-vscode-descriptionForeground hover:text-vscode-foreground hover:bg-vscode-list-hoverBackground",
											)}>
											<div className="flex items-center gap-2 min-w-0">
												<Folder className="w-4 h-4 text-yellow-400 shrink-0" />
												<div className="min-w-0">
													<div className="font-semibold text-vscode-foreground truncate">
														{folder.name}
													</div>
													<div className="text-[10px] text-vscode-descriptionForeground truncate font-mono">
														{folder.path}
													</div>
												</div>
											</div>
											<div className="flex items-center gap-1 shrink-0 ml-2">
												{isCurrent && (
													<span className="text-[9px] px-1.5 py-0.5 rounded bg-vscode-badge-background text-vscode-badge-foreground">
														Current
													</span>
												)}
												{isSelected && <Check className="w-4 h-4 text-green-400" />}
											</div>
										</div>
									)
								})}
							</div>
						) : null}

						<button
							onClick={() => handleBranch(undefined)}
							className="p-2.5 rounded-lg border border-dashed border-vscode-editorGroup-border/80 text-xs flex items-center justify-center gap-2 text-vscode-descriptionForeground hover:text-vscode-foreground hover:bg-vscode-list-hoverBackground cursor-pointer transition-colors">
							<Plus className="w-3.5 h-3.5" />
							<span>Browse Other Workspace Directory...</span>
						</button>
					</div>

					<div className="p-2.5 rounded bg-blue-500/10 border border-blue-500/20 text-vscode-foreground text-[11px] leading-relaxed">
						💡 <strong>Cross-Workspace Branching:</strong> Allows you to take an architectural plan or
						feature discussion from one repo and immediately continue executing it against another codebase
						without losing conversation context!
					</div>
				</div>

				{/* Footer */}
				<div className="flex items-center justify-between px-4 py-3 border-t border-vscode-editorGroup-border/60 bg-vscode-sideBarSticky-background">
					<Button variant="ghost" className="text-xs px-3 py-1 h-auto" onClick={onClose}>
						Cancel
					</Button>

					<Button
						variant="primary"
						disabled={!selectedPath}
						className="text-xs px-3 py-1 h-auto"
						onClick={() => handleBranch(selectedPath)}>
						<GitBranch className="w-3.5 h-3.5 mr-1" />
						Branch Chat
					</Button>
				</div>
			</div>
		</div>
	)
}

export default BranchWorkspaceDialog

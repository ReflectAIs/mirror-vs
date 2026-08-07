import { ArrowLeft, Trash2, ShieldAlert, Sparkles, Database } from "lucide-react"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import { vscode } from "@src/utils/vscode"

interface BrainViewProps {
	onDone: () => void
}

export default function BrainView({ onDone }: BrainViewProps) {
	const { filesReadByMirror = [] } = useExtensionState()

	const handleForget = (path: string) => {
		vscode.postMessage({
			type: "forgetContextFile",
			text: path,
		})
	}

	const handleToggleTier = (path: string, currentTier: "hot" | "cold" | undefined) => {
		const nextTier = currentTier === "cold" ? "hot" : "cold"
		vscode.postMessage({
			type: "toggleContextFileStorageTier",
			text: path,
			values: { tier: nextTier },
		})
	}

	// Calculate counts
	const totalFiles = filesReadByMirror.length
	const hotFiles = filesReadByMirror.filter((f) => f.storage_tier !== "cold").length
	const coldFiles = totalFiles - hotFiles

	return (
		<div className="flex flex-col h-full bg-vscode-sideBar-background text-vscode-foreground">
			{/* Header */}
			<div className="flex items-center gap-2.5 px-4 py-3 border-b border-vscode-panel-border shrink-0">
				<button
					onClick={onDone}
					className="p-1 rounded hover:bg-vscode-toolbar-hoverBackground text-vscode-foreground shrink-0 cursor-pointer"
					title="Back to Chat">
					<ArrowLeft className="w-4 h-4" />
				</button>
				<div className="flex items-center gap-2">
					<Database className="w-4 h-4 text-purple-400" />
					<span className="font-bold text-sm tracking-wide">Brain Explorer</span>
				</div>
			</div>

			{/* Info / Explanation Banner */}
			<div className="p-4 border-b border-vscode-panel-border bg-vscode-welcomePage-buttonBackground/5 flex flex-col gap-2 shrink-0 select-none">
				<div className="flex items-start gap-2.5">
					<Sparkles className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
					<p className="text-xs text-vscode-descriptionForeground leading-relaxed">
						This panel shows all files the AI holds in its active memory. Toggle files to{" "}
						<strong className="text-vscode-foreground">Cold Storage</strong> to exclude them from prompt
						contexts and save tokens.
					</p>
				</div>

				<div className="grid grid-cols-3 gap-2 mt-2">
					<div className="px-2.5 py-2 rounded bg-vscode-sideBar-background border border-vscode-panel-border flex flex-col items-center">
						<span className="text-[10px] text-vscode-descriptionForeground uppercase font-bold tracking-wider">
							Total
						</span>
						<span className="text-sm font-semibold mt-0.5">{totalFiles}</span>
					</div>
					<div className="px-2.5 py-2 rounded bg-green-500/10 border border-green-500/20 flex flex-col items-center">
						<span className="text-[10px] text-green-400 uppercase font-bold tracking-wider">
							Hot (Active)
						</span>
						<span className="text-sm font-semibold text-green-300 mt-0.5">{hotFiles}</span>
					</div>
					<div className="px-2.5 py-2 rounded bg-zinc-500/10 border border-zinc-500/20 flex flex-col items-center">
						<span className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider">Cold</span>
						<span className="text-sm font-semibold text-zinc-300 mt-0.5">{coldFiles}</span>
					</div>
				</div>
			</div>

			{/* Files List */}
			<div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
				{filesReadByMirror.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-12 text-center select-none text-vscode-descriptionForeground">
						<ShieldAlert className="w-8 h-8 opacity-40 mb-3" />
						<p className="text-xs">No files currently in context memory.</p>
						<p className="text-[10px] opacity-75 mt-1">Read files or run commands to populate context.</p>
					</div>
				) : (
					filesReadByMirror.map((file) => {
						const isCold = file.storage_tier === "cold"
						const filename = file.path.split(/[/\\]/).pop() || file.path

						return (
							<div
								key={file.path}
								className={`flex items-center justify-between p-2.5 rounded border transition-all select-none ${
									isCold
										? "bg-vscode-sideBar-background/40 border-vscode-panel-border/30 opacity-60"
										: "bg-vscode-sideBarSticky-background border-vscode-panel-border/80 shadow-sm"
								}`}>
								<div className="flex flex-col min-w-0 flex-1 mr-3">
									<span
										className={`text-xs font-semibold truncate ${isCold ? "text-vscode-descriptionForeground" : "text-vscode-foreground"}`}>
										{filename}
									</span>
									<span
										className="text-[10px] text-vscode-descriptionForeground truncate font-mono mt-0.5"
										title={file.path}>
										{file.path}
									</span>
									<div className="flex items-center gap-1.5 mt-1">
										<span
											className={`text-[9px] px-1.5 py-0.5 rounded font-medium border uppercase ${
												file.record_source === "user_edited"
													? "bg-blue-500/10 border-blue-500/20 text-blue-300"
													: file.record_source === "mirror_edited"
														? "bg-purple-500/10 border-purple-500/20 text-purple-300"
														: "bg-green-500/10 border-green-500/20 text-green-300"
											}`}>
											{file.record_source.replace("_", " ")}
										</span>
										{isCold && (
											<span className="text-[9px] px-1.5 py-0.5 rounded font-medium border bg-zinc-500/10 border-zinc-500/20 text-zinc-300 uppercase">
												Cold Storage
											</span>
										)}
									</div>
								</div>

								{/* Actions */}
								<div className="flex items-center gap-1 shrink-0">
									{/* Hot / Cold Storage Toggle */}
									<button
										onClick={() => handleToggleTier(file.path, file.storage_tier)}
										className={`px-2.5 py-1 text-[10px] font-semibold rounded border cursor-pointer transition-colors ${
											isCold
												? "bg-green-500/15 border-green-500/30 text-green-200 hover:bg-green-500/25"
												: "bg-zinc-500/15 border-zinc-500/30 text-zinc-200 hover:bg-zinc-500/25"
										}`}
										title={isCold ? "Promote to Hot Context" : "Archive to Cold Storage"}>
										{isCold ? "Promote" : "Archive"}
									</button>

									{/* Forget Button */}
									<button
										onClick={() => handleForget(file.path)}
										className="p-1.5 rounded hover:bg-red-500/20 text-vscode-descriptionForeground hover:text-red-400 cursor-pointer transition-colors"
										title="Forget File Context">
										<Trash2 className="w-3.5 h-3.5" />
									</button>
								</div>
							</div>
						)
					})
				)}
			</div>
		</div>
	)
}

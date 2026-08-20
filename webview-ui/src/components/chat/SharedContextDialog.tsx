import React, { useState, useEffect, useCallback, useMemo } from "react"
import { Share2, X, FileText, Sparkles, Layers, Eye, Clock, CheckCircle2, Bot, Radio, Save } from "lucide-react"

import type { TabInfo, SharedSessionContext } from "@mirror-vs/types"
import { Button } from "@src/components/ui"
import { cn } from "@src/lib/utils"
import { vscode } from "@src/utils/vscode"

interface SharedContextDialogProps {
	isOpen: boolean
	onClose: () => void
	tabs: TabInfo[]
	activeTabId: string
	currentSessionId?: string
	sessionNames?: Record<string, string>
	sessionNotes?: string
	sessionSharedContexts?: Record<string, SharedSessionContext>
}

type DialogSection = "siblings" | "knowledge" | "notes" | "preview"

export const SharedContextDialog: React.FC<SharedContextDialogProps> = ({
	isOpen,
	onClose,
	tabs,
	activeTabId,
	currentSessionId,
	sessionNames,
	sessionNotes,
	sessionSharedContexts,
}) => {
	const [activeSection, setActiveSection] = useState<DialogSection>("siblings")
	const [notesBuffer, setNotesBuffer] = useState("")

	const activeSessionName = currentSessionId
		? (sessionNames?.[currentSessionId] ?? "Current Session")
		: "Current Session"
	const sessionCtx = currentSessionId ? sessionSharedContexts?.[currentSessionId] : undefined
	const knowledgeNotes = sessionCtx?.knowledge ?? []

	useEffect(() => {
		setNotesBuffer(sessionNotes ?? sessionCtx?.notes ?? "")
	}, [sessionNotes, sessionCtx?.notes])

	const handleSaveNotes = useCallback(() => {
		if (currentSessionId) {
			vscode.postMessage({
				type: "updateSessionNotes",
				sessionId: currentSessionId,
				sessionNotes: notesBuffer,
			})
		}
	}, [currentSessionId, notesBuffer])

	// Format what the model actually receives in system prompt
	const rawSystemPromptPreview = useMemo(() => {
		const lines: string[] = []
		lines.push("# Session Shared Context")
		lines.push(
			"You are working inside a session that may contain multiple tabs (independent tasks). Each tab is a separate task, but you may share selective context with them.",
		)
		lines.push("")
		lines.push("## Sibling tabs in this session")
		if (tabs.length > 0) {
			lines.push("| Status | Title | Summary |")
			lines.push("|--------|-------|---------|")
			for (const tab of tabs) {
				lines.push(
					`| ${tab.status} | ${tab.title.replace(/\|/g, "\\|")} | ${(tab.oneLiner ?? "").replace(/\|/g, "\\|")} |`,
				)
			}
		} else {
			lines.push("No other open tabs share this session.")
		}

		lines.push("")
		lines.push(
			`> Shared knowledge notes: ${knowledgeNotes.length}${notesBuffer.trim() ? " · User notes: present" : ""}. Use the \`read_session_context\` tool to pull full details, knowledge, or notes on demand.`,
		)

		if (notesBuffer.trim()) {
			lines.push("")
			lines.push("## User-curated session notes")
			lines.push(notesBuffer.trim())
		}

		return lines.join("\n")
	}, [tabs, knowledgeNotes.length, notesBuffer])

	if (!isOpen) return null

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
			<div className="relative w-full max-w-2xl bg-vscode-sideBar-background border border-vscode-editorGroup-border rounded-lg shadow-2xl flex flex-col overflow-hidden max-h-[85vh] animate-in zoom-in-95 duration-150">
				{/* Header */}
				<div className="flex items-center justify-between px-4 py-3 border-b border-vscode-editorGroup-border/60 bg-vscode-sideBarSticky-background">
					<div className="flex items-center gap-2 min-w-0">
						<div className="p-1.5 rounded-md bg-purple-500/10 text-purple-400 shrink-0">
							<Share2 className="w-4 h-4" />
						</div>
						<div className="min-w-0">
							<h3 className="font-semibold text-xs text-vscode-foreground truncate">
								Shared Session Context & Inspector
							</h3>
							<p className="text-[10px] text-vscode-descriptionForeground truncate">
								Session: <strong className="text-vscode-foreground">{activeSessionName}</strong> (
								{tabs.length} tabs)
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

				{/* Navigation Sub-Tabs */}
				<div className="flex items-center px-4 border-b border-vscode-editorGroup-border/40 bg-vscode-sideBar-background shrink-0 gap-1 overflow-x-auto select-none">
					<button
						onClick={() => setActiveSection("siblings")}
						className={cn(
							"flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 font-medium transition-colors cursor-pointer whitespace-nowrap",
							activeSection === "siblings"
								? "border-b-vscode-focusBorder text-vscode-foreground"
								: "border-b-transparent text-vscode-descriptionForeground hover:text-vscode-foreground",
						)}>
						<Layers className="w-3.5 h-3.5" />
						<span>Tabs in Session ({tabs.length})</span>
					</button>

					<button
						onClick={() => setActiveSection("knowledge")}
						className={cn(
							"flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 font-medium transition-colors cursor-pointer whitespace-nowrap",
							activeSection === "knowledge"
								? "border-b-vscode-focusBorder text-vscode-foreground"
								: "border-b-transparent text-vscode-descriptionForeground hover:text-vscode-foreground",
						)}>
						<Sparkles className="w-3.5 h-3.5" />
						<span>Auto Knowledge ({knowledgeNotes.length})</span>
					</button>

					<button
						onClick={() => setActiveSection("notes")}
						className={cn(
							"flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 font-medium transition-colors cursor-pointer whitespace-nowrap",
							activeSection === "notes"
								? "border-b-vscode-focusBorder text-vscode-foreground"
								: "border-b-transparent text-vscode-descriptionForeground hover:text-vscode-foreground",
						)}>
						<FileText className="w-3.5 h-3.5" />
						<span>Session Notes</span>
					</button>

					<button
						onClick={() => setActiveSection("preview")}
						className={cn(
							"flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 font-medium transition-colors cursor-pointer whitespace-nowrap",
							activeSection === "preview"
								? "border-b-vscode-focusBorder text-vscode-foreground"
								: "border-b-transparent text-vscode-descriptionForeground hover:text-vscode-foreground",
						)}>
						<Eye className="w-3.5 h-3.5" />
						<span>Model Prompt Preview</span>
					</button>
				</div>

				{/* Content Area */}
				<div className="p-4 overflow-y-auto flex-1 min-h-[300px]">
					{activeSection === "siblings" && (
						<div className="flex flex-col gap-2.5">
							<p className="text-xs text-vscode-descriptionForeground">
								All sibling tabs in this session are listed below. The AI in any tab is aware of what
								other tabs are working on.
							</p>
							<div className="flex flex-col gap-2">
								{tabs.map((tab) => {
									const isCurrent = tab.taskId === activeTabId
									return (
										<div
											key={tab.taskId}
											className={cn(
												"p-3 rounded-lg border flex flex-col gap-1.5 transition-colors",
												isCurrent
													? "bg-vscode-editor-background border-vscode-focusBorder/60"
													: "bg-vscode-editor-background/60 border-vscode-editorGroup-border/40",
											)}>
											<div className="flex items-center justify-between gap-2">
												<div className="flex items-center gap-2 min-w-0">
													<Bot className="w-4 h-4 text-purple-400 shrink-0" />
													<span className="font-semibold text-xs text-vscode-foreground truncate">
														{tab.title}
													</span>
													{isCurrent && (
														<span className="px-1.5 py-0.2 rounded bg-vscode-badge-background text-vscode-badge-foreground text-[10px] uppercase font-bold tracking-wider">
															Active Tab
														</span>
													)}
												</div>
												<span
													className={cn(
														"text-[10px] font-mono px-2 py-0.5 rounded capitalize font-medium shrink-0",
														tab.status === "streaming"
															? "bg-purple-500/20 text-purple-300 animate-pulse"
															: tab.status === "interactive"
																? "bg-yellow-500/20 text-yellow-300"
																: tab.status === "completed"
																	? "bg-green-500/20 text-green-300"
																	: "bg-vscode-badge-background text-vscode-descriptionForeground",
													)}>
													{tab.status}
												</span>
											</div>
											{tab.oneLiner && (
												<p className="text-xs text-vscode-descriptionForeground leading-normal pl-6">
													{tab.oneLiner}
												</p>
											)}
										</div>
									)
								})}
							</div>
						</div>
					)}

					{activeSection === "knowledge" && (
						<div className="flex flex-col gap-2.5">
							<p className="text-xs text-vscode-descriptionForeground">
								Key decisions and milestones automatically extracted from tasks when they complete or
								condense.
							</p>
							{knowledgeNotes.length === 0 ? (
								<div className="p-8 text-center text-xs text-vscode-descriptionForeground border border-dashed border-vscode-editorGroup-border rounded-lg">
									No knowledge notes extracted yet. As tasks complete in this session, key insights
									will appear here.
								</div>
							) : (
								<div className="flex flex-col gap-2">
									{knowledgeNotes.map((note, index) => (
										<div
											key={note.id || index}
											className="p-3 rounded-lg bg-vscode-editor-background border border-vscode-editorGroup-border/50 flex flex-col gap-1 text-xs">
											<div className="flex items-center justify-between text-[10px] text-vscode-descriptionForeground">
												<span className="font-mono">
													From Tab: {note.sourceTaskId?.slice(0, 8)}...
												</span>
												{note.createdAt && (
													<span className="flex items-center gap-1">
														<Clock className="w-3 h-3" />
														{new Date(note.createdAt).toLocaleTimeString()}
													</span>
												)}
											</div>
											<p className="text-vscode-foreground leading-relaxed font-mono text-[11px] whitespace-pre-wrap">
												{note.text}
											</p>
										</div>
									))}
								</div>
							)}
						</div>
					)}

					{activeSection === "notes" && (
						<div className="flex flex-col gap-3">
							<p className="text-xs text-vscode-descriptionForeground">
								Session-wide markdown notes shared with all tabs in this session. Write architecture
								guidelines, decisions, or scratchpads.
							</p>
							<textarea
								value={notesBuffer}
								onChange={(e) => setNotesBuffer(e.target.value)}
								placeholder="Enter shared notes for this session (e.g. API contracts, test requirements, architectural decisions)..."
								rows={10}
								className="w-full resize-y rounded bg-vscode-input-background text-vscode-input-foreground border border-vscode-editorGroup-border focus:border-vscode-focusBorder outline-none p-3 text-xs leading-relaxed font-mono"
							/>
							<div className="flex items-center justify-between">
								<span className="text-[10px] text-vscode-descriptionForeground">
									Survives editor restarts and is accessible across all tabs via
									\`read_session_context\`.
								</span>
								<Button
									variant="primary"
									className="text-xs px-3 py-1.5 h-auto"
									onClick={handleSaveNotes}>
									<Save className="w-3.5 h-3.5 mr-1" />
									Save Notes
								</Button>
							</div>
						</div>
					)}

					{activeSection === "preview" && (
						<div className="flex flex-col gap-2.5">
							<p className="text-xs text-vscode-descriptionForeground">
								Below is the exact `# Session Shared Context` markdown that gets injected into the
								system prompt for every tab in this session:
							</p>
							<pre className="p-3 rounded bg-vscode-editor-background border border-vscode-editorGroup-border text-[11px] text-vscode-foreground font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap select-text">
								{rawSystemPromptPreview}
							</pre>
						</div>
					)}
				</div>

				{/* Footer */}
				<div className="flex items-center justify-end px-4 py-2.5 border-t border-vscode-editorGroup-border/60 bg-vscode-sideBarSticky-background">
					<Button variant="ghost" className="text-xs px-3 py-1 h-auto" onClick={onClose}>
						Close
					</Button>
				</div>
			</div>
		</div>
	)
}

export default SharedContextDialog

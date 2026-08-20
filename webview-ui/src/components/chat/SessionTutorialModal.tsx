import React, { useState } from "react"
import {
	HelpCircle,
	X,
	Layers,
	Share2,
	Zap,
	Keyboard,
	Sparkles,
	ChevronRight,
	ChevronLeft,
	Bot,
	CheckCircle2,
} from "lucide-react"

import { Button } from "@src/components/ui"
import { cn } from "@src/lib/utils"

interface SessionTutorialModalProps {
	isOpen: boolean
	onClose: () => void
}

const tutorialSlides = [
	{
		title: "Sessions vs Tabs (SubSessions)",
		subtitle: "Understanding the hierarchy in Mirror VS",
		icon: Layers,
		color: "text-blue-400",
		content: (
			<div className="flex flex-col gap-3 text-xs text-vscode-descriptionForeground leading-relaxed">
				<p>
					In Mirror VS, a <strong className="text-vscode-foreground">Session</strong> represents a high-level
					work topic or project workspace. Inside each session, you can open multiple{" "}
					<strong className="text-vscode-foreground">Tabs (SubSessions)</strong>.
				</p>
				<div className="p-3 rounded bg-vscode-editor-background border border-vscode-editorGroup-border/50 flex flex-col gap-2">
					<div className="flex items-center gap-2 text-vscode-foreground font-semibold text-[11px]">
						<span className="p-1 rounded bg-blue-500/20 text-blue-400">📁 Session</span>
						<span>Group container for your project / feature</span>
					</div>
					<div className="pl-6 border-l border-vscode-panel-border/60 ml-2 flex flex-col gap-1.5">
						<div className="flex items-center gap-2">
							<span className="p-0.5 px-1.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-mono">
								Tab 1
							</span>
							<span>Feature implementation / coding</span>
						</div>
						<div className="flex items-center gap-2">
							<span className="p-0.5 px-1.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-mono">
								Tab 2
							</span>
							<span>Unit tests & code verification</span>
						</div>
						<div className="flex items-center gap-2">
							<span className="p-0.5 px-1.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-mono">
								Tab 3
							</span>
							<span>Documentation or research</span>
						</div>
					</div>
				</div>
				<p>
					Each tab maintains its own clean conversation history, avoiding context-window clutter while working
					in parallel!
				</p>
			</div>
		),
	},
	{
		title: "Automatic Context Sharing",
		subtitle: "How sibling tabs stay synchronized",
		icon: Share2,
		color: "text-purple-400",
		content: (
			<div className="flex flex-col gap-3 text-xs text-vscode-descriptionForeground leading-relaxed">
				<p>Sibling tabs don't work in isolation—they share selective high-level intelligence:</p>
				<div className="grid grid-cols-1 gap-2">
					<div className="p-2.5 rounded bg-vscode-editor-background border border-vscode-editorGroup-border/50 flex items-start gap-2.5">
						<Bot className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
						<div>
							<span className="font-semibold text-vscode-foreground block">Sibling Awareness</span>
							<span>
								Each tab automatically knows what other tabs exist, their current status, and their
								active goal.
							</span>
						</div>
					</div>
					<div className="p-2.5 rounded bg-vscode-editor-background border border-vscode-editorGroup-border/50 flex items-start gap-2.5">
						<Sparkles className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
						<div>
							<span className="font-semibold text-vscode-foreground block">Auto-Distilled Knowledge</span>
							<span>
								When a tab finishes a task or creates solutions, key decisions and milestones are
								distilled into shared notes.
							</span>
						</div>
					</div>
					<div className="p-2.5 rounded bg-vscode-editor-background border border-vscode-editorGroup-border/50 flex items-start gap-2.5">
						<CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
						<div>
							<span className="font-semibold text-vscode-foreground block">Shared Session Notes</span>
							<span>
								User-written notes in the toolbar are instantly accessible to all tabs in the session.
							</span>
						</div>
					</div>
				</div>
			</div>
		),
	},
	{
		title: "Shortcuts & Superpowers",
		subtitle: "Speed up your multi-agent workflow",
		icon: Keyboard,
		color: "text-green-400",
		content: (
			<div className="flex flex-col gap-3 text-xs text-vscode-descriptionForeground leading-relaxed">
				<div className="p-3 rounded bg-vscode-editor-background border border-vscode-editorGroup-border/50 flex flex-col gap-2 font-mono">
					<div className="flex items-center justify-between">
						<span>New Tab in Session</span>
						<span className="px-2 py-0.5 rounded bg-vscode-badge-background text-vscode-badge-foreground text-[11px]">
							Cmd / Ctrl + N
						</span>
					</div>
					<div className="flex items-center justify-between">
						<span>Close Current Tab</span>
						<span className="px-2 py-0.5 rounded bg-vscode-badge-background text-vscode-badge-foreground text-[11px]">
							Cmd / Ctrl + W
						</span>
					</div>
					<div className="flex items-center justify-between">
						<span>New Fresh Session</span>
						<span className="px-2 py-0.5 rounded bg-vscode-badge-background text-vscode-badge-foreground text-[11px]">
							Cmd / Ctrl + Shift + N
						</span>
					</div>
					<div className="flex items-center justify-between">
						<span>Rename Tab / Session</span>
						<span className="px-2 py-0.5 rounded bg-vscode-badge-background text-vscode-badge-foreground text-[11px]">
							Double Click Title
						</span>
					</div>
				</div>
				<div className="p-2.5 rounded bg-blue-500/10 border border-blue-500/20 text-vscode-foreground">
					💡 <strong>Pro Tip:</strong> Click the <strong>Shared Context</strong> button anytime to inspect
					exactly what knowledge notes and sibling summaries the AI sees!
				</div>
			</div>
		),
	},
]

export const SessionTutorialModal: React.FC<SessionTutorialModalProps> = ({ isOpen, onClose }) => {
	const [currentSlide, setCurrentSlide] = useState(0)

	if (!isOpen) return null

	const slide = tutorialSlides[currentSlide]
	const Icon = slide.icon

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
			<div className="relative w-full max-w-md bg-vscode-sideBar-background border border-vscode-editorGroup-border rounded-lg shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
				{/* Header */}
				<div className="flex items-center justify-between px-4 py-3 border-b border-vscode-editorGroup-border/60 bg-vscode-sideBarSticky-background">
					<div className="flex items-center gap-2">
						<div className={cn("p-1.5 rounded-md bg-vscode-button-background/10", slide.color)}>
							<Icon className="w-4 h-4" />
						</div>
						<div>
							<h3 className="font-semibold text-xs text-vscode-foreground leading-none">{slide.title}</h3>
							<p className="text-[10px] text-vscode-descriptionForeground mt-0.5">{slide.subtitle}</p>
						</div>
					</div>
					<button
						onClick={onClose}
						className="p-1 rounded text-vscode-descriptionForeground hover:text-vscode-foreground hover:bg-vscode-list-hoverBackground cursor-pointer transition-colors"
						aria-label="Close tutorial">
						<X className="w-4 h-4" />
					</button>
				</div>

				{/* Body */}
				<div className="p-4 overflow-y-auto max-h-[60vh]">{slide.content}</div>

				{/* Footer with indicators and controls */}
				<div className="flex items-center justify-between px-4 py-3 border-t border-vscode-editorGroup-border/60 bg-vscode-sideBarSticky-background">
					{/* Slide dots */}
					<div className="flex items-center gap-1.5">
						{tutorialSlides.map((_, idx) => (
							<button
								key={idx}
								onClick={() => setCurrentSlide(idx)}
								className={cn(
									"w-2 h-2 rounded-full transition-all cursor-pointer",
									idx === currentSlide
										? "bg-vscode-button-background w-4"
										: "bg-vscode-descriptionForeground/40 hover:bg-vscode-descriptionForeground",
								)}
								aria-label={`Go to slide ${idx + 1}`}
							/>
						))}
					</div>

					<div className="flex items-center gap-2">
						{currentSlide > 0 && (
							<Button
								variant="ghost"
								className="text-xs px-2 py-1 h-auto"
								onClick={() => setCurrentSlide((prev) => prev - 1)}>
								<ChevronLeft className="w-3.5 h-3.5 mr-1" />
								Back
							</Button>
						)}

						{currentSlide < tutorialSlides.length - 1 ? (
							<Button
								variant="primary"
								className="text-xs px-3 py-1 h-auto"
								onClick={() => setCurrentSlide((prev) => prev + 1)}>
								Next
								<ChevronRight className="w-3.5 h-3.5 ml-1" />
							</Button>
						) : (
							<Button variant="primary" className="text-xs px-3 py-1 h-auto" onClick={onClose}>
								Got it!
							</Button>
						)}
					</div>
				</div>
			</div>
		</div>
	)
}

export default SessionTutorialModal

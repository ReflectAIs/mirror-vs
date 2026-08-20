import { memo, useState, useMemo } from "react"
import { ChevronDown, CheckCircle2, XCircle, Zap, Folder } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui"

interface TerminalCallbackNudgeProps {
	text?: string
}

export const TerminalCallbackNudge = memo(({ text }: TerminalCallbackNudgeProps) => {
	const [isExpanded, setIsExpanded] = useState(false)

	const parsed = useMemo(() => {
		if (!text) return { command: "", cwd: "", exitStatus: "", output: "" }

		// Matches "[Terminal Callback: Background process for '<command>' finished in '<cwd>'. <exitStatus>]\nOutput:\n<output>"
		const match = text.match(
			/\[Terminal Callback: Background process for '([^']+)' finished in '([^']*)'\.\s*([^\]]+)\](?:\s*Output:\s*([\s\S]*))?/,
		)

		if (match) {
			return {
				command: match[1] || "",
				cwd: match[2] || "",
				exitStatus: match[3] || "",
				output: (match[4] || "").trim(),
			}
		}

		// Fallback parse if format differs
		const outputIndex = text.indexOf("Output:\n")
		const header = outputIndex !== -1 ? text.slice(0, outputIndex) : text
		const output = outputIndex !== -1 ? text.slice(outputIndex + "Output:\n".length).trim() : ""

		return {
			command: header.replace(/^\[Terminal Callback:\s*/, "").replace(/\]$/, ""),
			cwd: "",
			exitStatus: "Completed",
			output,
		}
	}, [text])

	const isSuccess =
		!parsed.exitStatus.toLowerCase().includes("fail") &&
		!parsed.exitStatus.toLowerCase().includes("error") &&
		!parsed.exitStatus.includes("Exit 1")

	return (
		<div className="my-2 rounded-lg bg-vscode-editor-background/60 border border-vscode-panel-border/50 hover:border-mirror-brand-via/30 transition-all p-2.5 shadow-xs backdrop-blur-xs group">
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2 min-w-0 flex-1">
					<div className="flex items-center justify-center size-6 rounded-md bg-mirror-brand-via/10 text-mirror-brand-via shrink-0">
						<Zap className="size-3.5 animate-pulse" />
					</div>
					<div className="flex items-center gap-1.5 flex-wrap min-w-0">
						<span className="text-[11px] font-bold text-vscode-foreground tracking-wide">
							Terminal Nudge
						</span>
						{parsed.command && (
							<span
								className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-vscode-badge-background/30 text-vscode-foreground max-w-[240px] truncate border border-vscode-panel-border/30"
								title={parsed.command}>
								{parsed.command}
							</span>
						)}
						{parsed.exitStatus && (
							<span
								className={cn(
									"text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded border inline-flex items-center gap-1",
									isSuccess
										? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
										: "bg-red-500/10 text-red-400 border-red-500/20",
								)}>
								{isSuccess ? <CheckCircle2 className="size-2.5" /> : <XCircle className="size-2.5" />}
								{parsed.exitStatus}
							</span>
						)}
					</div>
				</div>

				{parsed.output && (
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setIsExpanded(!isExpanded)}
						className="h-6 text-[11px] px-2 text-vscode-descriptionForeground hover:text-vscode-foreground shrink-0 flex items-center gap-1">
						<span>{isExpanded ? "Hide Output" : "View Output"}</span>
						<ChevronDown
							className={cn("size-3 transition-transform duration-200", isExpanded && "rotate-180")}
						/>
					</Button>
				)}
			</div>

			{parsed.cwd && (
				<div className="flex items-center gap-1 text-[10px] text-vscode-descriptionForeground font-mono mt-1 pl-8">
					<Folder className="size-2.5" />
					<span className="truncate">{parsed.cwd}</span>
				</div>
			)}

			{isExpanded && parsed.output && (
				<div className="mt-2 pl-8">
					<pre className="text-[11px] font-mono bg-vscode-terminal-background p-2 rounded border border-vscode-panel-border/40 overflow-x-auto max-h-[220px] overflow-y-auto whitespace-pre-wrap text-vscode-editor-foreground">
						{parsed.output}
					</pre>
				</div>
			)}
		</div>
	)
})

TerminalCallbackNudge.displayName = "TerminalCallbackNudge"

import { memo, useState, useMemo, useCallback } from "react"
import { ChevronDown, CheckCircle2, XCircle, Terminal, ArrowUpRight, Copy, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui"

interface TerminalCallbackNudgeProps {
	text?: string
	onNavigateToMessage?: (ts: number) => void
	messageTs?: number
}

export const TerminalCallbackNudge = memo(({ text, onNavigateToMessage, messageTs }: TerminalCallbackNudgeProps) => {
	const [isExpanded, setIsExpanded] = useState(false)
	const [copied, setCopied] = useState(false)

	const parsed = useMemo(() => {
		if (!text) return { command: "", cwd: "", exitStatus: "", output: "", isNotice: false }

		const isNotice = text.includes("[Terminal Notice:")

		// Matches "[Terminal Callback: Background process for '<command>' finished in '<cwd>'. <exitStatus>]\nOutput:\n<output>"
		const callbackMatch = text.match(
			/\[Terminal Callback: Background process for '([^']+)' finished in '([^']*)'\.\s*([^\]]+)\](?:\s*Output:\s*([\s\S]*))?/,
		)

		if (callbackMatch) {
			return {
				command: callbackMatch[1] || "",
				cwd: callbackMatch[2] || "",
				exitStatus: callbackMatch[3] || "",
				output: (callbackMatch[4] || "").trim(),
				isNotice: false,
			}
		}

		// Matches "[Terminal Notice: Background process for '<command>' in '<cwd>' ...]"
		const noticeMatch = text.match(/\[Terminal Notice: Background process for '([^']+)' in '([^']*)'\s*([^\]]+)\]/)

		if (noticeMatch) {
			return {
				command: noticeMatch[1] || "",
				cwd: noticeMatch[2] || "",
				exitStatus: "Running",
				output: "",
				isNotice: true,
			}
		}

		// Fallback parse if format differs
		const outputIndex = text.indexOf("Output:\n")
		const header = outputIndex !== -1 ? text.slice(0, outputIndex) : text
		const output = outputIndex !== -1 ? text.slice(outputIndex + "Output:\n".length).trim() : ""

		return {
			command: header.replace(/^\[Terminal (?:Callback|Notice):\s*/, "").replace(/\]$/, ""),
			cwd: "",
			exitStatus: "Completed",
			output,
			isNotice,
		}
	}, [text])

	const isSuccess =
		!parsed.exitStatus.toLowerCase().includes("fail") &&
		!parsed.exitStatus.toLowerCase().includes("error") &&
		!parsed.exitStatus.includes("Exit 1") &&
		parsed.exitStatus !== "Running"

	const isRunning = parsed.exitStatus === "Running"

	const handleJumpToCommand = useCallback(() => {
		// Try to find the closest previous command DOM element or scroll up
		if (messageTs && onNavigateToMessage) {
			onNavigateToMessage(messageTs)
		} else {
			// Find previous row in DOM
			const target = document.querySelector(`[data-ts='${messageTs}']`)?.previousElementSibling
			if (target && "scrollIntoView" in target) {
				;(target as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" })
			}
		}
	}, [messageTs, onNavigateToMessage])

	const handleCopy = useCallback(() => {
		if (parsed.output) {
			navigator.clipboard.writeText(parsed.output)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		}
	}, [parsed.output])

	return (
		<div className="my-1.5 w-full max-w-full overflow-hidden box-border rounded-md bg-vscode-sideBar-background/60 border border-vscode-panel-border/40 hover:border-mirror-brand-via/30 transition-all text-xs shadow-2xs backdrop-blur-xs group">
			<div className="flex items-center justify-between gap-1.5 px-2.5 py-1.5 min-h-[30px] w-full min-w-0 max-w-full overflow-hidden box-border">
				<div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
					<Terminal
						className={cn(
							"size-3.5 shrink-0",
							isRunning
								? "text-amber-400 animate-pulse"
								: isSuccess
									? "text-emerald-400"
									: "text-red-400",
						)}
					/>
					<span className="text-[10px] font-semibold text-vscode-descriptionForeground tracking-wider uppercase shrink-0">
						{parsed.isNotice ? "Terminal Active" : "Terminal Done"}
					</span>
					{parsed.command && (
						<span
							className="font-mono text-[11px] px-1.5 py-0.2 rounded bg-vscode-badge-background/20 text-vscode-foreground min-w-0 max-w-[140px] xs:max-w-[200px] sm:max-w-[280px] truncate border border-vscode-panel-border/30 shrink"
							title={parsed.command}>
							{parsed.command}
						</span>
					)}
					{parsed.exitStatus && (
						<span
							className={cn(
								"text-[10px] font-mono font-medium px-1.5 py-0.2 rounded border inline-flex items-center gap-1 shrink-0 whitespace-nowrap",
								isRunning
									? "bg-amber-500/10 text-amber-300 border-amber-500/20"
									: isSuccess
										? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
										: "bg-red-500/10 text-red-400 border-red-500/20",
							)}>
							{!isRunning &&
								(isSuccess ? <CheckCircle2 className="size-2.5" /> : <XCircle className="size-2.5" />)}
							{parsed.exitStatus}
						</span>
					)}
				</div>

				<div className="flex items-center gap-1 shrink-0">
					{parsed.output && (
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setIsExpanded(!isExpanded)}
							className="h-5 text-[10px] px-1.5 text-vscode-descriptionForeground hover:text-vscode-foreground flex items-center gap-1 cursor-pointer">
							<span>{isExpanded ? "Hide" : "View Output"}</span>
							<ChevronDown
								className={cn("size-2.5 transition-transform duration-200", isExpanded && "rotate-180")}
							/>
						</Button>
					)}
					<Button
						variant="ghost"
						size="sm"
						onClick={handleJumpToCommand}
						className="h-5 text-[10px] px-1.5 text-vscode-descriptionForeground hover:text-vscode-foreground flex items-center gap-0.5 cursor-pointer opacity-70 group-hover:opacity-100 transition-opacity"
						title="Scroll to terminal command in chat">
						<span>Jump</span>
						<ArrowUpRight className="size-2.5" />
					</Button>
				</div>
			</div>

			{isExpanded && parsed.output && (
				<div className="px-2.5 pb-2 pt-1 border-t border-vscode-panel-border/20 w-full max-w-full overflow-hidden box-border">
					<div className="flex items-center justify-between text-[10px] text-vscode-descriptionForeground font-mono mb-1 min-w-0">
						<span className="truncate mr-2">{parsed.cwd ? `cwd: ${parsed.cwd}` : "Output"}</span>
						<button
							onClick={handleCopy}
							className="flex items-center gap-1 hover:text-vscode-foreground cursor-pointer transition-colors shrink-0">
							{copied ? <Check className="size-2.5 text-emerald-400" /> : <Copy className="size-2.5" />}
							<span>{copied ? "Copied" : "Copy"}</span>
						</button>
					</div>
					<pre className="text-[10.5px] font-mono bg-vscode-terminal-background p-2 rounded border border-vscode-panel-border/30 overflow-x-auto max-h-[180px] overflow-y-auto whitespace-pre-wrap break-all sm:break-words text-vscode-editor-foreground w-full max-w-full box-border">
						{parsed.output}
					</pre>
				</div>
			)}
		</div>
	)
})

TerminalCallbackNudge.displayName = "TerminalCallbackNudge"

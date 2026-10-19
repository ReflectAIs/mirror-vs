import { memo, useState, useMemo, useCallback } from "react"
import { ChevronDown, CheckCircle2, XCircle, Terminal, ArrowUpRight, Copy, Check, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui"
import { vscode } from "@/utils/vscode"
import { detectInteractivePrompt } from "./CommandExecution"

interface TerminalCallbackNudgeProps {
	text?: string
	onNavigateToMessage?: (ts: number) => void
	messageTs?: number
}

export const TerminalCallbackNudge = memo(({ text, onNavigateToMessage, messageTs }: TerminalCallbackNudgeProps) => {
	const [isExpanded, setIsExpanded] = useState(false)
	const [copied, setCopied] = useState(false)
	const [terminalInput, setTerminalInput] = useState("")
	const [inputSentFeedback, setInputSentFeedback] = useState(false)
	const [showInputManually, setShowInputManually] = useState(false)

	const parsed = useMemo(() => {
		if (!text) return { command: "", cwd: "", exitStatus: "", output: "", isNotice: false }

		const isNotice = text.includes("[Terminal Notice:")
		const noticePrefix = "[Terminal Notice: Background process for '"
		const callbackPrefix = "[Terminal Callback: Background process for '"

		if (isNotice && text.includes(noticePrefix)) {
			let command = ""
			let cwd = ""
			let output = ""

			const runningMarker = "' is still running"
			const runningIdx = text.indexOf(runningMarker)
			if (runningIdx !== -1) {
				const beforeRunning = text.slice(noticePrefix.length, runningIdx)
				const inIdx = beforeRunning.lastIndexOf("' in '")
				if (inIdx !== -1) {
					command = beforeRunning.slice(0, inIdx)
					cwd = beforeRunning.slice(inIdx + "' in '".length)
				} else {
					command = beforeRunning
				}
			}

			// Clean output: strip out system "Instructions for Model:" and logs metadata
			let cleanText = text.replace(/Instructions for Model:[\s\S]*$/, "").trim()
			cleanText = cleanText.replace(/\]$/, "").trim()

			const recentIdx = cleanText.indexOf("Recent output:\n")
			if (recentIdx !== -1) {
				const afterRecent = cleanText.slice(recentIdx + "Recent output:\n".length)
				const logsIdx = afterRecent.indexOf("\nLogs:")
				output = (logsIdx !== -1 ? afterRecent.slice(0, logsIdx) : afterRecent).trim()
			} else {
				// If no recent output snippet, grab progress lines if available
				const progressMatch = cleanText.match(/Progress: [^\n]+/)
				if (progressMatch) {
					output = progressMatch[0]
				}
			}

			return {
				command: command || "Background command",
				cwd,
				exitStatus: "Running",
				output,
				isNotice: true,
			}
		}

		if (text.includes(callbackPrefix)) {
			let command = ""
			let cwd = ""
			let exitStatus = "Completed"
			let output = ""

			const headerEnd = text.indexOf("]")
			const header = headerEnd !== -1 ? text.slice(0, headerEnd) : text
			const afterPrefix = header.slice(callbackPrefix.length)
			const finIdx = afterPrefix.lastIndexOf("' finished in '")
			if (finIdx !== -1) {
				command = afterPrefix.slice(0, finIdx)
				const afterFin = afterPrefix.slice(finIdx + "' finished in '".length)
				const dotIdx = afterFin.indexOf("'. ")
				if (dotIdx !== -1) {
					cwd = afterFin.slice(0, dotIdx)
					exitStatus = afterFin.slice(dotIdx + "'. ".length).trim()
				} else {
					cwd = afterFin
				}
			}

			const outputIdx = text.indexOf("Output:\n")
			if (outputIdx !== -1) {
				let out = text.slice(outputIdx + "Output:\n".length)
				const logsIdx = out.indexOf("\nLogs:")
				if (logsIdx !== -1) out = out.slice(0, logsIdx)
				const instrIdx = out.indexOf("Instructions for Model:")
				if (instrIdx !== -1) out = out.slice(0, instrIdx)
				output = out.replace(/\]$/, "").trim()
			}

			return {
				command: command || "Background command",
				cwd,
				exitStatus: exitStatus || "Completed",
				output,
				isNotice: false,
			}
		}

		// Fallback parse if format differs
		const outputIndex = text.indexOf("Output:\n")
		const header = outputIndex !== -1 ? text.slice(0, outputIndex) : text
		let output = outputIndex !== -1 ? text.slice(outputIndex + "Output:\n".length).trim() : ""
		output = output.replace(/Instructions for Model:[\s\S]*$/, "").trim()

		let fallbackCommand = header.replace(/^\[Terminal (?:Callback|Notice):\s*/, "").replace(/\]$/, "")
		if (fallbackCommand.includes("\n")) {
			fallbackCommand = fallbackCommand.split("\n")[0]
		}

		return {
			command: fallbackCommand,
			cwd: "",
			exitStatus: isNotice ? "Running" : "Completed",
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

	const hasInteractivePrompt = useMemo(() => {
		if (!isRunning && !parsed.isNotice) return false
		return detectInteractivePrompt(parsed.output)
	}, [isRunning, parsed.isNotice, parsed.output])

	const shouldShowInteractiveInput =
		(isRunning || parsed.isNotice) && (hasInteractivePrompt || showInputManually || parsed.isNotice)

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

	const handleSendInput = useCallback(
		(customVal?: string) => {
			const valToSend = customVal !== undefined ? customVal : terminalInput
			vscode.postMessage({
				type: "sendTerminalInput",
				terminalInput: valToSend,
			})
			setTerminalInput("")
			setInputSentFeedback(true)
			setTimeout(() => setInputSentFeedback(false), 2000)
		},
		[terminalInput],
	)

	return (
		<div className="my-1 select-none text-xs">
			<div
				onClick={() => setIsExpanded(!isExpanded)}
				className="flex items-center justify-between gap-2 py-1 px-1.5 rounded text-vscode-descriptionForeground hover:text-vscode-foreground select-none group transition-colors cursor-pointer hover:bg-vscode-list-hoverBackground/30">
				<div className="flex items-center gap-2 min-w-0 flex-1">
					<Terminal className="size-3.5 text-vscode-descriptionForeground shrink-0" />
					<span className="text-vscode-descriptionForeground/70 text-[11px] shrink-0 font-normal">
						{isRunning ? "Terminal active" : "Terminal"}
					</span>
					{parsed.command && (
						<code
							className="font-mono text-[11.5px] text-vscode-foreground font-medium no-code-bg bg-transparent px-0 py-0 truncate"
							title={parsed.command}>
							{parsed.command}
						</code>
					)}
				</div>

				<div className="flex items-center gap-1.5 shrink-0">
					{isRunning ? (
						<span className="size-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
					) : isSuccess ? (
						<span className="text-emerald-400 text-[10px] font-medium shrink-0">✓</span>
					) : (
						<span className="text-red-400 text-[10px] font-medium shrink-0">✗</span>
					)}

					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation()
							handleJumpToCommand()
						}}
						className="text-vscode-descriptionForeground hover:text-vscode-foreground p-0.5 rounded hover:bg-vscode-toolbar-hoverBackground cursor-pointer opacity-70 group-hover:opacity-100 transition-opacity"
						title="Jump to command in chat">
						<ArrowUpRight className="size-3" />
					</button>

					{parsed.output && (
						<ChevronDown
							className={cn(
								"size-3 text-vscode-descriptionForeground/70 transition-transform duration-150 shrink-0",
								isExpanded ? "rotate-0" : "-rotate-90",
							)}
						/>
					)}
				</div>
			</div>

			{isExpanded && (
				<div className="ml-3 pl-2.5 border-l border-vscode-panel-border/20 flex flex-col gap-1 my-1">
					{parsed.command && (
						<div className="flex items-start justify-between gap-1 text-[10.5px] font-mono text-vscode-foreground bg-vscode-terminal-background p-1.5 rounded border border-vscode-panel-border/30 max-h-[140px] overflow-y-auto">
							<div className="flex items-start gap-1 min-w-0 flex-1">
								<span className="text-vscode-descriptionForeground/40 shrink-0 select-none">~ $</span>
								<span className="text-vscode-foreground/90 font-medium whitespace-pre-wrap break-all select-text font-mono">
									{parsed.command}
								</span>
							</div>
						</div>
					)}
					{parsed.output ? (
						<>
							<div className="flex items-center justify-between text-[10px] text-vscode-descriptionForeground font-mono">
								<span className="truncate mr-2">{parsed.cwd ? `cwd: ${parsed.cwd}` : "Output"}</span>
								<button
									onClick={handleCopy}
									className="flex items-center gap-1 hover:text-vscode-foreground cursor-pointer transition-colors shrink-0">
									{copied ? (
										<Check className="size-2.5 text-emerald-400" />
									) : (
										<Copy className="size-2.5" />
									)}
									<span>{copied ? "Copied" : "Copy"}</span>
								</button>
							</div>
							<pre className="text-[10.5px] font-mono bg-vscode-terminal-background p-2 rounded border border-vscode-panel-border/30 overflow-x-auto max-h-[180px] overflow-y-auto whitespace-pre-wrap break-all sm:break-words text-vscode-editor-foreground w-full box-border">
								{parsed.output}
							</pre>
						</>
					) : null}
				</div>
			)}

			{shouldShowInteractiveInput && (
				<div className="ml-3 pl-2.5 border-l border-vscode-panel-border/20 py-1 flex items-center gap-1.5">
					<span className="size-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
					<button
						type="button"
						onClick={() => handleSendInput("y")}
						className="h-5 px-1.5 rounded text-[10px] font-mono bg-vscode-button-secondaryBackground hover:bg-vscode-button-secondaryHoverBackground text-vscode-button-secondaryForeground cursor-pointer">
						y
					</button>
					<button
						type="button"
						onClick={() => handleSendInput("n")}
						className="h-5 px-1.5 rounded text-[10px] font-mono bg-vscode-button-secondaryBackground hover:bg-vscode-button-secondaryHoverBackground text-vscode-button-secondaryForeground cursor-pointer">
						n
					</button>
					<input
						type="text"
						value={terminalInput}
						onChange={(e) => setTerminalInput(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") handleSendInput()
						}}
						placeholder="Terminal response..."
						className="h-5 px-1.5 text-[10px] rounded bg-vscode-input-background text-vscode-input-foreground border border-vscode-input-border outline-none flex-1 min-w-0"
					/>
					<button
						type="button"
						onClick={() => handleSendInput()}
						className="h-5 px-2 text-[10px] rounded bg-vscode-button-background text-vscode-button-foreground cursor-pointer">
						Send
					</button>
				</div>
			)}
		</div>
	)
})

TerminalCallbackNudge.displayName = "TerminalCallbackNudge"

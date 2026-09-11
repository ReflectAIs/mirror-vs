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
				onClick={() => {
					if (parsed.output) setIsExpanded(!isExpanded)
				}}
				className={cn(
					"flex items-center justify-between gap-2 py-1 px-1.5 rounded text-vscode-descriptionForeground hover:text-vscode-foreground select-none group transition-colors",
					parsed.output ? "cursor-pointer hover:bg-vscode-list-hoverBackground/30" : "",
				)}>
				<div className="flex items-center gap-2 min-w-0 flex-1">
					<Terminal className="size-3.5 text-vscode-descriptionForeground shrink-0" />
					<span className="text-vscode-descriptionForeground/70 text-[11px] shrink-0 font-normal">
						{isRunning ? "Terminal active" : "Terminal"}
					</span>
					{parsed.command && (
						<code
							className="font-mono text-[11.5px] text-vscode-foreground font-medium truncate no-code-bg bg-transparent px-0 py-0"
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

			{isExpanded && parsed.output && (
				<div className="ml-3 pl-2.5 border-l border-vscode-panel-border/20 flex flex-col gap-1 my-1">
					<div className="flex items-center justify-between text-[10px] text-vscode-descriptionForeground font-mono">
						<span className="truncate mr-2">{parsed.cwd ? `cwd: ${parsed.cwd}` : "Output"}</span>
						<button
							onClick={handleCopy}
							className="flex items-center gap-1 hover:text-vscode-foreground cursor-pointer transition-colors shrink-0">
							{copied ? <Check className="size-2.5 text-emerald-400" /> : <Copy className="size-2.5" />}
							<span>{copied ? "Copied" : "Copy"}</span>
						</button>
					</div>
					<pre className="text-[10.5px] font-mono bg-vscode-terminal-background p-2 rounded border border-vscode-panel-border/30 overflow-x-auto max-h-[180px] overflow-y-auto whitespace-pre-wrap break-all sm:break-words text-vscode-editor-foreground w-full box-border">
						{parsed.output}
					</pre>
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

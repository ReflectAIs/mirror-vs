import { useCallback, useState, memo, useMemo } from "react"
import { useEvent } from "react-use"
import { t } from "i18next"
import { ChevronDown, OctagonX, Check, Copy, Loader2, Terminal as TerminalIcon } from "lucide-react"

import { type ExtensionMessage, type CommandExecutionStatus, commandExecutionStatusSchema } from "@mirror-vs/types"

import { safeJsonParse } from "@shared/core"
import { COMMAND_OUTPUT_STRING } from "@shared/combineCommandSequences"
import { parseCommand } from "@shared/parse-command"

import { vscode } from "@src/utils/vscode"
import { extractPatternsFromCommand } from "@src/utils/command-parser"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import { cn } from "@src/lib/utils"

import { Button, StandardTooltip } from "@src/components/ui"
import CodeBlock from "@src/components/common/CodeBlock"

import { CommandPatternSelector } from "./CommandPatternSelector"
import { TerminalOutput } from "./TerminalOutput"
import { ProgressIndicator } from "./ProgressIndicator"

// Heuristic pattern to detect interactive prompts waiting for user input
export const INTERACTIVE_PROMPT_REGEX =
	/(?:\[[yYnN]\/[yYnN]\]|\([yYnN]\/[yYnN]\)|\b(?:password|passphrase|username|name|email|path|choice|option):\s*$|\b(?:confirm|continue|proceed|are you sure)\??\s*$|\[\s*(?:yes|no)\s*\]|\?\s*\[[^\]]+\]|\(yes\/no\)\s*\??\s*$|Press\s+\[?Enter\]?\s+to\s+continue|Do you want to continue\?|\(Y\/n\)|\(y\/N\)|:\s*$|\?\s*$|>\s*$)/i

export function detectInteractivePrompt(output: string): boolean {
	if (!output) return false
	// Check the tail of the output (last 600 characters or last 5 lines)
	const tail = output.slice(-600).trim()
	if (!tail) return false
	return INTERACTIVE_PROMPT_REGEX.test(tail)
}

interface CommandPattern {
	pattern: string
	description?: string
}

interface CommandExecutionProps {
	executionId: string
	text?: string
	icon?: JSX.Element | null
	title?: JSX.Element | null
}

export const CommandExecution = ({ executionId, text, icon, title }: CommandExecutionProps) => {
	const {
		terminalShellIntegrationDisabled = false,
		allowedCommands = [],
		deniedCommands = [],
		setAllowedCommands,
		setDeniedCommands,
		isWaitingForCallback = false,
		waitingForCallbackCommand,
		activeTerminals = [],
	} = useExtensionState()

	const { command, output: parsedOutput } = useMemo(() => parseCommandAndOutput(text), [text])

	// Auto open terminal when running; keep collapsed by default once completed
	const [isExpanded, setIsExpanded] = useState(() => !parsedOutput && !text?.includes(COMMAND_OUTPUT_STRING))
	const [streamingOutput, setStreamingOutput] = useState("")
	const [status, setStatus] = useState<CommandExecutionStatus | null>(null)
	const [interactiveInput, setInteractiveInput] = useState("")
	const [inputSentFeedback, setInputSentFeedback] = useState(false)
	const [showInputManually, setShowInputManually] = useState(false)
	const [copiedCommand, setCopiedCommand] = useState(false)

	const handleSendInput = useCallback(
		(customVal?: string) => {
			const textToSend = customVal !== undefined ? customVal : interactiveInput
			if (!textToSend && customVal === undefined) return
			vscode.postMessage({
				type: "sendTerminalInput",
				terminalId: status?.status === "started" ? status.terminalId : undefined,
				terminalInput: textToSend,
			})
			setInteractiveInput("")
			setInputSentFeedback(true)
			setTimeout(() => setInputSentFeedback(false), 2500)
		},
		[interactiveInput, status],
	)

	// The command's output can either come from the text associated with the
	// task message (this is the case for completed commands) or from the
	// streaming output (this is the case for running commands).
	const output = streamingOutput || parsedOutput

	// Check whether the terminal is currently waiting on an interactive prompt (e.g. y/n, password, confirm)
	const hasInteractivePrompt = useMemo(() => {
		if (status?.status !== "started") return false
		return detectInteractivePrompt(output)
	}, [status?.status, output])

	const shouldShowInteractiveInput =
		status?.status === "started" && (hasInteractivePrompt || showInputManually || isExpanded)

	// Extract command patterns from the actual command that was executed
	const commandPatterns = useMemo<CommandPattern[]>(() => {
		// First get all individual commands (including subshell commands) using parseCommand
		const allCommands = parseCommand(command)

		// Then extract patterns from each command using the existing pattern extraction logic
		const allPatterns = new Set<string>()

		// Add all individual commands first
		allCommands.forEach((cmd) => {
			if (cmd.trim()) {
				allPatterns.add(cmd.trim())
			}
		})

		// Then add extracted patterns for each command
		allCommands.forEach((cmd) => {
			const patterns = extractPatternsFromCommand(cmd)
			patterns.forEach((pattern) => allPatterns.add(pattern))
		})

		return Array.from(allPatterns).map((pattern) => ({
			pattern,
		}))
	}, [command])

	// Handle pattern changes
	const handleAllowPatternChange = (pattern: string) => {
		const isAllowed = allowedCommands.includes(pattern)
		const newAllowed = isAllowed ? allowedCommands.filter((p) => p !== pattern) : [...allowedCommands, pattern]
		const newDenied = deniedCommands.filter((p) => p !== pattern)

		setAllowedCommands(newAllowed)
		setDeniedCommands(newDenied)

		vscode.postMessage({
			type: "updateSettings",
			updatedSettings: { allowedCommands: newAllowed, deniedCommands: newDenied },
		})
	}

	const handleDenyPatternChange = (pattern: string) => {
		const isDenied = deniedCommands.includes(pattern)
		const newDenied = isDenied ? deniedCommands.filter((p) => p !== pattern) : [...deniedCommands, pattern]
		const newAllowed = allowedCommands.filter((p) => p !== pattern)

		setAllowedCommands(newAllowed)
		setDeniedCommands(newDenied)

		vscode.postMessage({
			type: "updateSettings",
			updatedSettings: { allowedCommands: newAllowed, deniedCommands: newDenied },
		})
	}

	const onMessage = useCallback(
		(event: MessageEvent) => {
			const message: ExtensionMessage = event.data

			if (message.type === "commandExecutionStatus") {
				const result = commandExecutionStatusSchema.safeParse(safeJsonParse(message.text, {}))

				if (result.success) {
					const data = result.data

					if (data.executionId !== executionId) {
						return
					}

					switch (data.status) {
						case "started":
							setStatus(data)
							setIsExpanded(true)
							break
						case "output":
							setStreamingOutput(data.output)
							setIsExpanded(true)
							break
						case "fallback":
							setIsExpanded(true)
							break
						default:
							setStatus(data)
							break
					}
				}
			}
		},
		[executionId],
	)

	useEvent("message", onMessage)

	const isRunning = status?.status === "started"
	const isSuccess = status?.status === "exited" && status.exitCode === 0
	const isFailed = status?.status === "exited" && status.exitCode !== 0

	// Check whether this command is currently waiting for a background callback
	const isWaiting = useMemo(() => {
		if (status?.status === "exited") {
			return false
		}

		// 1. Output string specifically announces background continuation
		const hasBackgroundText =
			output.includes("Command is running in background") ||
			output.includes("waiting for callback") ||
			output.includes("has moved to the background")

		// 2. Global extension state says we are waiting for callback
		if (isWaitingForCallback) {
			if (!waitingForCallbackCommand) return true
			const waitCmd = waitingForCallbackCommand.trim()
			const currentCmd = command.trim()
			if (waitCmd === currentCmd || currentCmd.includes(waitCmd) || waitCmd.includes(currentCmd)) {
				return true
			}
		}

		// 3. Command has background text and hasn't exited
		if (hasBackgroundText) {
			return true
		}

		// 4. Command is registered in activeTerminals
		if (
			activeTerminals.some((t) => {
				const termCmd = t.command?.trim()
				return termCmd && (termCmd === command.trim() || command.trim().includes(termCmd))
			})
		) {
			return true
		}

		return false
	}, [status?.status, output, isWaitingForCallback, waitingForCallbackCommand, command, activeTerminals])

	return (
		<div className="my-1.5 select-none">
			{(title || icon || isWaiting) && (
				<div className="flex items-center gap-1.5 text-xs text-vscode-descriptionForeground mb-1">
					{isWaiting && !title ? (
						<>
							<ProgressIndicator />
							<span className="font-semibold text-xs text-vscode-foreground">Waiting...</span>
						</>
					) : (
						<>
							{icon}
							{title}
						</>
					)}
				</div>
			)}
			<div
				className="flex items-center justify-between gap-2 py-1 px-1.5 rounded-md hover:bg-vscode-list-hoverBackground/40 cursor-pointer select-none group transition-colors text-xs"
				onClick={() => setIsExpanded(!isExpanded)}>
				<div className="flex items-center gap-2 min-w-0 flex-1">
					{!isRunning && !isWaiting && (
						<span className="text-vscode-descriptionForeground/70 text-[11px] shrink-0 font-normal">
							{isFailed ? "Failed" : "Ran"}
						</span>
					)}
					<code
						data-testid="code-block"
						className="font-mono text-[11.5px] text-vscode-foreground font-medium no-code-bg bg-transparent px-0 py-0 truncate flex-1 min-w-0"
						title={command}>
						{command}
					</code>
				</div>
				<div className="flex items-center gap-1.5 shrink-0">
					{isSuccess && <span className="text-emerald-400 text-xs font-semibold shrink-0">✓</span>}
					{isFailed && (
						<span className="text-red-400 text-[10px] font-medium shrink-0">✗ ({status.exitCode})</span>
					)}
					{(isRunning || isWaiting) && (
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation()
								vscode.postMessage({ type: "terminalOperation", terminalOperation: "abort" })
							}}
							className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/20 cursor-pointer transition-colors"
							title="Abort command">
							<OctagonX className="size-2.5" />
							<span>Abort</span>
						</button>
					)}
					<ChevronDown
						className={cn(
							"size-3.5 text-vscode-descriptionForeground/70 transition-transform duration-150 shrink-0",
							isExpanded ? "rotate-0" : "-rotate-90",
						)}
					/>
				</div>
			</div>

			<div
				className={cn(
					"ml-2 pl-2 border-l border-vscode-panel-border/20 flex flex-col gap-1.5 overflow-hidden transition-all duration-150",
					{
						"max-h-0 opacity-0 pointer-events-none": !isExpanded,
						"max-h-[380px] opacity-100 my-1": isExpanded,
					},
				)}>
				<div className="rounded-lg bg-[#141416] border border-white/5 overflow-hidden shadow-inner text-[#d4d4d8]">
					<div className="text-xs bg-white/[0.03] px-2.5 py-1.5 border-b border-white/5 font-mono flex items-start justify-between gap-2 select-none">
						<div className="flex items-start gap-1.5 min-w-0 flex-1 max-h-[64px] overflow-y-auto pr-1">
							<span className="text-emerald-400/80 font-bold select-none shrink-0 font-mono text-[11px]">
								~ $
							</span>
							<span className="text-zinc-200 font-medium whitespace-pre-wrap break-all select-text font-mono leading-relaxed text-[11px]">
								{command}
							</span>
						</div>
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation()
								navigator.clipboard.writeText(command)
								setCopiedCommand(true)
								setTimeout(() => setCopiedCommand(false), 2000)
							}}
							className="text-zinc-400 hover:text-zinc-100 p-0.5 rounded hover:bg-white/10 shrink-0 transition-colors cursor-pointer"
							title="Copy command">
							{copiedCommand ? (
								<Check className="size-3 text-emerald-400" />
							) : (
								<Copy className="size-3" />
							)}
						</button>
					</div>
					<div className="p-2 font-mono text-xs max-h-[180px] overflow-y-auto">
						{output.length > 0 ? (
							<TerminalOutput content={output} />
						) : (
							<div className="py-0.5 text-zinc-500 italic text-[11px]">
								{isWaiting
									? "Executing in background..."
									: isRunning
										? "Running command..."
										: isSuccess
											? "Command completed with no output (exit code 0)"
											: isFailed
												? `Command exited with code ${status?.exitCode}`
												: "(No output produced)"}
							</div>
						)}
					</div>
				</div>
				{command && command.trim() && (
					<CommandPatternSelector
						patterns={commandPatterns}
						allowedCommands={allowedCommands}
						deniedCommands={deniedCommands}
						onAllowPatternChange={handleAllowPatternChange}
						onDenyPatternChange={handleDenyPatternChange}
					/>
				)}
			</div>

			{shouldShowInteractiveInput && (
				<div className="ml-2 mt-1.5 flex items-center gap-1.5 p-1.5 rounded-lg bg-[#141416] border border-white/5">
					<span className="size-1.5 rounded-full bg-vscode-focusBorder animate-pulse shrink-0 ml-0.5" />
					<button
						type="button"
						onClick={() => handleSendInput("y")}
						className="h-5 px-2 rounded text-[11px] font-mono font-medium bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white cursor-pointer transition-colors border border-white/5">
						y
					</button>
					<button
						type="button"
						onClick={() => handleSendInput("n")}
						className="h-5 px-2 rounded text-[11px] font-mono font-medium bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white cursor-pointer transition-colors border border-white/5">
						n
					</button>
					<input
						type="text"
						value={interactiveInput}
						onChange={(e) => setInteractiveInput(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") handleSendInput()
						}}
						placeholder="Terminal response..."
						className="h-5 px-2 text-xs rounded bg-white/5 text-zinc-100 placeholder:text-zinc-500 border border-white/10 outline-none flex-1 min-w-0 font-mono focus:border-white/20"
					/>
					<button
						type="button"
						onClick={() => handleSendInput()}
						className={cn(
							"h-5 px-2.5 text-[11px] rounded font-medium cursor-pointer transition-colors",
							inputSentFeedback
								? "bg-emerald-600 text-white"
								: "bg-vscode-button-background hover:bg-vscode-button-hoverBackground text-vscode-button-foreground",
						)}>
						{inputSentFeedback ? "Sent ✓" : "Send"}
					</button>
				</div>
			)}
		</div>
	)
}

CommandExecution.displayName = "CommandExecution"

const OutputContainerInternal = ({ isExpanded, output }: { isExpanded: boolean; output: string }) => (
	<div
		className={cn("overflow-hidden", {
			"max-h-0": !isExpanded,
			"max-h-[100%] mt-1 pt-1 border-t border-border/25": isExpanded,
		})}>
		{output.length > 0 && <TerminalOutput content={output} />}
	</div>
)

const OutputContainer = memo(OutputContainerInternal)

export const parseCommandAndOutput = (text: string | undefined) => {
	if (!text) {
		return { command: "", output: "" }
	}

	const index = text.indexOf(COMMAND_OUTPUT_STRING)

	if (index === -1) {
		return { command: text, output: "" }
	}

	return {
		command: text.slice(0, index),
		output: text.slice(index + COMMAND_OUTPUT_STRING.length),
	}
}

import { useCallback, useState, memo, useMemo } from "react"
import { useEvent } from "react-use"
import { t } from "i18next"
import { ChevronDown, OctagonX, Check, Terminal as TerminalIcon } from "lucide-react"

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

// Heuristic pattern to detect interactive prompts waiting for user input
export const INTERACTIVE_PROMPT_REGEX =
	/(?:\[[yYnN]\/[yYnN]\]|\([yYnN]\/[yYnN]\)|\b(?:password|passphrase|username):\s*$|\b(?:confirm|continue\?|proceed\?|are you sure\?)\s*$|\[\s*(?:yes|no)\s*\]|\?\s*\[[^\]]+\]|\(yes\/no\)\s*\??\s*$|Press\s+\[?Enter\]?\s+to\s+continue|Do you want to continue\?|\(Y\/n\)|\(y\/N\))/i

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
	} = useExtensionState()

	const { command, output: parsedOutput } = useMemo(() => parseCommandAndOutput(text), [text])

	// Default command execution output blocks to collapsed (closed) by default
	const [isExpanded, setIsExpanded] = useState(false)
	const [streamingOutput, setStreamingOutput] = useState("")
	const [status, setStatus] = useState<CommandExecutionStatus | null>(null)
	const [interactiveInput, setInteractiveInput] = useState("")
	const [inputSentFeedback, setInputSentFeedback] = useState(false)
	const [showInputManually, setShowInputManually] = useState(false)

	const handleSendInput = useCallback(
		(customVal?: string) => {
			const textToSend = customVal !== undefined ? customVal : interactiveInput
			vscode.postMessage({
				type: "sendTerminalInput",
				terminalInput: textToSend,
			})
			setInteractiveInput("")
			setInputSentFeedback(true)
			setTimeout(() => setInputSentFeedback(false), 2500)
		},
		[interactiveInput],
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

	const shouldShowInteractiveInput = status?.status === "started" && (hasInteractivePrompt || showInputManually)

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
							break
						case "output":
							setStreamingOutput(data.output)
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

	return (
		<>
			<div
				className="flex flex-row items-center justify-between gap-2 mb-1 cursor-pointer select-none"
				onClick={() => setIsExpanded(!isExpanded)}>
				<div className="flex flex-row items-center gap-2">
					{icon}
					{title}
					{status?.status === "exited" && (
						<div className="flex flex-row items-center gap-2 font-mono text-xs">
							<StandardTooltip
								content={t("chat.commandExecution.exitStatus", { exitStatus: status.exitCode })}>
								<div
									className={cn(
										"rounded-full size-2",
										status.exitCode === 0 ? "bg-green-600" : "bg-red-600",
									)}
								/>
							</StandardTooltip>
						</div>
					)}
				</div>
				<div className=" flex flex-row items-center justify-between gap-2 px-1">
					<div className="flex flex-row items-center gap-1">
						{status?.status === "started" && (
							<div className="flex flex-row items-center gap-2 font-mono text-xs">
								{status.pid && (
									<div className="whitespace-nowrap text-vscode-descriptionForeground">
										(PID: {status.pid})
									</div>
								)}
								<StandardTooltip
									content={showInputManually ? "Hide terminal input" : "Send terminal input"}>
									<Button
										variant="ghost"
										size="icon"
										className={cn(
											"size-6",
											(hasInteractivePrompt || showInputManually) &&
												"text-amber-400 bg-amber-500/10",
										)}
										onClick={(e) => {
											e.stopPropagation()
											setShowInputManually((prev) => !prev)
										}}>
										<TerminalIcon className="size-3.5" />
									</Button>
								</StandardTooltip>
								<StandardTooltip content={t("chat:commandExecution.abort")}>
									<Button
										variant="ghost"
										size="icon"
										onClick={(e) => {
											e.stopPropagation()
											vscode.postMessage({
												type: "terminalOperation",
												terminalOperation: "abort",
											})
										}}>
										<OctagonX className="size-4" />
									</Button>
								</StandardTooltip>
							</div>
						)}
						{output.length > 0 && (
							<Button
								variant="ghost"
								size="icon"
								onClick={(e) => {
									e.stopPropagation()
									setIsExpanded(!isExpanded)
								}}>
								<ChevronDown
									className={cn(
										"size-4 transition-transform duration-300",
										isExpanded && "rotate-180",
									)}
								/>
							</Button>
						)}
					</div>
				</div>
			</div>

			<div className="bg-vscode-editor-background border border-vscode-border rounded-xs ml-6 mt-2 overflow-hidden">
				<div className="p-2">
					<CodeBlock source={command} language="shell" />
					<OutputContainer isExpanded={isExpanded} output={output} />
				</div>
				{shouldShowInteractiveInput && (
					<div className="px-2.5 py-2 border-t border-vscode-panel-border/30 flex flex-col gap-1.5 bg-vscode-input-background/15 animate-in fade-in duration-200">
						<div className="flex items-center justify-between text-[11px] text-vscode-descriptionForeground">
							<span className="flex items-center gap-1.5 font-medium">
								{hasInteractivePrompt && (
									<span className="size-1.5 rounded-full bg-amber-400 animate-pulse" />
								)}
								Interactive Input (Background Process PID {status?.pid || ""}):
							</span>
							{inputSentFeedback && (
								<span className="text-emerald-400 flex items-center gap-1 text-[11px]">
									<Check className="size-3" /> Sent to process
								</span>
							)}
						</div>
						<div className="flex items-center gap-1.5">
							<div className="flex items-center gap-1 shrink-0">
								<button
									type="button"
									onClick={() => handleSendInput("y")}
									className="h-6 px-2 rounded text-[11px] font-mono bg-vscode-button-secondaryBackground hover:bg-vscode-button-secondaryHoverBackground text-vscode-button-secondaryForeground border border-vscode-panel-border/40 cursor-pointer"
									title="Send 'y' (Yes)">
									y
								</button>
								<button
									type="button"
									onClick={() => handleSendInput("n")}
									className="h-6 px-2 rounded text-[11px] font-mono bg-vscode-button-secondaryBackground hover:bg-vscode-button-secondaryHoverBackground text-vscode-button-secondaryForeground border border-vscode-panel-border/40 cursor-pointer"
									title="Send 'n' (No)">
									n
								</button>
								<button
									type="button"
									onClick={() => handleSendInput("")}
									className="h-6 px-2 rounded text-[11px] font-mono bg-vscode-button-secondaryBackground hover:bg-vscode-button-secondaryHoverBackground text-vscode-button-secondaryForeground border border-vscode-panel-border/40 cursor-pointer"
									title="Send Enter (Return)">
									↵ Enter
								</button>
							</div>
							<div className="flex items-center gap-1 flex-1 min-w-0">
								<input
									type="text"
									value={interactiveInput}
									onChange={(e) => setInteractiveInput(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											handleSendInput()
										}
									}}
									placeholder="Type response to terminal..."
									className="h-6 px-2 text-[11px] rounded bg-vscode-input-background text-vscode-input-foreground border border-vscode-input-border focus:border-vscode-focusBorder outline-none flex-1 min-w-0"
								/>
								<Button
									variant="primary"
									size="sm"
									onClick={() => handleSendInput()}
									className="h-6 px-2.5 text-[11px] flex items-center gap-1 shrink-0 cursor-pointer">
									<span>Send</span>
								</Button>
							</div>
						</div>
					</div>
				)}
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
		</>
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

const parseCommandAndOutput = (text: string | undefined) => {
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

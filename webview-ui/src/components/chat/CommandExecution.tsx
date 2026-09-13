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
	} = useExtensionState()

	const { command, output: parsedOutput } = useMemo(() => parseCommandAndOutput(text), [text])

	// Auto open terminal when running; keep collapsed by default once completed
	const [isExpanded, setIsExpanded] = useState(() => !parsedOutput && !text?.includes(COMMAND_OUTPUT_STRING))
	const [streamingOutput, setStreamingOutput] = useState("")
	const [status, setStatus] = useState<CommandExecutionStatus | null>(null)
	const [interactiveInput, setInteractiveInput] = useState("")
	const [inputSentFeedback, setInputSentFeedback] = useState(false)
	const [showInputManually, setShowInputManually] = useState(false)

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

	return (
		<div className="my-1 select-none">
			{(title || icon) && (
				<div className="flex items-center gap-1.5 text-xs text-vscode-descriptionForeground mb-1">
					{icon}
					{title}
				</div>
			)}
			<div
				className="flex items-center justify-between gap-2 py-1 px-1.5 rounded hover:bg-vscode-list-hoverBackground/30 cursor-pointer select-none group transition-colors text-xs"
				onClick={() => setIsExpanded(!isExpanded)}>
				<div className="flex items-center gap-2 min-w-0 flex-1">
					<TerminalIcon className="size-3.5 text-vscode-descriptionForeground shrink-0" />
					<span className="text-vscode-descriptionForeground/70 text-[11px] shrink-0 font-normal">
						{isRunning ? "Running" : isSuccess ? "Ran command" : isFailed ? "Command failed" : "Terminal"}
					</span>
					<code
						data-testid="code-block"
						className="font-mono text-[11.5px] text-vscode-foreground font-medium truncate no-code-bg bg-transparent px-0 py-0"
						title={command}>
						{command}
					</code>
				</div>
				<div className="flex items-center gap-1.5 shrink-0">
					{isRunning && <span className="size-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />}
					{isSuccess && <span className="text-emerald-400 text-[10px] font-medium shrink-0">✓</span>}
					{isFailed && (
						<span className="text-red-400 text-[10px] font-medium shrink-0">✗ ({status.exitCode})</span>
					)}
					{isRunning && (
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation()
								vscode.postMessage({ type: "terminalOperation", terminalOperation: "abort" })
							}}
							className="text-red-400 hover:text-red-300 p-0.5 rounded hover:bg-vscode-toolbar-hoverBackground cursor-pointer"
							title="Abort command">
							<OctagonX className="size-3" />
						</button>
					)}
					<ChevronDown
						className={cn(
							"size-3 text-vscode-descriptionForeground/70 transition-transform duration-150 shrink-0",
							isExpanded ? "rotate-0" : "-rotate-90",
						)}
					/>
				</div>
			</div>

			<div
				className={cn(
					"ml-3 pl-2.5 border-l border-vscode-panel-border/20 flex flex-col gap-1.5 overflow-hidden transition-all duration-150",
					{
						"max-h-0 opacity-0 pointer-events-none": !isExpanded,
						"max-h-[600px] opacity-100 my-1": isExpanded,
					},
				)}>
				{output.length > 0 && (
					<div className="rounded bg-vscode-terminal-background border border-vscode-panel-border/30 p-2 font-mono text-[11px] max-h-[220px] overflow-auto">
						<TerminalOutput content={output} />
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
						value={interactiveInput}
						onChange={(e) => setInteractiveInput(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") handleSendInput()
						}}
						placeholder="Terminal response..."
						className="h-5 px-1.5 text-[10px] rounded bg-vscode-input-background text-vscode-input-foreground border border-vscode-input-border outline-none flex-1 min-w-0"
					/>
					<button
						type="button"
						onClick={() => handleSendInput()}
						className={cn(
							"h-5 px-2 text-[10px] rounded text-vscode-button-foreground cursor-pointer transition-colors",
							inputSentFeedback
								? "bg-emerald-600 text-white font-medium"
								: "bg-vscode-button-background hover:bg-vscode-button-hoverBackground",
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

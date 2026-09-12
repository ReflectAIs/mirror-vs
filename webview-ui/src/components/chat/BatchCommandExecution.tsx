import React, { memo, useCallback, useMemo, useState } from "react"
import { ChevronDown, OctagonX, Terminal as TerminalIcon } from "lucide-react"
import { useEvent } from "react-use"

import { type ExtensionMessage, type CommandExecutionStatus, commandExecutionStatusSchema } from "@mirror-vs/types"
import { safeJsonParse } from "@shared/core"
import { cn } from "@src/lib/utils"
import { vscode } from "@src/utils/vscode"

import { ToolDisclosure } from "./ToolDisclosure"
import { TerminalOutput } from "./TerminalOutput"
import { detectInteractivePrompt, parseCommandAndOutput } from "./CommandExecution"

export interface BatchCommandData {
	executionId: string
	command: string
	output: string
	text?: string
	isAnswered?: boolean
	ts: number
	key?: string
}

interface BatchCommandItemRowProps {
	item: BatchCommandData
	isLast?: boolean
}

const BatchCommandItemRow = memo(({ item, isLast }: BatchCommandItemRowProps) => {
	const { command: initialCommand, output: initialOutput } = useMemo(
		() => parseCommandAndOutput(item.text),
		[item.text],
	)

	const command = initialCommand || item.command
	const executionId = item.executionId

	const [isExpanded, setIsExpanded] = useState(() => !initialOutput && !item.isAnswered)
	const [streamingOutput, setStreamingOutput] = useState("")
	const [status, setStatus] = useState<CommandExecutionStatus | null>(null)
	const [interactiveInput, setInteractiveInput] = useState("")

	const output = streamingOutput || initialOutput || item.output || ""

	const handleSendInput = useCallback(
		(customVal?: string) => {
			const textToSend = customVal !== undefined ? customVal : interactiveInput
			vscode.postMessage({
				type: "sendTerminalInput",
				terminalInput: textToSend,
			})
			setInteractiveInput("")
		},
		[interactiveInput],
	)

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
	const isSuccess = (status?.status === "exited" && status.exitCode === 0) || (!status && item.isAnswered)
	const isFailed = status?.status === "exited" && status.exitCode !== 0
	const hasInteractivePrompt = isRunning && detectInteractivePrompt(output)

	const hasOutput = output.trim().length > 0

	return (
		<div className="flex flex-col min-w-0 max-w-full">
			<div
				onClick={() => hasOutput && setIsExpanded(!isExpanded)}
				className={cn(
					"flex items-center justify-between gap-2 py-0.5 px-1.5 rounded hover:bg-vscode-list-hoverBackground/30 select-none group transition-colors text-xs min-w-0 max-w-full",
					hasOutput ? "cursor-pointer" : "cursor-default",
				)}>
				<div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
					<TerminalIcon className="size-3.5 text-vscode-descriptionForeground shrink-0" />
					<code
						className="font-mono text-[11.5px] text-vscode-foreground font-medium truncate no-code-bg bg-transparent px-0 py-0 flex-1 min-w-0"
						title={command}>
						{command}
					</code>
				</div>
				<div className="flex items-center gap-1.5 shrink-0">
					{isRunning && <span className="size-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />}
					{isSuccess && <span className="text-emerald-400 text-[10px] font-medium shrink-0">✓</span>}
					{isFailed && (
						<span className="text-red-400 text-[10px] font-medium shrink-0">✗ ({status?.exitCode})</span>
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
					{hasOutput && (
						<ChevronDown
							className={cn(
								"size-3 text-vscode-descriptionForeground/70 transition-transform duration-150 shrink-0",
								isExpanded ? "rotate-0" : "-rotate-90",
							)}
						/>
					)}
				</div>
			</div>

			{isExpanded && hasOutput && (
				<div className="ml-5 my-1 pl-2 border-l border-vscode-panel-border/30 min-w-0 max-w-full">
					<div className="rounded bg-vscode-terminal-background border border-vscode-panel-border/30 p-2 font-mono text-[11px] max-h-[200px] overflow-auto min-w-0 max-w-full">
						<TerminalOutput content={output} />
					</div>
				</div>
			)}

			{hasInteractivePrompt && (
				<div className="ml-5 my-1 pl-2 border-l border-vscode-panel-border/30 flex items-center gap-1.5 min-w-0">
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
						className="h-5 px-2 text-[10px] rounded bg-vscode-button-background text-vscode-button-foreground cursor-pointer">
						Send
					</button>
				</div>
			)}
		</div>
	)
})

BatchCommandItemRow.displayName = "BatchCommandItemRow"

interface BatchCommandExecutionProps {
	batchCommands: BatchCommandData[]
	isLast?: boolean
}

export const BatchCommandExecution = memo(({ batchCommands, isLast }: BatchCommandExecutionProps) => {
	const count = batchCommands.length
	const allAnswered = batchCommands.every((c) => c.isAnswered)
	const isRunning = isLast && !allAnswered

	return (
		<ToolDisclosure
			title={
				isRunning
					? `Running ${count} terminal commands`
					: `Ran ${count} terminal ${count === 1 ? "command" : "commands"}`
			}
			defaultExpanded={isRunning}
			status={
				isRunning ? (
					<span className="size-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
				) : allAnswered ? (
					<span className="text-emerald-400">✓ Done</span>
				) : null
			}>
			<div className="flex flex-col gap-0.5 min-w-0 max-w-full">
				{batchCommands.map((item, idx) => (
					<BatchCommandItemRow
						key={item.key || `${item.executionId}-${idx}`}
						item={item}
						isLast={isLast && idx === count - 1}
					/>
				))}
			</div>
		</ToolDisclosure>
	)
})

BatchCommandExecution.displayName = "BatchCommandExecution"

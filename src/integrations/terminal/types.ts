import EventEmitter from "events"

export type MirrorTerminalProvider = "vscode" | "execa"

export interface MirrorTerminal {
	provider: MirrorTerminalProvider
	id: number
	busy: boolean
	running: boolean
	taskId?: string
	process?: MirrorTerminalProcess
	getCurrentWorkingDirectory(): string
	isClosed: () => boolean
	runCommand: (command: string, callbacks: MirrorTerminalCallbacks) => MirrorTerminalProcessResultPromise
	setActiveStream(stream: AsyncIterable<string> | undefined, pid?: number): void
	shellExecutionComplete(exitDetails: ExitCodeDetails): void
	getProcessesWithOutput(): MirrorTerminalProcess[]
	getUnretrievedOutput(): string
	getLastCommand(): string
	cleanCompletedProcessQueue(): void
}

export interface MirrorTerminalCallbacks {
	onLine: (line: string, process: MirrorTerminalProcess) => void
	onCompleted: (output: string | undefined, process: MirrorTerminalProcess) => void | Promise<void>
	onShellExecutionStarted: (pid: number | undefined, process: MirrorTerminalProcess) => void
	onShellExecutionComplete: (details: ExitCodeDetails, process: MirrorTerminalProcess) => void
	onNoShellIntegration?: (message: string, process: MirrorTerminalProcess) => void
}

export interface MirrorTerminalProcess extends EventEmitter<MirrorTerminalProcessEvents> {
	command: string
	isHot: boolean
	run: (command: string) => Promise<void>
	continue: () => void
	abort: () => void
	hasUnretrievedOutput: () => boolean
	getUnretrievedOutput: () => string
	trimRetrievedOutput: () => void
}

export type MirrorTerminalProcessResultPromise = MirrorTerminalProcess & Promise<void>

export interface MirrorTerminalProcessEvents {
	line: [line: string]
	continue: []
	completed: [output?: string]
	stream_available: [stream: AsyncIterable<string>]
	shell_execution_started: [pid: number | undefined]
	shell_execution_complete: [exitDetails: ExitCodeDetails]
	error: [error: Error]
	no_shell_integration: [message: string]
}

export interface ExitCodeDetails {
	exitCode: number | undefined
	signal?: number | undefined
	signalName?: string
	coreDumpPossible?: boolean
}

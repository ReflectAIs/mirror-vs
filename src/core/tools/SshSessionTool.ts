import * as path from "path"

import { DEFAULT_TERMINAL_OUTPUT_PREVIEW_SIZE } from "@mirror-vs/types"

import { BaseTool, ToolCallbacks } from "./BaseTool"
import { Task } from "../task/Task"
import { SshSessionRegistry } from "./helpers/SshSessionRegistry"
import { formatResponse } from "../prompts/responses"
import { BaseTerminalProcess } from "../../integrations/terminal/BaseTerminalProcess"
import { OutputInterceptor } from "../../integrations/terminal/OutputInterceptor"
import { getTaskDirectoryPath } from "../../utils/storage"
import type { ToolResponse, ToolUse } from "../../shared/tools"

interface SshSessionParams {
	action: "connect" | "execute" | "disconnect"
	host: string
	port?: number
	password?: string
	command?: string
	timeout?: number
}

export class SshTerminalProcess extends BaseTerminalProcess {
	private aborted = false

	constructor(
		command: string,
		private onAbort: () => void,
	) {
		super()
		this.command = command
	}

	public async run(): Promise<void> {
		// Managed externally by the tool execution
	}

	public continue(): void {
		// No-op for SSH
	}

	public abort(): void {
		if (this.aborted) return
		this.aborted = true
		this.onAbort()
	}

	public hasUnretrievedOutput(): boolean {
		return false
	}

	public getUnretrievedOutput(): string {
		return ""
	}
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes}B`
	}
	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(1)}KB`
	}
	return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

export class SshSessionTool extends BaseTool<"ssh_session"> {
	readonly name = "ssh_session" as const

	async execute(params: SshSessionParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { action, host, port = 22, password, command, timeout } = params
		const { handleError, pushToolResult, askApproval } = callbacks

		try {
			if (!host) {
				task.consecutiveMistakeCount++
				task.recordToolError("ssh_session")
				pushToolResult(await task.sayAndCreateMissingParamError("ssh_session", "host"))
				return
			}

			if (action === "execute" && !command) {
				task.consecutiveMistakeCount++
				task.recordToolError("ssh_session")
				pushToolResult(await task.sayAndCreateMissingParamError("ssh_session", "command"))
				return
			}

			// Request approval for command execution or connection
			const approvalTarget =
				action === "execute"
					? `Execute on SSH [${host}:${port}]: ${command}`
					: `${action === "connect" ? "Connect" : "Disconnect"} SSH [${host}:${port}]`

			const didApprove = await askApproval("command", approvalTarget)
			if (!didApprove) {
				return
			}

			if (action === "connect") {
				task.consecutiveMistakeCount = 0
				await SshSessionRegistry.getOrCreateSession(host, port, password)
				pushToolResult(
					formatResponse.toolResult(
						`Successfully connected and established persistent SSH session with ${host}:${port}`,
					),
				)
			} else if (action === "execute") {
				task.consecutiveMistakeCount = 0
				const session = await SshSessionRegistry.getOrCreateSession(host, port, password)

				const timeoutVal = timeout || 180000
				const executionId = task.lastMessageTs?.toString() ?? Date.now().toString()

				// Create OutputInterceptor for truncating long SSH output
				const provider = await task.providerRef.deref()
				const globalStoragePath = provider?.context?.globalStorageUri?.fsPath
				let interceptor: OutputInterceptor | undefined

				if (globalStoragePath) {
					const taskDir = await getTaskDirectoryPath(globalStoragePath, task.taskId)
					const storageDir = path.join(taskDir, "command-output")
					const providerState = await provider?.getState()
					const terminalOutputPreviewSize =
						providerState?.terminalOutputPreviewSize ?? DEFAULT_TERMINAL_OUTPUT_PREVIEW_SIZE

					interceptor = new OutputInterceptor({
						executionId,
						taskId: task.taskId,
						command: command!,
						storageDir,
						previewSize: terminalOutputPreviewSize,
					})
				}

				let accumulated = ""
				let persistedResult: Awaited<ReturnType<OutputInterceptor["finalize"]>> | undefined

				let triggerAbort: (() => void) | undefined
				const sshProcess = new SshTerminalProcess(command!, () => {
					if (triggerAbort) triggerAbort()
				})

				// Register the process on the task to activate the UI Stop/Cancel button
				task.terminalProcess = sshProcess

				const outputPromise = session.executeCommand(command!, timeoutVal, async (chunk) => {
					// Feed into interceptor for truncation tracking
					interceptor?.write(chunk)
					accumulated += chunk
					await task
						.say("command_output", accumulated, undefined, true, undefined, undefined, {
							isNonInteractive: true,
						})
						.catch(() => {})
				})

				const abortPromise = new Promise<string>((resolve) => {
					triggerAbort = () => {
						session.abort()
						resolve(accumulated.trim() + "\n[Command execution aborted by user]")
					}
				})

				// Race execution against manual user abortion
				const output = await Promise.race([outputPromise, abortPromise])

				// Clean up process association
				if (task.terminalProcess === sshProcess) {
					task.terminalProcess = undefined
				}

				// Finalize interceptor to determine if output was truncated
				if (interceptor) {
					persistedResult = await interceptor.finalize()
				}

				// Build display output and tool response
				let displayOutput: string
				let toolResponse: ToolResponse

				if (persistedResult?.truncated) {
					// Output was large — show only preview with artifact_id
					displayOutput = persistedResult.preview
					const artifactId = persistedResult.artifactPath ? path.basename(persistedResult.artifactPath) : ""
					const sizeStr = formatBytes(persistedResult.totalBytes)
					toolResponse = [
						`Command executed on SSH [${host}:${port}].`,
						"",
						`Output (${sizeStr}) persisted. Artifact ID: ${artifactId}`,
						"",
						"Preview (last portion):",
						persistedResult.preview,
						"",
						"Use read_command_output tool to view full output if needed.",
					].join("\n")
				} else {
					// Output is small enough — show inline as before
					displayOutput = output
					toolResponse = formatResponse.toolResult(output)
				}

				// Send final non-partial output to complete the terminal block in UI
				await task
					.say("command_output", displayOutput, undefined, false, undefined, undefined, {
						isNonInteractive: true,
					})
					.catch(() => {})

				pushToolResult(toolResponse)
			} else if (action === "disconnect") {
				task.consecutiveMistakeCount = 0
				SshSessionRegistry.removeSession(host, port)
				pushToolResult(formatResponse.toolResult(`Disconnected persistent SSH session with ${host}:${port}`))
			}
		} catch (error) {
			await handleError("executing SSH command", error as Error)
		}
	}
}

export const sshSessionTool = new SshSessionTool()

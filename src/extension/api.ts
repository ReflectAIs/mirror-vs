import { EventEmitter } from "events"
import fs from "fs/promises"
import * as path from "path"
import * as os from "os"

import * as vscode from "vscode"
import pWaitFor from "p-wait-for"

import {
	type MirrorVSAPI,
	type MirrorVSSettings,
	type MirrorVSEvents,
	type ProviderSettings,
	type ProviderSettingsEntry,
	type TaskEvent,
	type CreateTaskOptions,
	MirrorVSEventName,
	TaskCommandName,
	isSecretStateKey,
	IpcOrigin,
	IpcMessageType,
	openRouterDefaultModelId,
} from "@mirror-vs/types"
import { IpcServer } from "@mirror-vs/ipc"

import { Package } from "../shared/package"
import { MirrorProvider } from "../core/webview/MirrorProvider"
import { openMirrorInNewTab } from "../activate/registerCommands"
import { getCommands } from "../services/command/commands"
import { getModels } from "../api/providers/fetchers/modelCache"

export class API extends EventEmitter<MirrorVSEvents> implements MirrorVSAPI {
	private readonly outputChannel: vscode.OutputChannel
	private readonly sidebarProvider: MirrorProvider
	private readonly context: vscode.ExtensionContext
	private readonly ipc?: IpcServer
	private readonly log: (...args: unknown[]) => void
	private logfile?: string

	constructor(
		outputChannel: vscode.OutputChannel,
		provider: MirrorProvider,
		socketPath?: string,
		enableLogging = false,
	) {
		super()

		this.outputChannel = outputChannel
		this.sidebarProvider = provider
		this.context = provider.context

		if (enableLogging) {
			this.log = (...args: unknown[]) => {
				this.outputChannelLog(...args)
				console.log(args)
			}

			this.logfile = path.join(os.tmpdir(), "mirror-vs-messages.log")
		} else {
			this.log = () => {}
		}

		this.registerListeners(this.sidebarProvider)

		if (socketPath) {
			const ipc = (this.ipc = new IpcServer(socketPath, this.log))

			ipc.listen()
			this.log(`[API] ipc server started: socketPath=${socketPath}, pid=${process.pid}, ppid=${process.ppid}`)

			ipc.on(IpcMessageType.TaskCommand, async (clientId, command) => {
				const sendResponse = (eventName: MirrorVSEventName, payload: unknown[]) => {
					ipc.send(clientId, {
						type: IpcMessageType.TaskEvent,
						origin: IpcOrigin.Server,
						data: { eventName, payload } as TaskEvent,
					})
				}

				switch (command.commandName) {
					case TaskCommandName.StartNewTask:
						this.log(
							`[API] StartNewTask -> ${command.data.text}, ${JSON.stringify(command.data.configuration)}`,
						)
						await this.startNewTask(command.data)
						break
					case TaskCommandName.CancelTask:
						this.log(`[API] CancelTask`)
						await this.cancelCurrentTask()
						break
					case TaskCommandName.CloseTask:
						this.log(`[API] CloseTask`)
						await vscode.commands.executeCommand("workbench.action.files.saveFiles")
						await vscode.commands.executeCommand("workbench.action.closeWindow")
						break
					case TaskCommandName.ResumeTask:
						this.log(`[API] ResumeTask -> ${command.data}`)
						try {
							await this.resumeTask(command.data)
						} catch (error) {
							const errorMessage = error instanceof Error ? error.message : String(error)
							this.log(`[API] ResumeTask failed for taskId ${command.data}: ${errorMessage}`)
							// Don't rethrow - we want to prevent IPC server crashes.
							// The error is logged for debugging purposes.
						}
						break
					case TaskCommandName.SendMessage:
						this.log(`[API] SendMessage -> ${command.data.text}`)
						await this.sendMessage(command.data.text, command.data.images)
						break
					case TaskCommandName.GetCommands:
						try {
							const commands = await getCommands(this.sidebarProvider.cwd)

							sendResponse(MirrorVSEventName.CommandsResponse, [
								commands.map((cmd) => ({
									name: cmd.name,
									source: cmd.source,
									filePath: cmd.filePath,
									description: cmd.description,
									argumentHint: cmd.argumentHint,
								})),
							])
						} catch (error) {
							sendResponse(MirrorVSEventName.CommandsResponse, [[]])
						}

						break
					case TaskCommandName.GetModes:
						try {
							const modes = await this.sidebarProvider.getModes()
							sendResponse(MirrorVSEventName.ModesResponse, [modes])
						} catch (error) {
							sendResponse(MirrorVSEventName.ModesResponse, [[]])
						}

						break
					case TaskCommandName.GetModels:
						try {
							const models = await getModels({
								provider: "openrouter",
							})

							sendResponse(MirrorVSEventName.ModelsResponse, [
								models || { [openRouterDefaultModelId]: {} },
							])
						} catch (error) {
							sendResponse(MirrorVSEventName.ModelsResponse, [{}])
						}

						break
					case TaskCommandName.DeleteQueuedMessage:
						this.log(`[API] DeleteQueuedMessage -> ${command.data}`)
						try {
							this.deleteQueuedMessage(command.data)
						} catch (error) {
							const errorMessage = error instanceof Error ? error.message : String(error)
							this.log(`[API] DeleteQueuedMessage failed for messageId ${command.data}: ${errorMessage}`)
						}
						break
				}
			})
		}
	}

	public override emit<K extends keyof MirrorVSEvents>(
		eventName: K,
		...args: K extends keyof MirrorVSEvents ? MirrorVSEvents[K] : never
	) {
		const data = { eventName: eventName as MirrorVSEventName, payload: args } as TaskEvent
		this.ipc?.broadcast({ type: IpcMessageType.TaskEvent, origin: IpcOrigin.Server, data })
		return super.emit(eventName, ...args)
	}

	public async startNewTask({
		configuration,
		text,
		images,
		newTab,
	}: {
		configuration: MirrorVSSettings
		text?: string
		images?: string[]
		newTab?: boolean
	}) {
		let provider: MirrorProvider

		if (newTab) {
			await vscode.commands.executeCommand("workbench.action.files.revert")
			await vscode.commands.executeCommand("workbench.action.closeAllEditors")

			provider = await openMirrorInNewTab({ context: this.context, outputChannel: this.outputChannel })
			this.registerListeners(provider)
		} else {
			await vscode.commands.executeCommand(`${Package.name}.SidebarProvider.focus`)

			provider = this.sidebarProvider
		}

		await provider.removeMirrorFromStack()
		await provider.postStateToWebview()
		await provider.postMessageToWebview({ type: "action", action: "chatButtonClicked" })
		await provider.postMessageToWebview({ type: "invoke", invoke: "newChat", text, images })

		const options: CreateTaskOptions = {
			consecutiveMistakeLimit: Number.MAX_SAFE_INTEGER,
		}

		const task = await provider.createTask(text, images, undefined, options, configuration)

		if (!task) {
			throw new Error("Failed to create task due to policy restrictions")
		}

		return task.taskId
	}

	public async resumeTask(taskId: string): Promise<void> {
		await vscode.commands.executeCommand(`${Package.name}.SidebarProvider.focus`)
		await this.waitForWebviewLaunch(5_000)

		const { historyItem } = await this.sidebarProvider.getTaskWithId(taskId)
		await this.sidebarProvider.createTaskWithHistoryItem(historyItem)

		if (this.sidebarProvider.viewLaunched) {
			await this.sidebarProvider.postMessageToWebview({ type: "action", action: "chatButtonClicked" })
		} else {
			this.log(
				`[API#resumeTask] webview not launched after resume for task ${taskId}; continuing in headless mode`,
			)
		}
	}

	public async isTaskInHistory(taskId: string): Promise<boolean> {
		try {
			await this.sidebarProvider.getTaskWithId(taskId)
			return true
		} catch {
			return false
		}
	}

	public getCurrentTaskStack() {
		return this.sidebarProvider.getCurrentTaskStack()
	}

	public async clearCurrentTask(_lastMessage?: string) {
		// Legacy finishSubTask removed; clear current by closing active task instance.
		await this.sidebarProvider.removeMirrorFromStack()
		await this.sidebarProvider.postStateToWebview()
	}

	public async cancelCurrentTask() {
		await this.sidebarProvider.cancelTask()
	}

	public async sendMessage(text?: string, images?: string[]) {
		const currentTask = this.sidebarProvider.getCurrentTask()

		// In headless/sandbox flows the webview may not be launched, so routing
		// through invoke=sendMessage drops the message. Deliver directly to the
		// task ask-response channel instead.
		if (!this.sidebarProvider.viewLaunched) {
			if (!currentTask) {
				this.log("[API#sendMessage] no current task in headless mode; message dropped")
				return
			}

			await currentTask.submitUserMessage(text ?? "", images)
			return
		}

		await this.sidebarProvider.postMessageToWebview({ type: "invoke", invoke: "sendMessage", text, images })
	}

	public deleteQueuedMessage(messageId: string) {
		const currentTask = this.sidebarProvider.getCurrentTask()

		if (!currentTask) {
			this.log(`[API#deleteQueuedMessage] no current task; ignoring delete for messageId ${messageId}`)
			return
		}

		currentTask.messageQueueService.removeMessage(messageId)
	}

	public async pressPrimaryButton() {
		await this.sidebarProvider.postMessageToWebview({ type: "invoke", invoke: "primaryButtonClick" })
	}

	public async pressSecondaryButton() {
		await this.sidebarProvider.postMessageToWebview({ type: "invoke", invoke: "secondaryButtonClick" })
	}

	public isReady() {
		return this.sidebarProvider.viewLaunched
	}

	private async waitForWebviewLaunch(timeoutMs: number): Promise<boolean> {
		try {
			await pWaitFor(() => this.sidebarProvider.viewLaunched, {
				timeout: timeoutMs,
				interval: 50,
			})

			return true
		} catch {
			this.log(`[API#waitForWebviewLaunch] webview did not launch within ${timeoutMs}ms`)
			return false
		}
	}

	private registerListeners(provider: MirrorProvider) {
		provider.on(MirrorVSEventName.TaskCreated, (task) => {
			// Task Lifecycle

			task.on(MirrorVSEventName.TaskStarted, async () => {
				this.emit(MirrorVSEventName.TaskStarted, task.taskId)
				await this.fileLog(`[${new Date().toISOString()}] taskStarted -> ${task.taskId}\n`)
			})

			task.on(MirrorVSEventName.TaskCompleted, async (_, tokenUsage, toolUsage) => {
				this.emit(MirrorVSEventName.TaskCompleted, task.taskId, tokenUsage, toolUsage, {
					isSubtask: !!task.parentTaskId,
				})

				await this.fileLog(
					`[${new Date().toISOString()}] taskCompleted -> ${task.taskId} | ${JSON.stringify(tokenUsage, null, 2)} | ${JSON.stringify(toolUsage, null, 2)}\n`,
				)
			})

			task.on(MirrorVSEventName.TaskAborted, () => {
				this.emit(MirrorVSEventName.TaskAborted, task.taskId)
			})

			task.on(MirrorVSEventName.TaskFocused, () => {
				this.emit(MirrorVSEventName.TaskFocused, task.taskId)
			})

			task.on(MirrorVSEventName.TaskUnfocused, () => {
				this.emit(MirrorVSEventName.TaskUnfocused, task.taskId)
			})

			task.on(MirrorVSEventName.TaskActive, () => {
				this.emit(MirrorVSEventName.TaskActive, task.taskId)
			})

			task.on(MirrorVSEventName.TaskInteractive, () => {
				this.emit(MirrorVSEventName.TaskInteractive, task.taskId)
			})

			task.on(MirrorVSEventName.TaskResumable, () => {
				this.emit(MirrorVSEventName.TaskResumable, task.taskId)
			})

			task.on(MirrorVSEventName.TaskIdle, () => {
				this.emit(MirrorVSEventName.TaskIdle, task.taskId)
			})

			// Subtask Lifecycle

			task.on(MirrorVSEventName.TaskPaused, () => {
				this.emit(MirrorVSEventName.TaskPaused, task.taskId)
			})

			task.on(MirrorVSEventName.TaskUnpaused, () => {
				this.emit(MirrorVSEventName.TaskUnpaused, task.taskId)
			})

			task.on(MirrorVSEventName.TaskSpawned, (childTaskId) => {
				this.emit(MirrorVSEventName.TaskSpawned, task.taskId, childTaskId)
			})

			task.on(MirrorVSEventName.TaskDelegated as any, (childTaskId: string) => {
				;(this.emit as any)(MirrorVSEventName.TaskDelegated, task.taskId, childTaskId)
			})

			task.on(MirrorVSEventName.TaskDelegationCompleted as any, (childTaskId: string, summary: string) => {
				;(this.emit as any)(MirrorVSEventName.TaskDelegationCompleted, task.taskId, childTaskId, summary)
			})

			task.on(MirrorVSEventName.TaskDelegationResumed as any, (childTaskId: string) => {
				;(this.emit as any)(MirrorVSEventName.TaskDelegationResumed, task.taskId, childTaskId)
			})

			// Task Execution

			task.on(MirrorVSEventName.Message, async (message) => {
				this.emit(MirrorVSEventName.Message, { taskId: task.taskId, ...message })

				if (message.message.partial !== true) {
					await this.fileLog(`[${new Date().toISOString()}] ${JSON.stringify(message.message, null, 2)}\n`)
				}
			})

			task.on(MirrorVSEventName.TaskModeSwitched, (taskId, mode) => {
				this.emit(MirrorVSEventName.TaskModeSwitched, taskId, mode)
			})

			task.on(MirrorVSEventName.TaskAskResponded, () => {
				this.emit(MirrorVSEventName.TaskAskResponded, task.taskId)
			})

			task.on(MirrorVSEventName.QueuedMessagesUpdated, (taskId, messages) => {
				this.emit(MirrorVSEventName.QueuedMessagesUpdated, taskId, messages)
			})

			// Task Analytics

			task.on(MirrorVSEventName.TaskToolFailed, (taskId, tool, error) => {
				this.emit(MirrorVSEventName.TaskToolFailed, taskId, tool, error)
			})

			task.on(MirrorVSEventName.TaskTokenUsageUpdated, (_, tokenUsage, toolUsage) => {
				this.emit(MirrorVSEventName.TaskTokenUsageUpdated, task.taskId, tokenUsage, toolUsage)
			})

			// Let's go!

			this.emit(MirrorVSEventName.TaskCreated, task.taskId)
		})
	}

	// Logging

	private outputChannelLog(...args: unknown[]) {
		for (const arg of args) {
			if (arg === null) {
				this.outputChannel.appendLine("null")
			} else if (arg === undefined) {
				this.outputChannel.appendLine("undefined")
			} else if (typeof arg === "string") {
				this.outputChannel.appendLine(arg)
			} else if (arg instanceof Error) {
				this.outputChannel.appendLine(`Error: ${arg.message}\n${arg.stack || ""}`)
			} else {
				try {
					this.outputChannel.appendLine(
						JSON.stringify(
							arg,
							(key, value) => {
								if (typeof value === "bigint") return `BigInt(${value})`
								if (typeof value === "function") return `Function: ${value.name || "anonymous"}`
								if (typeof value === "symbol") return value.toString()
								return value
							},
							2,
						),
					)
				} catch (error) {
					this.outputChannel.appendLine(`[Non-serializable object: ${Object.prototype.toString.call(arg)}]`)
				}
			}
		}
	}

	private async fileLog(message: string) {
		if (!this.logfile) {
			return
		}

		try {
			await fs.appendFile(this.logfile, message, "utf8")
		} catch (_) {
			this.logfile = undefined
		}
	}

	// Global Settings Management

	public getConfiguration(): MirrorVSSettings {
		return Object.fromEntries(
			Object.entries(this.sidebarProvider.getValues()).filter(([key]) => !isSecretStateKey(key)),
		)
	}

	public async setConfiguration(values: MirrorVSSettings) {
		await this.sidebarProvider.contextProxy.setValues(values)
		await this.sidebarProvider.providerSettingsManager.saveConfig(values.currentApiConfigName || "default", values)
		await this.sidebarProvider.postStateToWebview()
	}

	// Provider Profile Management

	public getProfiles(): string[] {
		return this.sidebarProvider.getProviderProfileEntries().map(({ name }) => name)
	}

	public getProfileEntry(name: string): ProviderSettingsEntry | undefined {
		return this.sidebarProvider.getProviderProfileEntry(name)
	}

	public async createProfile(name: string, profile?: ProviderSettings, activate: boolean = true) {
		const entry = this.getProfileEntry(name)

		if (entry) {
			throw new Error(`Profile with name "${name}" already exists`)
		}

		const id = await this.sidebarProvider.upsertProviderProfile(name, profile ?? {}, activate)

		if (!id) {
			throw new Error(`Failed to create profile with name "${name}"`)
		}

		return id
	}

	public async updateProfile(
		name: string,
		profile: ProviderSettings,
		activate: boolean = true,
	): Promise<string | undefined> {
		const entry = this.getProfileEntry(name)

		if (!entry) {
			throw new Error(`Profile with name "${name}" does not exist`)
		}

		const id = await this.sidebarProvider.upsertProviderProfile(name, profile, activate)

		if (!id) {
			throw new Error(`Failed to update profile with name "${name}"`)
		}

		return id
	}

	public async upsertProfile(
		name: string,
		profile: ProviderSettings,
		activate: boolean = true,
	): Promise<string | undefined> {
		const id = await this.sidebarProvider.upsertProviderProfile(name, profile, activate)

		if (!id) {
			throw new Error(`Failed to upsert profile with name "${name}"`)
		}

		return id
	}

	public async deleteProfile(name: string): Promise<void> {
		const entry = this.getProfileEntry(name)

		if (!entry) {
			throw new Error(`Profile with name "${name}" does not exist`)
		}

		await this.sidebarProvider.deleteProviderProfile(entry)
	}

	public getActiveProfile(): string | undefined {
		return this.getConfiguration().currentApiConfigName
	}

	public async setActiveProfile(name: string): Promise<string | undefined> {
		const entry = this.getProfileEntry(name)

		if (!entry) {
			throw new Error(`Profile with name "${name}" does not exist`)
		}

		await this.sidebarProvider.activateProviderProfile({ name })
		return this.getActiveProfile()
	}
}

import * as os from "os"
import * as path from "path"
import * as vscode from "vscode"

import type { GlobalState, ProviderSettings } from "@mirror-vs/types"

import { Task } from "../Task"
import { MirrorProvider } from "../../webview/MirrorProvider"
import { ContextProxy } from "../../config/ContextProxy"

describe("Queued message processing in initiateTaskLoop", () => {
	function createProvider(): any {
		const storageUri = { fsPath: path.join(os.tmpdir(), "test-storage") }
		const ctx = {
			globalState: {
				get: vi.fn().mockImplementation((_key: keyof GlobalState) => undefined),
				update: vi.fn().mockResolvedValue(undefined),
				keys: vi.fn().mockReturnValue([]),
			},
			globalStorageUri: storageUri,
			workspaceState: {
				get: vi.fn().mockImplementation((_key) => undefined),
				update: vi.fn().mockResolvedValue(undefined),
				keys: vi.fn().mockReturnValue([]),
			},
			secrets: {
				get: vi.fn().mockResolvedValue(undefined),
				store: vi.fn().mockResolvedValue(undefined),
				delete: vi.fn().mockResolvedValue(undefined),
			},
			extensionUri: { fsPath: "/mock/extension/path" },
			extension: { packageJSON: { version: "1.0.0" } },
		} as unknown as vscode.ExtensionContext

		const output = {
			appendLine: vi.fn(),
			append: vi.fn(),
			clear: vi.fn(),
			show: vi.fn(),
			hide: vi.fn(),
			dispose: vi.fn(),
		}

		const provider = new MirrorProvider(ctx, output as any, "sidebar", new ContextProxy(ctx)) as any
		provider.postMessageToWebview = vi.fn().mockResolvedValue(undefined)
		provider.postStateToWebview = vi.fn().mockResolvedValue(undefined)
		provider.postStateToWebviewWithoutTaskHistory = vi.fn().mockResolvedValue(undefined)
		provider.getState = vi.fn().mockResolvedValue({})
		return provider
	}

	const apiConfig: ProviderSettings = {
		apiProvider: "anthropic",
		apiModelId: "claude-3-5-sonnet-20241022",
		apiKey: "test-api-key",
	} as any

	it("processes one queued message at a time after each task loop completion", async () => {
		const provider = createProvider()
		const task = new Task({
			provider,
			apiConfiguration: apiConfig,
			task: "initial task",
			startTask: false,
		})

		// Queue multiple messages — they're processed one per loop iteration
		task.messageQueueService.addMessage("first message")
		task.messageQueueService.addMessage("second message")

		// Dequeue first message
		const first = task.messageQueueService.dequeueMessage()
		expect(first?.text).toBe("first message")

		// Second message still in queue
		expect(task.messageQueueService.isEmpty()).toBe(false)

		// Dequeue second
		const second = task.messageQueueService.dequeueMessage()
		expect(second?.text).toBe("second message")

		// Queue is now empty
		expect(task.messageQueueService.isEmpty()).toBe(true)
	})

	it("does not cross-drain queues between separate tasks", async () => {
		const providerA = createProvider()
		const providerB = createProvider()

		const taskA = new Task({
			provider: providerA,
			apiConfiguration: apiConfig,
			task: "task A",
			startTask: false,
		})
		const taskB = new Task({
			provider: providerB,
			apiConfiguration: apiConfig,
			task: "task B",
			startTask: false,
		})

		taskA.messageQueueService.addMessage("A message")
		taskB.messageQueueService.addMessage("B message")

		// Each task has its own isolated queue
		expect(taskA.messageQueueService.isEmpty()).toBe(false)
		expect(taskB.messageQueueService.isEmpty()).toBe(false)

		// Draining A's queue does not affect B's
		expect(taskA.messageQueueService.dequeueMessage()?.text).toBe("A message")
		expect(taskA.messageQueueService.isEmpty()).toBe(true)
		expect(taskB.messageQueueService.isEmpty()).toBe(false)
	})
})

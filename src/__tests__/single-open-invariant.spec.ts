// npx vitest run __tests__/single-open-invariant.spec.ts

import { describe, it, expect, vi, beforeEach } from "vitest"
import { MirrorProvider } from "../core/webview/MirrorProvider"
import { API } from "../extension/api"
import * as ProfileValidatorMod from "../shared/ProfileValidator"

// Mock Task class used by MirrorProvider to avoid heavy startup
vi.mock("../core/task/Task", () => {
	class TaskStub {
		public taskId: string
		public instanceId = "inst"
		public parentTask?: any
		public apiConfiguration: any
		public rootTask?: any
		constructor(opts: any) {
			this.taskId = opts.historyItem?.id ?? `task-${Math.random().toString(36).slice(2, 8)}`
			this.parentTask = opts.parentTask
			this.apiConfiguration = opts.apiConfiguration ?? { apiProvider: "anthropic" }
			opts.onCreated?.(this)
		}
		start() {}
		on() {}
		off() {}
		emit() {}
	}
	return { Task: TaskStub }
})

describe("Single-open-task invariant", () => {
	beforeEach(() => {
		vi.restoreAllMocks()
	})

	it("User-initiated create: closes existing before opening new", async () => {
		// Allow profile
		vi.spyOn(ProfileValidatorMod.ProfileValidator, "isProfileAllowed").mockReturnValue(true)

		const removeMirrorFromStack = vi.fn().mockResolvedValue(undefined)
		const addMirrorToStack = vi.fn().mockResolvedValue(undefined)

		const provider = {
			// Simulate an existing task present in stack
			mirrorStack: [{ taskId: "existing-1" }],
			setValues: vi.fn(),
			getState: vi.fn().mockResolvedValue({
				apiConfiguration: { apiProvider: "anthropic", consecutiveMistakeLimit: 0 },
				organizationAllowList: "*",
				enableCheckpoints: true,
				checkpointTimeout: 60,
				cloudUserInfo: null,
			}),
			removeMirrorFromStack,
			addMirrorToStack,
			setProviderProfile: vi.fn(),
			log: vi.fn(),
			getStateToPostToWebview: vi.fn(),
			providerSettingsManager: { getModeConfigId: vi.fn(), listConfig: vi.fn() },
			customModesManager: { getCustomModes: vi.fn().mockResolvedValue([]) },
			taskCreationCallback: vi.fn(),
			contextProxy: {
				extensionUri: {},
				setValue: vi.fn(),
				getValue: vi.fn(),
				setProviderSettings: vi.fn(),
				getProviderSettings: vi.fn(() => ({})),
			},
		} as unknown as MirrorProvider

		await (MirrorProvider.prototype as any).createTask.call(provider, "New task")

		expect(removeMirrorFromStack).toHaveBeenCalledTimes(1)
		expect(addMirrorToStack).toHaveBeenCalledTimes(1)
	})

	it("History resume path always closes current before rehydration (non-rehydrating case)", async () => {
		const removeMirrorFromStack = vi.fn().mockResolvedValue(undefined)
		const addMirrorToStack = vi.fn().mockResolvedValue(undefined)
		const updateGlobalState = vi.fn().mockResolvedValue(undefined)

		const provider = {
			getCurrentTask: vi.fn(() => undefined), // ensure not rehydrating
			removeMirrorFromStack,
			addMirrorToStack,
			updateGlobalState,
			log: vi.fn(),
			customModesManager: { getCustomModes: vi.fn().mockResolvedValue([]) },
			providerSettingsManager: {
				getModeConfigId: vi.fn().mockResolvedValue(undefined),
				listConfig: vi.fn().mockResolvedValue([]),
			},
			getState: vi.fn().mockResolvedValue({
				apiConfiguration: { apiProvider: "anthropic", consecutiveMistakeLimit: 0 },
				enableCheckpoints: true,
				checkpointTimeout: 60,
				experiments: {},
				cloudUserInfo: null,
				taskSyncEnabled: false,
			}),
			// Methods used by createTaskWithHistoryItem for pending edit cleanup
			getPendingEditOperation: vi.fn().mockReturnValue(undefined),
			clearPendingEditOperation: vi.fn(),
			context: { extension: { packageJSON: {} }, globalStorageUri: { fsPath: "/tmp" } },
			contextProxy: {
				extensionUri: {},
				getValue: vi.fn(),
				setValue: vi.fn(),
				setProviderSettings: vi.fn(),
				getProviderSettings: vi.fn(() => ({})),
			},
			postStateToWebview: vi.fn(),
		} as unknown as MirrorProvider

		const historyItem = {
			id: "hist-1",
			number: 1,
			ts: Date.now(),
			task: "Task",
			tokensIn: 0,
			tokensOut: 0,
			totalCost: 0,
			workspace: "/tmp",
		}

		const task = await (MirrorProvider.prototype as any).createTaskWithHistoryItem.call(provider, historyItem)
		expect(task).toBeTruthy()
		expect(removeMirrorFromStack).toHaveBeenCalledTimes(1)
		expect(addMirrorToStack).toHaveBeenCalledTimes(1)
	})

	it("IPC StartNewTask path closes current before new task", async () => {
		const removeMirrorFromStack = vi.fn().mockResolvedValue(undefined)
		const createTask = vi.fn().mockResolvedValue({ taskId: "ipc-1" })
		const provider = {
			context: {} as any,
			removeMirrorFromStack,
			postStateToWebview: vi.fn(),
			postMessageToWebview: vi.fn(),
			createTask,
			getValues: vi.fn(() => ({})),
			providerSettingsManager: { saveConfig: vi.fn() },
			on: vi.fn((ev: any, cb: any) => {
				if (ev === "taskCreated") {
					// no-op for this test
				}
				return provider
			}),
		} as unknown as MirrorProvider

		const output = { appendLine: vi.fn() } as any
		const api = new API(output, provider, undefined, false)

		const taskId = await api.startNewTask({
			configuration: {},
			text: "hello",
			images: undefined,
			newTab: false,
		})

		expect(taskId).toBe("ipc-1")
		expect(removeMirrorFromStack).toHaveBeenCalledTimes(1)
		expect(createTask).toHaveBeenCalled()
	})
})

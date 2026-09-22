// npx vitest core/task/__tests__/TaskApiRequest.systemPrompt.spec.ts

import { describe, it, expect, vi, beforeEach } from "vitest"

import { TaskApiRequest } from "../TaskApiRequest"
import { SYSTEM_PROMPT } from "../../prompts/system"

vi.mock("vscode", () => ({
	workspace: {
		getConfiguration: () => ({ get: () => undefined }),
	},
	window: {
		createTextEditorDecorationType: vi.fn().mockReturnValue({ dispose: vi.fn() }),
		tabGroups: { all: [], onDidChangeTabs: vi.fn() },
		visibleTextEditors: [],
	},
	env: { language: "en-US" },
	languages: { getDiagnostics: vi.fn().mockReturnValue([]) },
	DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
}))

// Avoid loading the heavy Task.ts import chain (DiffViewProvider, decorations, etc.);
// this suite only exercises getSystemPrompt().
vi.mock("../Task", () => ({ Task: class Task {} }))

vi.mock("p-wait-for", () => ({
	default: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../../prompts/system", () => ({
	SYSTEM_PROMPT: vi.fn().mockResolvedValue("GENERATED_PROMPT"),
}))

vi.mock("../../services/mcp/McpServerManager", () => ({
	McpServerManager: {
		getInstance: vi.fn().mockResolvedValue(undefined),
	},
}))

describe("TaskApiRequest.getSystemPrompt memoization", () => {
	let state: Record<string, unknown>
	let provider: any
	let task: any
	let apiRequest: TaskApiRequest

	beforeEach(() => {
		vi.clearAllMocks()
		;(SYSTEM_PROMPT as unknown as ReturnType<typeof vi.fn>).mockResolvedValue("GENERATED_PROMPT")

		state = {
			mcpEnabled: false,
			mode: "code",
			customModes: [],
			customModePrompts: {},
			customInstructions: "",
			experiments: {},
			language: "en",
			apiConfiguration: {},
		}

		provider = {
			context: {},
			getState: vi.fn(async () => state),
			getSkillsManager: () => ({ getAllSkills: () => [] }),
			buildStaticSessionContext: () => "",
		}

		task = {
			cwd: "/cwd",
			taskId: "task-1",
			sandboxPath: undefined,
			worktreePath: undefined,
			workspacePath: "/workspace",
			diffStrategy: undefined,
			mirrorIgnoreController: { getInstructions: () => "" },
			api: {
				getModel: () => ({ id: "model-1", info: { contextWindow: 1000 } }),
			},
			providerRef: { deref: () => provider },
		}

		apiRequest = new TaskApiRequest(task)
	})

	it("should build the prompt once and reuse it for identical inputs", async () => {
		const first = await apiRequest.getSystemPrompt()
		const second = await apiRequest.getSystemPrompt()

		expect(first).toBe("GENERATED_PROMPT")
		expect(second).toBe("GENERATED_PROMPT")
		expect(SYSTEM_PROMPT).toHaveBeenCalledTimes(1)
	})

	it("should rebuild after explicit invalidation", async () => {
		await apiRequest.getSystemPrompt()
		apiRequest.invalidateSystemPromptCache()
		await apiRequest.getSystemPrompt()

		expect(SYSTEM_PROMPT).toHaveBeenCalledTimes(2)
	})

	it("should rebuild when an input (mode) changes", async () => {
		await apiRequest.getSystemPrompt()

		state = { ...state, mode: "architect" }
		await apiRequest.getSystemPrompt()

		expect(SYSTEM_PROMPT).toHaveBeenCalledTimes(2)
	})
})

import { describe, it, expect, vi, beforeEach } from "vitest"

import type { SharedSessionContext } from "@mirror-vs/types"

import { SessionContextManager } from "../SessionContextManager"

/**
 * Mock Task — SessionContextManager imports Task/MirrorProvider only as types,
 * so a plain object cast satisfies the interface. Only the fields the manager
 * actually reads need to be present.
 */
interface MockTask {
	taskId: string
	sessionId?: string
	taskNumber: number
	name?: string
	metadata?: { task?: string }
	todoList?: { id: string; content: string; status: string }[]
	mirrorMessages?: { say?: string; text?: string }[]
	state?: string
	isStreaming?: boolean
	isWaitingForFirstChunk?: boolean
	taskAsk?: { isAnswered?: boolean }
}

/**
 * Creates a MirrorProvider mock backed by an in-memory store, mirroring the
 * real ContextProxy getValue/setValue semantics for "sessionSharedContexts"
 * and "taskNames".
 */
function createMockProvider() {
	const store: Record<string, SharedSessionContext> = {}
	const taskNames: Record<string, string> = {}
	let tasks: MockTask[] = []
	let currentTaskId: string | undefined

	const provider = {
		contextProxy: {
			getValue: vi.fn(async (key: string) => (key === "sessionSharedContexts" ? store : undefined)),
			// The manager mutates the live object returned by getValue and then calls
			// persistAll with that same reference, so setValue merges without clearing.
			setValue: vi.fn(async (key: string, value: unknown) => {
				if (key === "sessionSharedContexts") {
					Object.assign(store, value as Record<string, SharedSessionContext>)
				}
			}),
		},
		getValue: vi.fn(async (key: string) => (key === "taskNames" ? taskNames : undefined)),
		getAllTasksSorted: vi.fn(() => tasks),
		getCurrentTask: vi.fn(() => (currentTaskId ? { taskId: currentTaskId } : undefined)),
	}

	return {
		provider,
		store,
		taskNames,
		setTasks: (next: MockTask[]) => {
			tasks = next
		},
		setCurrentTaskId: (id: string | undefined) => {
			currentTaskId = id
		},
	}
}

function makeTask(overrides: Partial<MockTask> = {}): MockTask {
	return {
		taskId: "task-1",
		sessionId: "session-1",
		taskNumber: 1,
		name: "Task One",
		metadata: { task: "Implement the auth flow" },
		state: "idle",
		isStreaming: false,
		isWaitingForFirstChunk: false,
		...overrides,
	}
}

describe("SessionContextManager", () => {
	let mock: ReturnType<typeof createMockProvider>
	let manager: SessionContextManager

	beforeEach(() => {
		mock = createMockProvider()
		manager = new SessionContextManager(mock.provider as any)
		vi.clearAllMocks()
	})

	describe("getOrCreateContext / getContext", () => {
		it("creates an empty context on first access and persists it", async () => {
			const ctx = await manager.getOrCreateContext("session-1")

			expect(ctx.sessionId).toBe("session-1")
			expect(ctx.knowledge).toEqual([])
			expect(ctx.notes).toBe("")
			expect(mock.provider.contextProxy.setValue).toHaveBeenCalledWith(
				"sessionSharedContexts",
				expect.objectContaining({ "session-1": expect.any(Object) }),
			)
		})

		it("returns the same context on subsequent access without re-persisting", async () => {
			const first = await manager.getOrCreateContext("session-1")
			;(mock.provider.contextProxy.setValue as any).mockClear()

			const second = await manager.getOrCreateContext("session-1")

			expect(second).toBe(first)
			expect(mock.provider.contextProxy.setValue).not.toHaveBeenCalled()
		})

		it("returns undefined for a session with no persisted context", async () => {
			await expect(manager.getContext("missing-session")).resolves.toBeUndefined()
		})

		it("round-trips persisted contexts across manager instances (survives restart)", async () => {
			await manager.getOrCreateContext("session-1")

			// A "new" manager backed by the same store sees the persisted context.
			const second = new SessionContextManager(mock.provider as any)
			const ctx = await second.getContext("session-1")

			expect(ctx?.sessionId).toBe("session-1")
		})
	})

	describe("setSessionNotes", () => {
		it("persists notes and bumps updatedAt", async () => {
			const ctx = await manager.getOrCreateContext("session-1")
			const before = ctx.updatedAt

			await manager.setSessionNotes("session-1", "## Decisions\n- Use Zod for validation")

			const persisted = (await manager.getContext("session-1"))!
			expect(persisted.notes).toBe("## Decisions\n- Use Zod for validation")
			expect(persisted.updatedAt).toBeGreaterThanOrEqual(before)
		})

		it("is a no-op for an empty sessionId", async () => {
			await manager.setSessionNotes("", "notes")
			expect(mock.provider.contextProxy.setValue).not.toHaveBeenCalled()
		})
	})

	describe("buildSiblingAwareness", () => {
		it("filters to the session, excludes the current task, and marks the current tab", async () => {
			mock.setTasks([
				makeTask({ taskId: "t-1", sessionId: "session-1", taskNumber: 1 }),
				makeTask({ taskId: "t-2", sessionId: "session-1", taskNumber: 2 }),
				makeTask({ taskId: "t-3", sessionId: "session-2", taskNumber: 3 }),
			])
			mock.taskNames["t-2"] = "Renamed Tab"
			mock.setCurrentTaskId("t-2")

			const siblings = await manager.buildSiblingAwareness("session-1", "t-1")

			expect(siblings.map((s) => s.taskId)).toEqual(["t-2"])
			expect(siblings[0].title).toBe("Renamed Tab")
			expect(siblings[0].isCurrent).toBe(true)
		})

		it("falls back to task name / prompt / Task #N for the title", async () => {
			mock.setTasks([
				makeTask({ taskId: "t-1", sessionId: "session-1", name: "Named", taskNumber: 1 }),
				makeTask({
					taskId: "t-2",
					sessionId: "session-1",
					name: undefined,
					metadata: { task: "Prompt text" },
					taskNumber: 2,
				}),
				makeTask({
					taskId: "t-3",
					sessionId: "session-1",
					name: undefined,
					metadata: { task: "" },
					taskNumber: 3,
				}),
			])

			const siblings = await manager.buildSiblingAwareness("session-1")

			expect(siblings[0].title).toBe("Named")
			expect(siblings[1].title).toBe("Prompt text")
			expect(siblings[2].title).toBe("Task #3")
		})

		it("derives status from streaming / interactive / task state", async () => {
			mock.setTasks([
				makeTask({ taskId: "t-1", sessionId: "session-1", isStreaming: true }),
				makeTask({ taskId: "t-2", sessionId: "session-1", taskAsk: { isAnswered: false } }),
				makeTask({ taskId: "t-3", sessionId: "session-1", state: "completed" }),
				makeTask({ taskId: "t-4", sessionId: "session-1", state: "error" }),
				makeTask({ taskId: "t-5", sessionId: "session-1", state: "aborted" }),
				makeTask({ taskId: "t-6", sessionId: "session-1", state: "working" }),
			])

			const siblings = await manager.buildSiblingAwareness("session-1")

			expect(siblings.map((s) => s.status)).toEqual([
				"streaming",
				"interactive",
				"completed",
				"error",
				"error",
				"idle",
			])
		})

		it("derives the one-liner from the latest todo, else the original prompt", async () => {
			mock.setTasks([
				makeTask({
					taskId: "t-1",
					sessionId: "session-1",
					todoList: [
						{ id: "a", content: "First todo", status: "completed" },
						{ id: "b", content: "Latest actionable", status: "in_progress" },
					],
				}),
				makeTask({ taskId: "t-2", sessionId: "session-1", metadata: { task: "Some original prompt" } }),
				makeTask({ taskId: "t-3", sessionId: "session-1", metadata: { task: "" } }),
			])

			const siblings = await manager.buildSiblingAwareness("session-1")

			expect(siblings[0].oneLiner).toBe("Latest actionable")
			expect(siblings[1].oneLiner).toBe("Some original prompt")
			expect(siblings[2].oneLiner).toBeUndefined()
		})
	})

	describe("buildCompactSummary", () => {
		it("returns an empty string for an empty sessionId", async () => {
			await expect(manager.buildCompactSummary("")).resolves.toBe("")
		})

		it("includes the sibling roster and knowledge/notes counts", async () => {
			mock.setTasks([makeTask({ taskId: "t-2", sessionId: "session-1", taskNumber: 2 })])
			await manager.setSessionNotes("session-1", "Some curated notes")
			await manager.extractKnowledgeFromTask(
				makeTask({
					taskId: "t-2",
					sessionId: "session-1",
					metadata: { task: "Build widget" },
					todoList: [{ id: "a", content: "Done thing", status: "completed" }],
				}) as any,
			)

			const summary = await manager.buildCompactSummary("session-1", "t-1")

			expect(summary).toContain("# Session Shared Context")
			expect(summary).toContain("## Sibling tabs in this session")
			expect(summary).toContain("| idle | Task One |")
			expect(summary).toContain("Shared knowledge notes: 2")
			expect(summary).toContain("User notes: present")
			expect(summary).toContain("`read_session_context`")
		})

		it("reports no siblings and no notes when absent", async () => {
			const summary = await manager.buildCompactSummary("session-1")

			expect(summary).toContain("No other open tabs share this session.")
			expect(summary).toContain("Shared knowledge notes: 0")
			expect(summary).not.toContain("User notes: present")
		})
	})

	describe("getFullContext", () => {
		it("returns a helpful message when there is no sessionId", async () => {
			const result = await manager.getFullContext("")
			expect(result).toBe("No active session — this task is not associated with a session.")
		})

		it("includes all three sections for scope=all", async () => {
			mock.setTasks([makeTask({ taskId: "t-2", sessionId: "session-1", taskNumber: 2 })])
			await manager.setSessionNotes("session-1", "Curated notes")
			await manager.extractKnowledgeFromTask(
				makeTask({
					taskId: "t-2",
					sessionId: "session-1",
					metadata: { task: "Build widget" },
					todoList: [{ id: "a", content: "Done thing", status: "completed" }],
				}) as any,
			)

			const result = await manager.getFullContext("session-1", "all")

			expect(result).toContain("## Sibling tabs")
			expect(result).toContain("## Shared knowledge notes")
			expect(result).toContain("## User-curated session notes")
			expect(result).toContain("Curated notes")
		})

		it("filters by scope", async () => {
			await manager.setSessionNotes("session-1", "Only notes here")

			const siblingsOnly = await manager.getFullContext("session-1", "siblings")
			expect(siblingsOnly).toContain("## Sibling tabs")
			expect(siblingsOnly).not.toContain("## Shared knowledge notes")
			expect(siblingsOnly).not.toContain("## User-curated session notes")

			const knowledgeOnly = await manager.getFullContext("session-1", "knowledge")
			expect(knowledgeOnly).toContain("## Shared knowledge notes")
			expect(knowledgeOnly).not.toContain("## Sibling tabs")
			expect(knowledgeOnly).not.toContain("## User-curated session notes")

			const notesOnly = await manager.getFullContext("session-1", "notes")
			expect(notesOnly).toContain("## User-curated session notes")
			expect(notesOnly).toContain("Only notes here")
			expect(notesOnly).not.toContain("## Sibling tabs")
			expect(notesOnly).not.toContain("## Shared knowledge notes")
		})

		it("defaults to scope=all", async () => {
			const result = await manager.getFullContext("session-1")
			expect(result).toContain("## Sibling tabs")
			expect(result).toContain("## Shared knowledge notes")
			expect(result).toContain("## User-curated session notes")
		})
	})

	describe("extractKnowledgeFromTask", () => {
		it("is a no-op for tasks without a sessionId", async () => {
			await manager.extractKnowledgeFromTask(makeTask({ sessionId: undefined }) as any)
			expect(mock.provider.contextProxy.setValue).not.toHaveBeenCalled()
		})

		it("is a no-op when the task yields no distillable notes", async () => {
			await manager.extractKnowledgeFromTask(
				makeTask({ metadata: { task: "" }, todoList: [], mirrorMessages: [] }) as any,
			)
			expect(mock.provider.contextProxy.setValue).not.toHaveBeenCalled()
		})

		it("distills goal, todos, and completion text into knowledge notes", async () => {
			const task = makeTask({
				taskId: "t-1",
				sessionId: "session-1",
				metadata: { task: "Ship the landing page" },
				todoList: [
					{ id: "a", content: "Add hero section", status: "completed" },
					{ id: "b", content: "Wire up analytics", status: "in_progress" },
				],
				mirrorMessages: [
					{ say: "text", text: "Ignored" },
					{ say: "completion_result", text: "Deployed v1.2 to production" },
				],
			}) as any

			await manager.extractKnowledgeFromTask(task)

			const ctx = (await manager.getContext("session-1"))!
			const texts = ctx.knowledge.map((n) => n.text)

			expect(texts).toContain("Goal: Ship the landing page")
			expect(texts).toContain("[completed] Add hero section")
			expect(texts).toContain("[in_progress] Wire up analytics")
			expect(texts).toContain("Completed: Deployed v1.2 to production")
			expect(texts).not.toContain("Ignored")

			// Notes carry source + timestamps.
			for (const note of ctx.knowledge) {
				expect(note.sourceTaskId).toBe("t-1")
				expect(note.id).toBeTruthy()
				expect(note.createdAt).toBeGreaterThan(0)
			}
		})

		it("dedupes identical notes across repeated extractions", async () => {
			const task = makeTask({
				taskId: "t-1",
				sessionId: "session-1",
				metadata: { task: "   Ship   the landing page   " },
				todoList: [{ id: "a", content: "Add hero section", status: "completed" }],
			}) as any

			await manager.extractKnowledgeFromTask(task)
			await manager.extractKnowledgeFromTask(task)

			const ctx = (await manager.getContext("session-1"))!
			expect(ctx.knowledge).toHaveLength(2)
			const texts = ctx.knowledge.map((n) => n.text)
			expect(new Set(texts).size).toBe(texts.length)
		})

		it("merges knowledge from multiple sibling tasks", async () => {
			await manager.extractKnowledgeFromTask(
				makeTask({ taskId: "t-1", sessionId: "session-1", metadata: { task: "Task A goal" } }) as any,
			)
			await manager.extractKnowledgeFromTask(
				makeTask({ taskId: "t-2", sessionId: "session-1", metadata: { task: "Task B goal" } }) as any,
			)

			const ctx = (await manager.getContext("session-1"))!
			const texts = ctx.knowledge.map((n) => n.text)
			expect(texts).toContain("Goal: Task A goal")
			expect(texts).toContain("Goal: Task B goal")
		})

		it("caps total knowledge notes at MAX_KNOWLEDGE_NOTES (50)", async () => {
			// Each task distills up to 5 notes; 10 tasks → exactly 50 notes.
			for (let i = 0; i < 10; i++) {
				await manager.extractKnowledgeFromTask(
					makeTask({
						taskId: `t-${i}`,
						sessionId: "session-1",
						metadata: { task: `Goal ${i}` },
						todoList: [0, 1, 2, 3].map((j) => ({
							id: `a${i}-${j}`,
							content: `Unique todo ${i}-${j}`,
							status: "completed",
						})),
					}) as any,
				)
			}

			// 11 tasks × up to 5 notes each = 55 candidates; the cap must hold at 50.
			await manager.extractKnowledgeFromTask(
				makeTask({
					taskId: "t-10",
					sessionId: "session-1",
					metadata: { task: "Goal overflow" },
					todoList: [{ id: "x", content: "Overflow todo", status: "completed" }],
				}) as any,
			)

			const ctx = (await manager.getContext("session-1"))!
			expect(ctx.knowledge).toHaveLength(50)
		})

		it("truncates very long note text to MAX_NOTE_TEXT_LENGTH (1024)", async () => {
			const longPrompt = "x".repeat(2000)
			await manager.extractKnowledgeFromTask(
				makeTask({ taskId: "t-1", sessionId: "session-1", metadata: { task: longPrompt } }) as any,
			)

			const ctx = (await manager.getContext("session-1"))!
			const goal = ctx.knowledge.find((n) => n.text.startsWith("Goal:"))!
			expect(goal.text.length).toBeLessThanOrEqual(1024)
		})
	})
})

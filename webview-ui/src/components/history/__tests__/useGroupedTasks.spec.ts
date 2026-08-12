import { renderHook, act } from "@/utils/test-utils"

import type { HistoryItem } from "@mirror-vs/types"

import { useGroupedTasks, buildSessionGroups } from "../useGroupedTasks"
import { vscode } from "@src/utils/vscode"

vi.mock("@src/utils/vscode")

const createMockTask = (overrides: Partial<HistoryItem> = {}): HistoryItem => ({
	id: "task-1",
	number: 1,
	task: "Test task",
	ts: Date.now(),
	tokensIn: 100,
	tokensOut: 50,
	totalCost: 0.01,
	workspace: "/workspace/project",
	sessionId: "session-1",
	...overrides,
})

describe("buildSessionGroups", () => {
	it("groups tasks by sessionId", () => {
		const session1Tasks = [
			createMockTask({ id: "task-1", sessionId: "session-1", ts: 100 }),
			createMockTask({ id: "task-2", sessionId: "session-1", ts: 200 }),
		]
		const session2Tasks = [createMockTask({ id: "task-3", sessionId: "session-2", ts: 300 })]

		const result = buildSessionGroups([...session1Tasks, ...session2Tasks], {}, new Set<string>())

		expect(result).toHaveLength(2)
		const s1 = result.find((s) => s.sessionId === "session-1")
		const s2 = result.find((s) => s.sessionId === "session-2")
		expect(s1).toBeDefined()
		expect(s2).toBeDefined()
		expect(s1!.tabs).toHaveLength(2)
		expect(s2!.tabs).toHaveLength(1)
	})

	it("sorts tabs by timestamp ascending within each session", () => {
		const tasks = [
			createMockTask({ id: "task-3", sessionId: "session-1", ts: 300 }),
			createMockTask({ id: "task-1", sessionId: "session-1", ts: 100 }),
			createMockTask({ id: "task-2", sessionId: "session-1", ts: 200 }),
		]

		const result = buildSessionGroups(tasks, {}, new Set<string>())

		expect(result).toHaveLength(1)
		expect(result[0].tabs.map((t) => t.id)).toEqual(["task-1", "task-2", "task-3"])
	})

	it("sorts sessions by newestTs descending", () => {
		const tasks = [
			createMockTask({ id: "old", sessionId: "session-old", ts: 100 }),
			createMockTask({ id: "new", sessionId: "session-new", ts: 500 }),
			createMockTask({ id: "middle", sessionId: "session-middle", ts: 300 }),
		]

		const result = buildSessionGroups(tasks, {}, new Set<string>())

		expect(result).toHaveLength(3)
		expect(result[0].sessionId).toBe("session-new")
		expect(result[1].sessionId).toBe("session-middle")
		expect(result[2].sessionId).toBe("session-old")
	})

	it("assigns sequential Session N names to unnamed sessions", () => {
		const tasks = [
			createMockTask({ id: "a", sessionId: "s1", ts: 300 }),
			createMockTask({ id: "b", sessionId: "s2", ts: 200 }),
			createMockTask({ id: "c", sessionId: "s3", ts: 100 }),
		]

		const result = buildSessionGroups(tasks, {}, new Set<string>())

		// Sorted by newestTs descending: s1(300), s2(200), s3(100)
		expect(result[0].sessionName).toBe("Session 1") // newest
		expect(result[1].sessionName).toBe("Session 2")
		expect(result[2].sessionName).toBe("Session 3") // oldest
	})

	it("uses user-defined names from sessionNames map", () => {
		const tasks = [
			createMockTask({ id: "a", sessionId: "s1", ts: 200 }),
			createMockTask({ id: "b", sessionId: "s2", ts: 100 }),
		]

		const result = buildSessionGroups(tasks, { s1: "My Custom Session" }, new Set<string>())

		const s1 = result.find((s) => s.sessionId === "s1")
		expect(s1?.sessionName).toBe("My Custom Session")

		const s2 = result.find((s) => s.sessionId === "s2")
		// Unnamed counter only tracks unnamed sessions, so s2 gets "Session 1" (s1 has a custom name)
		expect(s2?.sessionName).toBe("Session 1")
	})

	it("sets isExpanded based on expandedSessionIds", () => {
		const tasks = [
			createMockTask({ id: "a", sessionId: "s1", ts: 200 }),
			createMockTask({ id: "b", sessionId: "s2", ts: 100 }),
		]

		const result = buildSessionGroups(tasks, {}, new Set<string>(["s1"]))

		expect(result.find((s) => s.sessionId === "s1")?.isExpanded).toBe(true)
		expect(result.find((s) => s.sessionId === "s2")?.isExpanded).toBe(false)
	})

	it("treats legacy tasks without sessionId as singleton sessions", () => {
		const tasks = [createMockTask({ id: "a", sessionId: undefined, ts: 100 })]

		const result = buildSessionGroups(tasks, {}, new Set<string>())

		expect(result).toHaveLength(1)
		expect(result[0].sessionId).toMatch(/^__legacy__/)
		expect(result[0].tabs).toHaveLength(1)
		// The name should be derived from the task text
		expect(result[0].sessionName).toBe("Test task")
	})

	it("mixes legacy tasks and session tasks together", () => {
		const tasks = [
			createMockTask({ id: "a", sessionId: "s1", ts: 100 }),
			createMockTask({ id: "b", sessionId: undefined, ts: 200 }),
		]

		const result = buildSessionGroups(tasks, {}, new Set<string>())

		// Both sessions should appear
		expect(result).toHaveLength(2)
		const legacy = result.find((s) => s.sessionId.startsWith("__legacy__"))
		const normal = result.find((s) => s.sessionId === "s1")
		expect(legacy).toBeDefined()
		expect(normal).toBeDefined()
		expect(legacy!.tabs).toHaveLength(1)
		expect(normal!.tabs).toHaveLength(1)
	})

	it("sets correct taskCount and newestTs", () => {
		const tasks = [
			createMockTask({ id: "a", sessionId: "s1", ts: 100 }),
			createMockTask({ id: "b", sessionId: "s1", ts: 300 }),
			createMockTask({ id: "c", sessionId: "s1", ts: 200 }),
		]

		const result = buildSessionGroups(tasks, {}, new Set<string>())

		expect(result[0].taskCount).toBe(3)
		expect(result[0].newestTs).toBe(300)
	})
})

describe("useGroupedTasks", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("session grouping (no search mode)", () => {
		it("returns sessionGroups in non-search mode", () => {
			const tasks = [
				createMockTask({ id: "a", sessionId: "s1", ts: 100 }),
				createMockTask({ id: "b", sessionId: "s1", ts: 200 }),
			]

			const { result } = renderHook(() => useGroupedTasks(tasks, ""))

			expect(result.current.sessionGroups).toHaveLength(1)
			expect(result.current.flatTasks).toBeNull()
			expect(result.current.isSearchMode).toBe(false)
		})

		it("returns empty sessionGroups for empty tasks", () => {
			const { result } = renderHook(() => useGroupedTasks([], ""))

			expect(result.current.sessionGroups).toHaveLength(0)
			expect(result.current.flatTasks).toBeNull()
		})
	})

	describe("search mode", () => {
		it("returns flatTasks when search query is non-empty", () => {
			const tasks = [
				createMockTask({ id: "a", sessionId: "s1", task: "alpha" }),
				createMockTask({ id: "b", sessionId: "s2", task: "beta" }),
			]

			const { result } = renderHook(() => useGroupedTasks(tasks, "alpha"))

			expect(result.current.isSearchMode).toBe(true)
			expect(result.current.sessionGroups).toHaveLength(0)
			expect(result.current.flatTasks).not.toBeNull()
			expect(result.current.flatTasks).toHaveLength(2)
		})

		it("treats whitespace-only query as non-search", () => {
			const tasks = [createMockTask({ id: "a", sessionId: "s1", ts: 100 })]

			const { result } = renderHook(() => useGroupedTasks(tasks, "   "))

			expect(result.current.isSearchMode).toBe(false)
			expect(result.current.sessionGroups).toHaveLength(1)
			expect(result.current.flatTasks).toBeNull()
		})
	})

	describe("toggleSessionExpand", () => {
		it("toggles session expansion state", () => {
			const tasks = [createMockTask({ id: "a", sessionId: "s1", ts: 100 })]

			const { result } = renderHook(() => useGroupedTasks(tasks, ""))

			expect(result.current.sessionGroups[0].isExpanded).toBe(false)

			act(() => {
				result.current.toggleSessionExpand("s1")
			})

			expect(result.current.sessionGroups[0].isExpanded).toBe(true)

			act(() => {
				result.current.toggleSessionExpand("s1")
			})

			expect(result.current.sessionGroups[0].isExpanded).toBe(false)
		})

		it("toggles sessions independently", () => {
			const tasks = [
				createMockTask({ id: "a", sessionId: "s1", ts: 200 }),
				createMockTask({ id: "b", sessionId: "s2", ts: 100 }),
			]

			const { result } = renderHook(() => useGroupedTasks(tasks, ""))

			act(() => {
				result.current.toggleSessionExpand("s1")
			})

			const s1 = result.current.sessionGroups.find((s) => s.sessionId === "s1")
			const s2 = result.current.sessionGroups.find((s) => s.sessionId === "s2")
			expect(s1?.isExpanded).toBe(true)
			expect(s2?.isExpanded).toBe(false)
		})
	})

	describe("setSessionName", () => {
		it("posts renameSession message with correct params", () => {
			const tasks = [createMockTask({ id: "a", sessionId: "s1", ts: 100 })]

			const { result } = renderHook(() => useGroupedTasks(tasks, ""))

			act(() => {
				result.current.setSessionName("s1", "My Renamed Session")
			})

			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "renameSession",
				sessionId: "s1",
				sessionName: "My Renamed Session",
			})
		})
	})

	describe("sessionNames prop", () => {
		it("passes sessionNames to buildSessionGroups", () => {
			const tasks = [createMockTask({ id: "a", sessionId: "s1", ts: 100 })]

			const { result } = renderHook(() => useGroupedTasks(tasks, "", { s1: "Custom Name" }))

			expect(result.current.sessionGroups[0].sessionName).toBe("Custom Name")
		})
	})

	describe("edge cases", () => {
		it("preserves expand state when tasks change", () => {
			const tasks = [createMockTask({ id: "a", sessionId: "s1", ts: 100 })]

			const { result, rerender } = renderHook(({ tasks, query }) => useGroupedTasks(tasks, query), {
				initialProps: { tasks, query: "" },
			})

			act(() => {
				result.current.toggleSessionExpand("s1")
			})
			expect(result.current.sessionGroups[0].isExpanded).toBe(true)

			// Re-render with additional tasks
			const updatedTasks = [...tasks, createMockTask({ id: "b", sessionId: "s1", ts: 200 })]
			rerender({ tasks: updatedTasks, query: "" })

			expect(result.current.sessionGroups[0].isExpanded).toBe(true)
		})
	})
})

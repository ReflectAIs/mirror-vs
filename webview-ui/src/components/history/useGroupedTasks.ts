import { useState, useMemo, useCallback } from "react"
import type { HistoryItem } from "@mirror-vs/types"
import type { DisplayHistoryItem, SessionGroup, GroupedTasksResult } from "./types"
import { vscode } from "@/utils/vscode"

export type SortOption = "newest" | "oldest" | "mostExpensive" | "mostTokens" | "mostRelevant"

function getTaskTokens(task: HistoryItem): number {
	return (task.tokensIn || 0) + (task.tokensOut || 0) + (task.cacheWrites || 0) + (task.cacheReads || 0)
}

function getSessionTokens(tabs: HistoryItem[]): number {
	return tabs.reduce((acc, t) => acc + getTaskTokens(t), 0)
}

function getSessionCost(tabs: HistoryItem[]): number {
	return tabs.reduce((acc, t) => acc + (t.totalCost || 0), 0)
}

function sortTabsList(tabs: HistoryItem[], sortOption: SortOption): HistoryItem[] {
	return tabs.slice().sort((a, b) => {
		switch (sortOption) {
			case "oldest":
				return (a.ts || 0) - (b.ts || 0)
			case "mostExpensive":
				return (b.totalCost || 0) - (a.totalCost || 0)
			case "mostTokens":
				return getTaskTokens(b) - getTaskTokens(a)
			case "mostRelevant":
			case "newest":
			default:
				return (b.ts || 0) - (a.ts || 0)
		}
	})
}

/**
 * Groups tasks by session and builds SessionGroup[] sorted by sortOption.
 * Tabs within each session are also sorted according to sortOption.
 *
 * @param tasks - Flat list of history items (filtered/search results)
 * @param sessionNames - Map of sessionId → user-assigned name from extension state
 * @param expandedSessionIds - Set of session IDs whose contents are expanded
 * @param sortOption - Active sort option ("newest" | "oldest" | "mostExpensive" | "mostTokens" | "mostRelevant")
 * @returns SessionGroup[] sorted by sortOption
 */
export function buildSessionGroups(
	tasks: HistoryItem[],
	sessionNames: Record<string, string>,
	expandedSessionIds: Set<string>,
	sortOption: SortOption = "newest",
): SessionGroup[] {
	// Group tasks by sessionId
	const sessionMap = new Map<string, HistoryItem[]>()

	for (const task of tasks) {
		let sid = task.sessionId

		// Legacy tasks (created before the session feature) have no sessionId.
		// Treat each as its own singleton session so they remain visible.
		if (!sid) {
			sid = `__legacy__${task.id}`
		}

		const group = sessionMap.get(sid) || []
		group.push(task)
		sessionMap.set(sid, group)
	}

	if (sessionMap.size === 0) return []

	// Build intermediate sessions with computed metadata
	const sessions: Array<{
		sessionId: string
		tabs: HistoryItem[]
		workspace?: string
		newestTs: number
		oldestTs: number
		taskCount: number
	}> = []

	for (const [sessionId, tabs] of sessionMap) {
		const sortedTabs = sortTabsList(tabs, sortOption)

		// Timestamps for session-level sorting & display
		const allTs = tabs.map((t) => t.ts || 0).filter(Boolean)
		const newestTs = allTs.length > 0 ? Math.max(...allTs) : 0
		const oldestTs = allTs.length > 0 ? Math.min(...allTs) : 0
		const workspace = tabs.find((t) => t.workspace)?.workspace

		sessions.push({
			sessionId,
			tabs: sortedTabs,
			workspace,
			newestTs,
			oldestTs,
			taskCount: sortedTabs.length,
		})
	}

	// Sort sessions according to sortOption
	sessions.sort((a, b) => {
		switch (sortOption) {
			case "oldest":
				return (a.oldestTs || 0) - (b.oldestTs || 0)
			case "mostExpensive":
				return getSessionCost(b.tabs) - getSessionCost(a.tabs)
			case "mostTokens":
				return getSessionTokens(b.tabs) - getSessionTokens(a.tabs)
			case "mostRelevant":
			case "newest":
			default:
				return (b.newestTs || 0) - (a.newestTs || 0)
		}
	})

	// Assign sequential numbers to unnamed sessions based on their sorted order.
	let unnamedCounter = 0

	return sessions.map((session) => {
		const isLegacy = session.sessionId.startsWith("__legacy__")
		const userDefinedName = !isLegacy ? sessionNames[session.sessionId] : undefined

		let sessionName: string
		if (userDefinedName) {
			sessionName = userDefinedName
		} else if (isLegacy) {
			// For legacy singleton tasks, use the task text as the session label
			const firstTask = session.tabs[0]
			const label = firstTask?.task?.trim() || `Task ${firstTask?.number ?? ""}`
			sessionName = label.length > 60 ? `${label.slice(0, 60)}…` : label
		} else {
			unnamedCounter++
			sessionName = `Session ${unnamedCounter}`
		}

		return {
			sessionId: session.sessionId,
			sessionName,
			workspace: session.workspace,
			tabs: session.tabs as DisplayHistoryItem[],
			taskCount: session.taskCount,
			newestTs: session.newestTs,
			oldestTs: session.oldestTs,
			isExpanded: expandedSessionIds.has(session.sessionId),
		}
	})
}

/**
 * Hook to transform a flat task list into session-based grouped structure.
 *
 * In search mode, returns a flat list (no session grouping).
 * In normal mode, returns SessionGroup[] with collapsible sessions.
 *
 * @param tasks - The list of tasks to group (from useTaskSearch)
 * @param searchQuery - Current search query (empty string means not searching)
 * @param sessionNames - Map of sessionId → user-assigned name from extension state
 * @param sortOption - Active sort option
 * @returns GroupedTasksResult with sessionGroups, flatTasks, toggleSessionExpand, and isSearchMode
 */
export function useGroupedTasks(
	tasks: HistoryItem[],
	searchQuery: string,
	sessionNames: Record<string, string> = {},
	sortOption: SortOption = "newest",
): GroupedTasksResult {
	const [expandedSessionIds, setExpandedSessionIds] = useState<Set<string>>(new Set())

	const isSearchMode = searchQuery.trim().length > 0

	// Build session groups
	const sessionGroups = useMemo((): SessionGroup[] => {
		if (isSearchMode) {
			// In search mode, we don't group — return empty
			return []
		}

		return buildSessionGroups(tasks, sessionNames, expandedSessionIds, sortOption)
	}, [tasks, sessionNames, isSearchMode, expandedSessionIds, sortOption])

	// Flatten tasks for search mode
	const flatTasks = useMemo((): DisplayHistoryItem[] | null => {
		if (!isSearchMode) {
			return null
		}

		return tasks.map((task) => ({ ...task })) as DisplayHistoryItem[]
	}, [tasks, isSearchMode])

	// Toggle expand/collapse for a session group
	const toggleSessionExpand = useCallback((sessionId: string) => {
		setExpandedSessionIds((prev) => {
			const newSet = new Set(prev)
			if (newSet.has(sessionId)) {
				newSet.delete(sessionId)
			} else {
				newSet.add(sessionId)
			}
			return newSet
		})
	}, [])

	// Rename a session by sending renameSession message to backend
	const setSessionName = useCallback((sessionId: string, name: string) => {
		vscode.postMessage({
			type: "renameSession",
			sessionId,
			sessionName: name,
		})
	}, [])

	return {
		sessionGroups,
		flatTasks,
		toggleSessionExpand,
		setSessionName,
		isSearchMode,
	}
}

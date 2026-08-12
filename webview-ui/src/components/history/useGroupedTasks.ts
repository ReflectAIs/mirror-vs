import { useState, useMemo, useCallback } from "react"
import type { HistoryItem } from "@mirror-vs/types"
import type { DisplayHistoryItem, SessionGroup, GroupedTasksResult } from "./types"
import { vscode } from "@/utils/vscode"

/**
 * Groups tasks by session and builds SessionGroup[] sorted by newest task descending.
 * Tabs within each session are sorted by timestamp ascending (oldest first = leftmost tab).
 *
 * Unnamed sessions are assigned "Session N" where N is a 1-based index determined
 * by the chronological order of sessions by their newest task timestamp.
 *
 * @param tasks - Flat list of history items (filtered/search results)
 * @param sessionNames - Map of sessionId → user-assigned name from extension state
 * @param expandedSessionIds - Set of session IDs whose contents are expanded
 * @returns SessionGroup[] sorted by newestTs descending
 */
export function buildSessionGroups(
	tasks: HistoryItem[],
	sessionNames: Record<string, string>,
	expandedSessionIds: Set<string>,
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
		newestTs: number
		taskCount: number
	}> = []

	for (const [sessionId, tabs] of sessionMap) {
		// Sort tabs by timestamp ascending (oldest first)
		const sortedTabs = tabs.slice().sort((a, b) => a.ts - b.ts)

		// Find newest timestamp for session-level sorting
		const newestTs = sortedTabs[sortedTabs.length - 1]?.ts ?? 0

		sessions.push({
			sessionId,
			tabs: sortedTabs,
			newestTs,
			taskCount: sortedTabs.length,
		})
	}

	// Sort sessions by newest task timestamp descending
	sessions.sort((a, b) => b.newestTs - a.newestTs)

	// Assign sequential numbers to unnamed sessions based on their sorted order.
	// Legacy singleton sessions get a truncated task-name label instead of "Session N".
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
			tabs: session.tabs as DisplayHistoryItem[],
			taskCount: session.taskCount,
			newestTs: session.newestTs,
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
 * @returns GroupedTasksResult with sessionGroups, flatTasks, toggleSessionExpand, and isSearchMode
 */
export function useGroupedTasks(
	tasks: HistoryItem[],
	searchQuery: string,
	sessionNames: Record<string, string> = {},
): GroupedTasksResult {
	const [expandedSessionIds, setExpandedSessionIds] = useState<Set<string>>(new Set())

	const isSearchMode = searchQuery.trim().length > 0

	// Build session groups
	const sessionGroups = useMemo((): SessionGroup[] => {
		if (isSearchMode) {
			// In search mode, we don't group — return empty
			return []
		}

		return buildSessionGroups(tasks, sessionNames, expandedSessionIds)
	}, [tasks, sessionNames, isSearchMode, expandedSessionIds])

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

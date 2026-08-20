import type { HistoryItem } from "@mirror-vs/types"

/**
 * Extended HistoryItem with display-related fields for search highlighting
 */
export interface DisplayHistoryItem extends HistoryItem {
	/** HTML string with search match highlighting */
	highlight?: string
}

/**
 * A top-level group representing a session in the history view.
 * Contains a flat list of tabs (tasks) that were open during that session.
 */
export interface SessionGroup {
	/** Unique session identifier */
	sessionId: string
	/** User-assigned name or auto-generated "Session N" */
	sessionName: string
	/** Primary workspace directory for tasks in this session */
	workspace?: string
	/** Flat list of tasks in this session, sorted according to active sort */
	tabs: DisplayHistoryItem[]
	/** Total number of tabs in this session */
	taskCount: number
	/** Timestamp of the newest task (used for sorting sessions) */
	newestTs: number
	/** Timestamp of the oldest task (used for sorting sessions) */
	oldestTs?: number
	/** Whether this session is expanded in the UI */
	isExpanded: boolean
}

/**
 * Result from the useGroupedTasks hook
 */
export interface GroupedTasksResult {
	/** Session-based groups — top-level containers with tabs inside */
	sessionGroups: SessionGroup[]
	/** Flat list of tasks with search highlights — used in search mode */
	flatTasks: DisplayHistoryItem[] | null
	/** Function to toggle expand/collapse state of a session group */
	toggleSessionExpand: (sessionId: string) => void
	/** Function to rename a session (sends renameSession message) */
	setSessionName: (sessionId: string, name: string) => void
	/** Whether search mode is active */
	isSearchMode: boolean
}

import crypto from "crypto"

import type { Task } from "../task/Task"

import type { MirrorProvider } from "./MirrorProvider"

/**
 * Manages session CRUD (create, read, update, delete) for MirrorProvider.
 *
 * A "session" groups tasks together under a single ID that persists across
 * VS Code restarts. All tasks created during a session share this ID for
 * history grouping in the frontend.
 *
 * Extracted from MirrorProvider.ts lines 328–428 to reduce the monolithic class.
 */
export class SessionManager {
	constructor(private provider: MirrorProvider) {}

	// ── Public API ───────────────────────────────────────────────────────────

	/**
	 * Creates a new session, persists it via contextProxy, and returns the id.
	 */
	public async createSession(): Promise<string> {
		const sessionId = crypto.randomUUID()
		this.provider.setCurrentSessionId(sessionId)
		await this.provider.contextProxy.setValue("currentSessionId", sessionId)
		this.provider.log(`[createSession] Created new session ${sessionId}`)
		return sessionId
	}

	/**
	 * Returns the existing session if present, otherwise restores from
	 * persisted state, or creates a brand-new one as a last resort.
	 */
	public async getOrCreateSession(): Promise<string> {
		const existing = this.provider.getCurrentSessionId()
		if (existing) {
			console.log(`[SESSION-DBG] getOrCreateSession: returning cached=${existing}`)
			return existing
		}

		const persistedSessionId = await this.provider.contextProxy.getValue("currentSessionId")
		if (persistedSessionId) {
			this.provider.setCurrentSessionId(persistedSessionId)
			console.log(`[SESSION-DBG] getOrCreateSession: restored persisted=${persistedSessionId}`)
			return persistedSessionId
		}

		const newSessionId = await this.createSession()
		console.log(`[SESSION-DBG] getOrCreateSession: created new=${newSessionId}`)
		return newSessionId
	}

	/**
	 * Clears the current session id from memory and persisted state.
	 */
	public async clearSession(): Promise<void> {
		this.provider.setCurrentSessionId(undefined)
		await this.provider.contextProxy.setValue("currentSessionId", undefined)
		this.provider.log("[clearSession] Session cleared")
	}

	/**
	 * Returns the map of session IDs to their user-assigned or auto-generated names.
	 */
	public async getSessionNames(): Promise<Record<string, string>> {
		return (await this.provider.contextProxy.getValue("sessionNames")) || {}
	}

	/**
	 * Sets a single session's name in the persisted sessionNames map.
	 */
	public async setSessionName(sessionId: string, name: string): Promise<void> {
		const names = await this.getSessionNames()
		names[sessionId] = name
		await this.provider.contextProxy.setValue("sessionNames", names)
		this.provider.log(`[setSessionName] Session ${sessionId} renamed to "${name}"`)
	}

	/**
	 * Renames a session and broadcasts the updated state to the webview.
	 */
	public async renameSession(sessionId: string, name: string): Promise<void> {
		await this.setSessionName(sessionId, name)
		await this.provider.postStateToWebview()
	}

	/**
	 * Create a brand-new task within the current session.
	 * Called when the user sends a message and no active task is running,
	 * but a session already exists.  The new task gets a fresh conversation
	 * history but shares the same sessionId.
	 */
	public async startNewTaskInSession(text: string, images?: string[]): Promise<Task> {
		const sessionId = await this.getOrCreateSession()
		const task = await this.provider.createTask(text, images, undefined, {}, {})

		// Auto-rename: if this session doesn't have a name yet, generate one
		// from the first line of the task text (max 60 chars).
		const names = await this.getSessionNames()
		if (!names[sessionId]) {
			const autoName = text.split("\n")[0].slice(0, 60).trim()
			if (autoName) {
				names[sessionId] = autoName
				await this.provider.contextProxy.setValue("sessionNames", names)
				this.provider.log(`[startNewTaskInSession] Auto-named session ${sessionId} to "${autoName}"`)
			}
		}

		this.provider.log(`[startNewTaskInSession] New task ${task.taskId} in session ${sessionId}`)
		return task
	}
}

import crypto from "crypto"

import type { SharedSessionContext, SessionContextScope, SiblingTabInfo, SessionKnowledgeNote } from "@mirror-vs/types"

import type { Task } from "../task/Task"
import type { MirrorProvider } from "../webview/MirrorProvider"

const MAX_KNOWLEDGE_NOTES = 50
const MAX_KNOWLEDGE_BYTES = 8 * 1024
const MAX_NOTE_TEXT_LENGTH = 1024

/**
 * Manages the shared selective context between tabs (tasks) in the same session.
 *
 * A session groups tabs under a single `sessionId` that persists across restarts.
 * Each tab keeps its own full conversation — this module owns the *layer on top*:
 *
 * 1. **Sibling awareness** — a compact roster of other tabs in the session
 *    (title, status, one-liner) so each tab knows its siblings exist.
 * 2. **Auto knowledge** — distilled facts/decisions extracted from a tab when it
 *    completes or when its context condenses, deduped and capped.
 * 3. **Curated notes** — optional user-authored markdown shared with all tabs.
 *
 * Storage is a `sessionSharedContexts` key on ContextProxy (keyed by sessionId),
 * so shared context survives VS Code restarts.
 */
export class SessionContextManager {
	constructor(private provider: MirrorProvider) {}

	// ── Persistence helpers ────────────────────────────────────────────────

	private async getAllContexts(): Promise<Record<string, SharedSessionContext>> {
		return (await this.provider.contextProxy.getValue("sessionSharedContexts")) || {}
	}

	private async persistAll(contexts: Record<string, SharedSessionContext>): Promise<void> {
		await this.provider.contextProxy.setValue("sessionSharedContexts", contexts)
	}

	/**
	 * Returns the persisted shared context for a session, creating an empty
	 * document on first access.
	 */
	public async getOrCreateContext(sessionId: string): Promise<SharedSessionContext> {
		const contexts = await this.getAllContexts()
		let ctx = contexts[sessionId]
		if (!ctx) {
			ctx = {
				sessionId,
				updatedAt: Date.now(),
				knowledge: [],
				notes: "",
			}
			contexts[sessionId] = ctx
			await this.persistAll(contexts)
		}
		return ctx
	}

	public async getContext(sessionId: string): Promise<SharedSessionContext | undefined> {
		const contexts = await this.getAllContexts()
		return contexts[sessionId]
	}

	// ── Sibling awareness ──────────────────────────────────────────────────

	/**
	 * Derives the sibling-tab roster for a session from live task state.
	 * Pure in-memory derivation — no I/O, cheap to call on every prompt build.
	 */
	public async buildSiblingAwareness(sessionId: string, excludeTaskId?: string): Promise<SiblingTabInfo[]> {
		const tasks = this.provider.getAllTasksSorted()
		const taskNames: Record<string, string> = (await this.provider.getValue("taskNames")) || {}
		const currentTaskId = this.provider.getCurrentTask()?.taskId

		return tasks
			.filter((task) => task.sessionId === sessionId && task.taskId !== excludeTaskId)
			.map((task) => ({
				taskId: task.taskId,
				title: taskNames[task.taskId] || task.name || task.metadata.task || `Task #${task.taskNumber}`,
				status: this.deriveStatus(task),
				oneLiner: this.deriveOneLiner(task),
				isCurrent: task.taskId === currentTaskId,
			}))
	}

	private deriveStatus(task: Task): string {
		if (task.isStreaming || task.isWaitingForFirstChunk) {
			return "streaming"
		}
		if (task.taskAsk !== undefined && task.taskAsk.isAnswered === false) {
			return "interactive"
		}
		switch (task.state) {
			case "completed":
				return "completed"
			case "error":
			case "aborted":
				return "error"
			default:
				return "idle"
		}
	}

	private deriveOneLiner(task: Task): string | undefined {
		// Prefer the latest actionable todo item.
		if (task.todoList && task.todoList.length > 0) {
			const todo = task.todoList[task.todoList.length - 1]
			if (todo?.content) {
				return todo.content.slice(0, 200)
			}
		}
		// Fall back to the task's original prompt text.
		const original = task.metadata?.task
		if (original) {
			return original.slice(0, 200)
		}
		return undefined
	}

	// ── Compact summary (injected into system prompt) ──────────────────────

	/**
	 * Builds a compact `# Session Shared Context` section for the system prompt.
	 * Always includes the sibling roster plus counts for knowledge/notes, so the
	 * model knows deeper context exists and can call `read_session_context`.
	 */
	public async buildCompactSummary(sessionId: string, currentTaskId?: string): Promise<string> {
		if (!sessionId) {
			return ""
		}

		const [siblings, ctx] = await Promise.all([
			this.buildSiblingAwareness(sessionId, currentTaskId),
			this.getContext(sessionId),
		])

		const lines: string[] = []
		lines.push("# Session Shared Context")
		lines.push(
			"You are working inside a session that may contain multiple tabs (independent tasks). Each tab is a separate task, but you may share selective context with them.",
		)

		if (siblings.length > 0) {
			lines.push("")
			lines.push("## Sibling tabs in this session")
			lines.push("| Status | Title | Summary |")
			lines.push("|--------|-------|---------|")
			for (const sib of siblings) {
				lines.push(
					`| ${sib.status} | ${sib.title.replace(/\|/g, "\\|")} | ${(sib.oneLiner ?? "").replace(/\|/g, "\\|")} |`,
				)
			}
		} else {
			lines.push("")
			lines.push("## Sibling tabs in this session")
			lines.push("No other open tabs share this session.")
		}

		const knowledgeCount = ctx?.knowledge?.length ?? 0
		const notesPresent = ctx?.notes?.trim() ? true : false
		lines.push("")
		lines.push(
			`> Shared knowledge notes: ${knowledgeCount}${notesPresent ? " · User notes: present" : ""}. Use the \`read_session_context\` tool to pull full details, knowledge, or notes on demand.`,
		)

		return lines.join("\n")
	}

	// ── Full context (read_session_context tool) ───────────────────────────

	/**
	 * Returns the full shared context for a session, optionally filtered by scope.
	 * Used by the `read_session_context` tool.
	 */
	public async getFullContext(sessionId: string, scope: SessionContextScope = "all"): Promise<string> {
		if (!sessionId) {
			return "No active session — this task is not associated with a session."
		}

		const [siblings, ctx] = await Promise.all([
			this.buildSiblingAwareness(sessionId),
			this.getOrCreateContext(sessionId),
		])

		const sections: string[] = []

		if (scope === "all" || scope === "siblings") {
			const header = "## Sibling tabs"
			if (siblings.length === 0) {
				sections.push(`${header}\nNo other open tabs share this session.`)
			} else {
				sections.push(
					header +
						"\n" +
						siblings
							.map(
								(sib) =>
									`- [${sib.status}] ${sib.title}${sib.isCurrent ? " (current)" : ""}` +
									(sib.oneLiner ? ` — ${sib.oneLiner}` : ""),
							)
							.join("\n"),
				)
			}
		}

		if (scope === "all" || scope === "knowledge") {
			const header = "## Shared knowledge notes"
			if (!ctx.knowledge || ctx.knowledge.length === 0) {
				sections.push(`${header}\nNo knowledge has been extracted from sibling tabs yet.`)
			} else {
				sections.push(
					header +
						"\n" +
						ctx.knowledge
							.map((note, i) => `${i + 1}. (from tab ${note.sourceTaskId.slice(0, 8)}) ${note.text}`)
							.join("\n"),
				)
			}
		}

		if (scope === "all" || scope === "notes") {
			const header = "## User-curated session notes"
			sections.push(ctx.notes?.trim() ? `${header}\n${ctx.notes}` : `${header}\nNo user notes for this session.`)
		}

		return sections.join("\n\n")
	}

	// ── Curated notes ──────────────────────────────────────────────────────

	/**
	 * Persists user-curated markdown notes for a session, replacing prior notes.
	 */
	public async setSessionNotes(sessionId: string, notes: string): Promise<void> {
		if (!sessionId) {
			return
		}
		const ctx = await this.getOrCreateContext(sessionId)
		ctx.notes = notes ?? ""
		ctx.updatedAt = Date.now()
		await this.persistAll(await this.getAllContexts())
	}

	// ── Auto knowledge extraction (Phase 3) ────────────────────────────────

	/**
	 * Extracts distilled knowledge notes from a task and merges them into the
	 * session's shared context. Called when a tab completes or condenses.
	 * Dedupes by normalized text and caps total notes/size.
	 */
	public async extractKnowledgeFromTask(task: Task): Promise<void> {
		const sessionId = task.sessionId
		if (!sessionId) {
			return
		}

		const notes = this.distillNotes(task)
		if (notes.length === 0) {
			return
		}

		const ctx = await this.getOrCreateContext(sessionId)
		const existing = new Set(ctx.knowledge.map((n) => normalize(n.text)))

		let added = 0
		for (const note of notes) {
			if (added >= MAX_KNOWLEDGE_NOTES) {
				break
			}
			const key = normalize(note.text)
			if (existing.has(key) || key.length === 0) {
				continue
			}
			ctx.knowledge.push(note)
			existing.add(key)
			added++
		}

		// Enforce caps: newest notes win, oldest are evicted.
		ctx.knowledge.sort((a, b) => b.createdAt - a.createdAt)
		ctx.knowledge = ctx.knowledge.slice(0, MAX_KNOWLEDGE_NOTES)
		let totalBytes = 0
		ctx.knowledge = ctx.knowledge.filter((note) => {
			totalBytes += note.text.length
			return totalBytes <= MAX_KNOWLEDGE_BYTES
		})

		ctx.updatedAt = Date.now()
		await this.persistAll(await this.getAllContexts())
	}

	/**
	 * Distills a task into concise knowledge notes.
	 * Uses the task's user prompt, todo list (status + content), modified files,
	 * and attempt_completion text — no extra LLM round-trip needed.
	 */
	private distillNotes(task: Task): SessionKnowledgeNote[] {
		const notes: SessionKnowledgeNote[] = []
		const now = Date.now()

		const push = (text: string) => {
			const trimmed = text.trim().slice(0, MAX_NOTE_TEXT_LENGTH)
			if (trimmed.length > 0) {
				notes.push({
					id: crypto.randomUUID(),
					sourceTaskId: task.taskId,
					createdAt: now,
					text: trimmed,
				})
			}
		}

		// Goal from the original prompt or first user message
		const original =
			task.metadata?.task ||
			task.mirrorMessages?.find((m) => m.type === "say" && (m.say === "user_feedback" || m.say === "text"))?.text
		if (original) {
			push(`🎯 Goal: ${original.split("\n")[0].slice(0, 300)}`)
		}

		// Key actions from the todo list (completed/in_progress items show progress).
		if (task.todoList && task.todoList.length > 0) {
			for (const todo of task.todoList.slice(0, 5)) {
				if (todo?.content) {
					const prefix = todo.status === "completed" ? "✓" : todo.status === "in_progress" ? "⏳" : "•"
					push(`${prefix} [${todo.status}] ${todo.content}`)
				}
			}
		}

		// Key file modifications
		if (task.fileEdits && task.fileEdits.length > 0) {
			const filePaths = task.fileEdits.map((f) => f.path.split("/").pop() || f.path)
			const uniqueFiles = Array.from(new Set(filePaths)).slice(0, 4)
			push(`📁 Modified: ${uniqueFiles.join(", ")}`)
		}

		// Final summary from the last attempt_completion or task completion message.
		const completion = task.mirrorMessages
			?.filter((m) => m.say === "completion_result" && m.text)
			.slice(-1)[0]?.text
		if (completion) {
			push(`✨ Completed: ${completion.slice(0, 500)}`)
		}

		return notes.slice(0, 8)
	}
}

function normalize(text: string): string {
	return text.replace(/\s+/g, " ").trim().toLowerCase()
}

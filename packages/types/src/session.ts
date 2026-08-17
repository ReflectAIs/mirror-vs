import { z } from "zod"

/**
 * Shared context between tabs (tasks) within the same session.
 *
 * A session groups tabs under a single `sessionId` that persists across
 * VS Code restarts. This module defines the selective context those tabs
 * share — sibling-tab awareness, auto-extracted knowledge, and optional
 * user-curated notes — while each tab keeps its own full conversation.
 */

/**
 * Compact info about a sibling tab in the same session.
 */
export const siblingTabInfoSchema = z.object({
	taskId: z.string(),
	/** Stable display title (taskNames override or auto-name). */
	title: z.string(),
	/** Current task status: running | interactive | resumable | idle | none */
	status: z.string(),
	/** One-line summary: latest todo or attempt_completion text. */
	oneLiner: z.string().optional(),
	/** Whether this tab is the currently active one. */
	isCurrent: z.boolean().default(false),
})

export type SiblingTabInfo = z.infer<typeof siblingTabInfoSchema>

/**
 * A single distilled fact/decision extracted from a tab's conversation,
 * shared with sibling tabs in the same session.
 */
export const sessionKnowledgeNoteSchema = z.object({
	id: z.string(),
	/** Task that produced this note. */
	sourceTaskId: z.string(),
	/** Epoch millis when the note was created. */
	createdAt: z.number(),
	/** The distilled fact/decision (capped at ~1KB each). */
	text: z.string(),
})

export type SessionKnowledgeNote = z.infer<typeof sessionKnowledgeNoteSchema>

/**
 * The persisted shared-context document for one session.
 */
export const sharedSessionContextSchema = z.object({
	sessionId: z.string(),
	/** Epoch millis of the last update. */
	updatedAt: z.number(),
	/** Auto-extracted knowledge notes, deduped and capped. */
	knowledge: z.array(sessionKnowledgeNoteSchema).default([]),
	/** User-curated markdown notes. */
	notes: z.string().default(""),
})

export type SharedSessionContext = z.infer<typeof sharedSessionContextSchema>

/**
 * Scope filter for the read_session_context tool.
 */
export const sessionContextScopeSchema = z.enum(["siblings", "knowledge", "notes", "all"]).default("all")

export type SessionContextScope = z.infer<typeof sessionContextScopeSchema>

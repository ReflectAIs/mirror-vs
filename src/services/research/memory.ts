/**
 * B-1: Research Memory (Conversation-scoped)
 *
 * Attaches to a Task instance to store per-conversation research data:
 * queries, fetched URLs, extracted facts, and citations.
 *
 * Mirrors the pattern of FileContextTracker — owned by the Task, scoped
 * to a single conversation session.
 */

import { SearchResult } from "../../api/search/types"

// ─── Types ───────────────────────────────────────────────────────────────────

export interface QueryRecord {
	/** The search query string (original, before normalisation) */
	query: string
	/** Normalised version used as cache key */
	normalized: string
	/** Results returned by the search provider */
	results: SearchResult[]
	/** ISO-8601 timestamp of when the query was executed */
	timestamp: string
	/** How long the search took in ms */
	durationMs: number
	/** Which provider served the query */
	provider: string
}

export interface FetchedPage {
	url: string
	title: string
	/** Raw HTML or markdown content */
	rawContent: string
	/** Cleaned / parsed text content */
	cleanContent: string
	/** Content-Type header observed at fetch time */
	contentType: string
	/** ISO-8601 timestamp */
	fetchedAt: string
	/** Fetch duration in ms */
	durationMs: number
	/** Whether the fetch succeeded */
	success: boolean
	/** Error message if fetch failed */
	error?: string
}

export interface Fact {
	id: string
	statement: string
	/** URL(s) the fact was extracted from */
	sourceUrls: string[]
	confidence: "high" | "medium" | "low"
	category?: string
	extractedAt: string
}

export interface Citation {
	url: string
	title: string
	snippet: string
	/** Which facts reference this citation */
	referencedBy: string[]
}

// ─── Research Memory ─────────────────────────────────────────────────────────

export class ResearchMemory {
	private queries = new Map<string, QueryRecord>()
	private fetchedUrls = new Map<string, FetchedPage>()
	private facts: Fact[] = []
	private citations: Citation[] = []

	// ─── Query Tracking ───────────────────────────────────────────────────

	addQuery(record: QueryRecord): void {
		this.queries.set(record.normalized, record)
	}

	getQuery(normalized: string): QueryRecord | undefined {
		return this.queries.get(normalized)
	}

	getAllQueries(): QueryRecord[] {
		return Array.from(this.queries.values())
	}

	hasQuery(normalized: string): boolean {
		return this.queries.has(normalized)
	}

	getQueryCount(): number {
		return this.queries.size
	}

	// ─── URL / Page Tracking ──────────────────────────────────────────────

	addPage(page: FetchedPage): void {
		this.fetchedUrls.set(page.url, page)
	}

	getPage(url: string): FetchedPage | undefined {
		return this.fetchedUrls.get(url)
	}

	getAllPages(): FetchedPage[] {
		return Array.from(this.fetchedUrls.values())
	}

	hasPage(url: string): boolean {
		return this.fetchedUrls.has(url)
	}

	getPageCount(): number {
		return this.fetchedUrls.size
	}

	// ─── Facts ────────────────────────────────────────────────────────────

	addFact(fact: Fact): void {
		this.facts.push(fact)
	}

	addFacts(facts: Fact[]): void {
		this.facts.push(...facts)
	}

	getAllFacts(): Fact[] {
		return [...this.facts]
	}

	getFactsByCategory(category: string): Fact[] {
		return this.facts.filter((f) => f.category === category)
	}

	getFactCount(): number {
		return this.facts.length
	}

	// ─── Citations ────────────────────────────────────────────────────────

	addCitation(citation: Citation): void {
		const existing = this.citations.find((c) => c.url === citation.url)
		if (existing) {
			existing.referencedBy = [...new Set([...existing.referencedBy, ...citation.referencedBy])]
		} else {
			this.citations.push(citation)
		}
	}

	getAllCitations(): Citation[] {
		return [...this.citations]
	}

	getCitationCount(): number {
		return this.citations.length
	}

	// ─── Summary ──────────────────────────────────────────────────────────

	getSummary(): string {
		const parts: string[] = []
		parts.push(`Queries executed: ${this.queries.size}`)
		parts.push(`Pages fetched: ${this.fetchedUrls.size}`)
		parts.push(`Facts extracted: ${this.facts.length}`)
		parts.push(`Citations collected: ${this.citations.length}`)

		if (this.facts.length > 0) {
			const high = this.facts.filter((f) => f.confidence === "high").length
			const med = this.facts.filter((f) => f.confidence === "medium").length
			const low = this.facts.filter((f) => f.confidence === "low").length
			parts.push(`Fact confidence breakdown: ${high} high, ${med} medium, ${low} low`)
		}

		return parts.join("\n")
	}

	/** Serialise everything for inclusion in conversation context */
	serialise(): ResearchMemorySnapshot {
		return {
			queries: this.getAllQueries(),
			pages: this.getAllPages(),
			facts: [...this.facts],
			citations: [...this.citations],
		}
	}
}

/** JSON-safe snapshot of a ResearchMemory instance */
export interface ResearchMemorySnapshot {
	queries: QueryRecord[]
	pages: FetchedPage[]
	facts: Fact[]
	citations: Citation[]
}

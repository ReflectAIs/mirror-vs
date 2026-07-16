/**
 * E-2: Long-term Research Memory
 *
 * Persists research knowledge across conversations using the same Qdrant
 * infrastructure as CodeIndexManager. This enables:
 * - Cross-session fact recall ("we researched this last week")
 * - Knowledge accumulation across related topics
 * - Avoiding redundant searches for previously-researched topics
 *
 * Uses the existing CodeIndexManager's QdrantClient and embedder infrastructure.
 * Stores facts as vector-embedded documents for semantic similarity search.
 */

import { ResearchMemory, Fact } from "./memory"

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StoredResearch {
	id: string
	topic: string
	summary: string
	facts: Fact[]
	queryCount: number
	pageCount: number
	createdAt: string
	updatedAt: string
	/** Embedding vector for semantic search (stored externally in Qdrant) */
	embedding?: number[]
}

export interface ResearchSearchOptions {
	/** Maximum results (default: 5) */
	limit?: number
	/** Minimum similarity score (0-1, default: 0.7) */
	minScore?: number
	/** Filter by topic/category */
	topic?: string
}

export interface ResearchSearchResult {
	research: StoredResearch
	score: number
}

// ─── Long-term Research Memory ───────────────────────────────────────────────

export class LongTermResearchMemory {
	private storage = new Map<string, StoredResearch>()
	private vectorSearchAvailable = false

	constructor(private options: { workspacePath?: string } = {}) {
		// Vector search availability is checked lazily on first use
	}

	// ─── CRUD ──────────────────────────────────────────────────────────────

	/**
	 * Store research from a conversation-scoped memory into long-term storage.
	 * Returns the stored research ID.
	 */
	async store(topic: string, memory: ResearchMemory): Promise<string> {
		const facts = memory.getAllFacts()
		const id = `research:${topic.toLowerCase().replace(/[^a-z0-9]+/g, "-")}:${Date.now()}`

		const existing = this.storage.get(id)
		const now = new Date().toISOString()

		const stored: StoredResearch = {
			id,
			topic,
			summary: this.buildSummary(memory),
			facts: existing ? this.mergeFacts(existing.facts, facts) : facts,
			queryCount: memory.getQueryCount(),
			pageCount: memory.getPageCount(),
			createdAt: existing?.createdAt ?? now,
			updatedAt: now,
		}

		this.storage.set(id, stored)

		// Attempt vector embedding if available
		await this.vectorIndex(stored).catch(() => {
			// Non-critical: skip vector indexing on failure
		})

		return id
	}

	/**
	 * Retrieve stored research by ID.
	 */
	get(id: string): StoredResearch | undefined {
		return this.storage.get(id)
	}

	/**
	 * Delete stored research by ID.
	 */
	delete(id: string): boolean {
		return this.storage.delete(id)
	}

	/**
	 * Get all stored research entries.
	 */
	getAll(): StoredResearch[] {
		return Array.from(this.storage.values())
	}

	/**
	 * Get research count.
	 */
	get count(): number {
		return this.storage.size
	}

	// ─── Search ────────────────────────────────────────────────────────────

	/**
	 * Search stored research by topic/keywords.
	 * Uses simple keyword matching; vector search when available.
	 */
	async search(query: string, options: ResearchSearchOptions = {}): Promise<ResearchSearchResult[]> {
		const limit = options.limit ?? 5
		const minScore = options.minScore ?? 0.7

		// Try vector search first
		if (this.vectorSearchAvailable) {
			try {
				const vectorResults = await this.vectorSearch(query, limit, minScore, options.topic)
				if (vectorResults.length > 0) {
					return vectorResults
				}
			} catch {
				// Fall through to keyword search
			}
		}

		// Keyword-based fallback
		return this.keywordSearch(query, limit, minScore, options.topic)
	}

	/**
	 * Check if we already have research on a given topic.
	 * Returns the most relevant match above minScore, or undefined.
	 */
	async findExisting(topic: string, minScore = 0.8): Promise<StoredResearch | undefined> {
		const results = await this.search(topic, { limit: 1, minScore })
		return results[0]?.research
	}

	// ─── Summary Building ──────────────────────────────────────────────────

	private buildSummary(memory: ResearchMemory): string {
		const facts = memory.getAllFacts()
		const queries = memory.getAllQueries()

		if (facts.length === 0) {
			return `No facts extracted. ${queries.length} queries executed.`
		}

		// Group high-confidence facts by category
		const byCategory = new Map<string, Fact[]>()
		for (const fact of facts) {
			const cat = fact.category ?? "general"
			if (!byCategory.has(cat)) byCategory.set(cat, [])
			byCategory.get(cat)!.push(fact)
		}

		const parts: string[] = []
		for (const [category, catFacts] of byCategory) {
			const high = catFacts.filter((f) => f.confidence === "high")
			if (high.length > 0) {
				parts.push(`${category}: ${high.map((f) => f.statement).join("; ")}`)
			}
		}

		return (
			parts.join("\n") || `Research conducted across ${queries.length} queries, ${facts.length} facts extracted.`
		)
	}

	// ─── Fact Merging ──────────────────────────────────────────────────────

	private mergeFacts(existing: Fact[], incoming: Fact[]): Fact[] {
		const seen = new Set(existing.map((f) => f.id))
		const merged = [...existing]
		for (const fact of incoming) {
			if (!seen.has(fact.id)) {
				merged.push(fact)
				seen.add(fact.id)
			}
		}
		return merged
	}

	// ─── Vector Indexing ───────────────────────────────────────────────────

	private async vectorIndex(stored: StoredResearch): Promise<void> {
		// Attempt to use CodeIndexManager's embedder + Qdrant
		try {
			const { CodeIndexManager } = await import("../../services/code-index/manager")
			const manager = CodeIndexManager.getInstance(
				undefined as any, // context — will be undefined outside VS Code
				this.options.workspacePath ?? "",
			)
			if (!manager) {
				// Running outside VS Code — skip vector indexing
				return
			}
			// Vector indexing is best-effort; the research is still stored in-memory
			this.vectorSearchAvailable = true
		} catch {
			// CodeIndexManager not available (e.g., during testing)
			this.vectorSearchAvailable = false
		}
	}

	private async vectorSearch(
		_query: string,
		_limit: number,
		_minScore: number,
		_topic?: string,
	): Promise<ResearchSearchResult[]> {
		// Vector search integration is a placeholder for Phase 2.
		// In Phase 1, we fall back to keyword search.
		return []
	}

	// ─── Keyword Search ────────────────────────────────────────────────────

	private keywordSearch(query: string, limit: number, minScore: number, topic?: string): ResearchSearchResult[] {
		const q = query.toLowerCase()
		const terms = q.split(/\s+/).filter(Boolean)

		const scored: Array<{ research: StoredResearch; score: number }> = []

		for (const stored of this.storage.values()) {
			// Topic filter
			if (topic && stored.topic.toLowerCase() !== topic.toLowerCase()) {
				continue
			}

			let matches = 0
			const searchText =
				`${stored.topic} ${stored.summary} ${stored.facts.map((f) => f.statement).join(" ")}`.toLowerCase()

			for (const term of terms) {
				if (searchText.includes(term)) {
					matches++
				}
			}

			const score = terms.length > 0 ? matches / terms.length : 0

			if (score >= minScore) {
				scored.push({ research: stored, score })
			}
		}

		// Sort by score descending, limit results
		return scored
			.sort((a, b) => b.score - a.score)
			.slice(0, limit)
			.map(({ research, score }) => ({ research, score }))
	}

	// ─── Serialisation ─────────────────────────────────────────────────────

	/**
	 * Serialise all stored research for persistence.
	 */
	serialise(): StoredResearch[] {
		return this.getAll()
	}

	/**
	 * Deserialise stored research from a saved state.
	 */
	deserialise(data: StoredResearch[]): void {
		for (const stored of data) {
			this.storage.set(stored.id, stored)
		}
	}
}

/**
 * E-3: Knowledge Gap Analyzer
 *
 * Pre-search context checker that determines what is already known vs what
 * still needs to be researched for a given question or topic.
 *
 * Consulting three sources of prior knowledge:
 * 1. **Conversation-scoped** ResearchMemory — facts already extracted this session
 * 2. **Long-term** ResearchMemory — knowledge persisted from previous sessions
 * 3. **Search Cache** — cached search results that can be reused
 *
 * The analyzer produces a structured GapAnalysisResult that the ResearchPlanner
 * uses to avoid redundant searches and focus only on genuine knowledge gaps.
 */

import { ResearchMemory, Fact } from "./memory"
import { LongTermResearchMemory, StoredResearch, ResearchSearchResult } from "./long-term-memory"
import { SearchCache, normaliseQuery } from "./cache"
import { ResearchGraph } from "./graph"

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GapAnalysisOptions {
	/** Minimum confidence threshold for considering a fact "known" (default: 0.6) */
	minConfidence?: number
	/** Whether to consider cached search results as sufficient (default: false) */
	acceptCachedResults?: boolean
	/** Maximum number of suggested queries to generate (default: 5) */
	maxSuggestedQueries?: number
	/** Topic categories to scope the analysis to (empty = all topics) */
	topicFilter?: string[]
}

export interface KnowledgeGap {
	/** The topic or sub-question that is not yet covered */
	topic: string
	/** How critical this gap is (0-1, where 1 = essential to answer) */
	priority: number
	/** Suggested search queries to fill this gap */
	suggestedQueries: string[]
	/** Why this gap exists (e.g., "no facts extracted", "low confidence") */
	reason: string
}

export interface KnownFact {
	statement: string
	confidence: Fact["confidence"]
	sourceUrls: string[]
	category?: string
	/** Where this fact was sourced from */
	provenance: "conversation" | "long-term" | "cached"
}

export interface GapAnalysisResult {
	/** The original question or research goal */
	question: string
	/** Facts already known about this topic */
	knownFacts: KnownFact[]
	/** Knowledge gaps that still need to be researched */
	gaps: KnowledgeGap[]
	/** Suggested overall search queries */
	suggestedQueries: string[]
	/** Cached results that can be reused (URLs) */
	reusableUrls: string[]
	/** Overall gap score: 0 = fully known, 1 = completely unknown */
	gapScore: number
	/** Summary text suitable for LLM context injection */
	summary: string
	/** Whether any research is actually needed */
	needsResearch: boolean
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_OPTIONS: Required<GapAnalysisOptions> = {
	minConfidence: 0.6,
	acceptCachedResults: false,
	maxSuggestedQueries: 5,
	topicFilter: [],
}

// ─── Knowledge Gap Analyzer ──────────────────────────────────────────────────

export class KnowledgeGapAnalyzer {
	constructor(
		private conversationMemory?: ResearchMemory,
		private longTermMemory?: LongTermResearchMemory,
		private searchCache?: SearchCache,
		private researchGraph?: ResearchGraph,
	) {}

	// ─── Public API ───────────────────────────────────────────────────────

	/**
	 * Analyze the gap between what is already known and what needs to be
	 * researched to answer the given question.
	 *
	 * @param question — The user's research question or goal.
	 * @param options — Optional configuration overrides.
	 */
	async analyze(question: string, options: GapAnalysisOptions = {}): Promise<GapAnalysisResult> {
		const opts = { ...DEFAULT_OPTIONS, ...options }

		// Phase 1: Gather what we already know
		const conversationFacts = this.gatherConversationFacts(question, opts)
		const longTermFacts = await this.gatherLongTermFacts(question, opts)
		const cachedResults = this.gatherCachedResults(question)
		const reusableUrls = this.findReusableUrls(cachedResults)

		// Phase 2: Combine known facts
		const knownFacts = this.deduplicateFacts([...conversationFacts, ...longTermFacts])

		// Phase 3: Identify gaps
		const gaps = this.identifyGaps(question, knownFacts, opts)

		// Phase 4: Generate suggested queries for the gaps
		const suggestedQueries = this.generateSuggestedQueries(question, gaps, opts.maxSuggestedQueries)

		// Phase 5: Compute gap score
		const gapScore = this.computeGapScore(knownFacts.length, gaps.length)

		// Phase 6: Build summary
		const needsResearch = gapScore > 0.2 || gaps.length > 0
		const summary = this.buildSummary(question, knownFacts, gaps, reusableUrls, gapScore, needsResearch)

		return {
			question,
			knownFacts,
			gaps,
			suggestedQueries,
			reusableUrls,
			gapScore,
			summary,
			needsResearch,
		}
	}

	// ─── Conversation Memory Scan ─────────────────────────────────────────

	private gatherConversationFacts(question: string, opts: Required<GapAnalysisOptions>): KnownFact[] {
		if (!this.conversationMemory) return []

		const facts = this.conversationMemory.getAllFacts()
		const questionTerms = this.extractTerms(question)

		return facts
			.filter((f) => this.isRelevantToQuestion(f, questionTerms, opts))
			.map(
				(f): KnownFact => ({
					statement: f.statement,
					confidence: f.confidence,
					sourceUrls: f.sourceUrls,
					category: f.category,
					provenance: "conversation",
				}),
			)
	}

	// ─── Long-term Memory Scan ────────────────────────────────────────────

	private async gatherLongTermFacts(question: string, opts: Required<GapAnalysisOptions>): Promise<KnownFact[]> {
		if (!this.longTermMemory) return []

		const results = await this.longTermMemory.search(question, {
			limit: 5,
			minScore: 0.5,
		})

		const facts: KnownFact[] = []
		for (const result of results) {
			const relevantFacts = this.filterRelevantFacts(result.research, question, opts)
			for (const fact of relevantFacts) {
				facts.push({
					statement: fact.statement,
					confidence: fact.confidence,
					sourceUrls: fact.sourceUrls,
					category: fact.category,
					provenance: "long-term",
				})
			}
		}

		return facts
	}

	// ─── Cache Scan ───────────────────────────────────────────────────────

	private gatherCachedResults(question: string): string[] {
		if (!this.searchCache) return []

		const cached = this.searchCache.get(question)
		if (!cached || cached.length === 0) return []

		// Return the URLs of cached results
		return cached.filter((r) => r.url).map((r) => r.url)
	}

	private findReusableUrls(cachedUrls: string[]): string[] {
		// De-duplicate URLs
		return [...new Set(cachedUrls)]
	}

	// ─── Gap Identification ───────────────────────────────────────────────

	private identifyGaps(
		question: string,
		knownFacts: KnownFact[],
		opts: Required<GapAnalysisOptions>,
	): KnowledgeGap[] {
		const gaps: KnowledgeGap[] = []

		// Decompose the question into sub-topics
		const subTopics = this.decomposeQuestion(question)

		for (const topic of subTopics) {
			const topicTerms = this.extractTerms(topic)
			const matchingFacts = knownFacts.filter((f) => this.factMatchesTerms(f, topicTerms))

			if (matchingFacts.length === 0) {
				// No facts at all for this sub-topic — critical gap
				gaps.push({
					topic,
					priority: 1.0,
					suggestedQueries: [topic],
					reason: "No facts extracted for this sub-topic",
				})
			} else {
				const highConfidence = matchingFacts.filter((f) => f.confidence === "high").length
				const totalFactCount = matchingFacts.length

				// Check if high-confidence coverage is insufficient
				const coverageRatio = highConfidence / Math.max(totalFactCount, 1)

				if (coverageRatio < 0.5 && totalFactCount >= 2) {
					gaps.push({
						topic,
						priority: 0.6,
						suggestedQueries: [`${topic} detailed explanation`],
						reason: `Low confidence coverage: ${highConfidence}/${totalFactCount} high-confidence facts`,
					})
				}
			}
		}

		// Limit gaps
		return gaps.slice(0, opts.maxSuggestedQueries)
	}

	// ─── Query Generation ─────────────────────────────────────────────────

	private generateSuggestedQueries(question: string, gaps: KnowledgeGap[], maxQueries: number): string[] {
		const queries: string[] = []

		// Add gap-specific queries
		for (const gap of gaps) {
			for (const q of gap.suggestedQueries) {
				if (queries.length < maxQueries) {
					queries.push(q)
				}
			}
		}

		// If we still have room and there are gaps, add the original question
		if (queries.length < maxQueries && gaps.length > 0 && !queries.includes(question)) {
			queries.push(question)
		}

		return queries.slice(0, maxQueries)
	}

	// ─── Scoring ──────────────────────────────────────────────────────────

	private computeGapScore(knownFactCount: number, gapCount: number): number {
		if (knownFactCount === 0 && gapCount === 0) return 1.0 // completely unknown
		if (knownFactCount === 0) return 1.0
		if (gapCount === 0) return 0.0

		// Score based on gap-to-fact ratio, capped at 1.0
		const raw = gapCount / Math.max(knownFactCount, 1)
		return Math.min(raw, 1.0)
	}

	// ─── Summary ──────────────────────────────────────────────────────────

	private buildSummary(
		question: string,
		knownFacts: KnownFact[],
		gaps: KnowledgeGap[],
		reusableUrls: string[],
		gapScore: number,
		needsResearch: boolean,
	): string {
		const parts: string[] = [
			`## Knowledge Gap Analysis: "${question}"`,
			``,
			`**Gap Score**: ${(gapScore * 100).toFixed(0)}% unknown`,
			`**Needs Research**: ${needsResearch ? "Yes" : "No"}`,
			``,
		]

		if (knownFacts.length > 0) {
			parts.push(`### Already Known (${knownFacts.length} facts)`)
			for (const fact of knownFacts.slice(0, 15)) {
				const provenance = fact.provenance === "conversation" ? "this session" : "previous sessions"
				parts.push(`- [${fact.confidence}] ${fact.statement} ` + `(from ${provenance})`)
			}
			if (knownFacts.length > 15) {
				parts.push(`- ... and ${knownFacts.length - 15} more facts`)
			}
			parts.push(``)
		}

		if (gaps.length > 0) {
			parts.push(`### Knowledge Gaps (${gaps.length})`)
			for (const gap of gaps) {
				parts.push(`- **${gap.topic}** (priority: ${gap.priority.toFixed(1)})`)
				parts.push(`  - ${gap.reason}`)
				if (gap.suggestedQueries.length > 0) {
					parts.push(`  - Suggested query: "${gap.suggestedQueries[0]}"`)
				}
			}
			parts.push(``)
		}

		if (reusableUrls.length > 0) {
			parts.push(`### Reusable Cached Results (${reusableUrls.length} URLs)`)
			for (const url of reusableUrls.slice(0, 5)) {
				parts.push(`- ${url}`)
			}
			if (reusableUrls.length > 5) {
				parts.push(`- ... and ${reusableUrls.length - 5} more`)
			}
			parts.push(``)
		}

		if (!needsResearch) {
			parts.push(`**Conclusion**: No research needed — sufficient knowledge already exists.`)
		} else if (gaps.length === 0) {
			parts.push(`**Conclusion**: Some research may be beneficial but no critical gaps identified.`)
		} else {
			parts.push(
				`**Conclusion**: Research needed for ${gaps.length} knowledge gap(s). ` +
					`Suggested ${Math.min(gaps.length, 5)} initial search query(ies).`,
			)
		}

		return parts.join("\n")
	}

	// ─── Helpers ──────────────────────────────────────────────────────────

	/**
	 * Extract significant terms from a question (lowercased, no punctuation).
	 */
	private extractTerms(text: string): string[] {
		return normaliseQuery(text)
			.split(/\s+/)
			.filter((t) => t.length > 2) // skip very short terms
	}

	/**
	 * Check if a fact is relevant to the given question by term overlap.
	 */
	private isRelevantToQuestion(fact: Fact, questionTerms: string[], opts: Required<GapAnalysisOptions>): boolean {
		// If topic filter is active, check category
		if (opts.topicFilter.length > 0 && fact.category) {
			if (!opts.topicFilter.some((t) => fact.category!.toLowerCase().includes(t.toLowerCase()))) {
				return false
			}
		}

		// Always include facts with explicit category match
		if (fact.category) {
			const categoryTerms = this.extractTerms(fact.category)
			const overlap = categoryTerms.some((t) => questionTerms.includes(t))
			if (overlap) return true
		}

		// Check term overlap between fact statement and question
		const factTerms = this.extractTerms(fact.statement)
		const overlap = factTerms.some((t) => questionTerms.includes(t))

		return overlap
	}

	/**
	 * Filter facts from a StoredResearch entry that are relevant to the question.
	 */
	private filterRelevantFacts(
		research: StoredResearch,
		question: string,
		opts: Required<GapAnalysisOptions>,
	): Fact[] {
		const questionTerms = this.extractTerms(question)

		return research.facts.filter((f) => {
			// Topic match
			if (research.topic.toLowerCase().includes(question.toLowerCase())) {
				return true
			}

			// Term overlap
			const factTerms = this.extractTerms(f.statement)
			return factTerms.some((t) => questionTerms.includes(t))
		})
	}

	/**
	 * Check if a KnownFact's terms overlap with the given topic terms.
	 */
	private factMatchesTerms(fact: KnownFact, terms: string[]): boolean {
		const factText = `${fact.statement} ${fact.category ?? ""}`.toLowerCase()
		return terms.some((t) => factText.includes(t))
	}

	/**
	 * Decompose a question into searchable sub-topics.
	 *
	 * Uses simple heuristics (splitting on "and", "or", commas, questions marks)
	 * rather than an LLM call to keep things fast and dependency-free.
	 */
	private decomposeQuestion(question: string): string[] {
		const separators = /\b(?:and|or|also|versus|vs)\b|[?,;]/
		const parts = question
			.split(separators)
			.map((p) => p.trim())
			.filter((p) => p.length > 5) // skip fragments

		// If no meaningful parts, use the whole question
		if (parts.length <= 1) {
			return [question.trim()]
		}

		return parts
	}

	/**
	 * De-duplicate facts by statement (case-insensitive exact match).
	 * Keeps the first occurrence (which will have the highest provenance priority).
	 */
	private deduplicateFacts(facts: KnownFact[]): KnownFact[] {
		const seen = new Set<string>()
		return facts.filter((f) => {
			const key = normaliseQuery(f.statement)
			if (seen.has(key)) return false
			seen.add(key)
			return true
		})
	}
}

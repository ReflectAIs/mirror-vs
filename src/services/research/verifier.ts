/**
 * C-5: Verification Engine
 *
 * Cross-references facts across multiple sources to determine confidence.
 *
 * - If sources agree → high confidence
 * - If conflicting → present uncertainty with both claims and flag the conflict
 * - Uses text similarity (levenshtein / overlap) + LLM-based agreement checking
 *
 * The LLM-based verifier is optional — the rule-based path runs first and
 * only delegates to the LLM for ambiguous cases.
 */

import { Fact } from "./memory"
import { compareTwoStrings } from "string-similarity"

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VerificationResult {
	/** The fact that was checked */
	fact: Fact
	/** How many sources support this fact */
	supportingSources: number
	/** How many sources contradict this fact */
	contradictingSources: number
	/** Normalised confidence based on agreement */
	confidence: "high" | "medium" | "low" | "conflicting"
	/** Conflicting claims (if any) */
	conflicts: Conflict[]
	/** Sources that corroborate this fact */
	corroboratingUrls: string[]
}

export interface Conflict {
	/** The conflicting statement */
	statement: string
	/** Source URL(s) for the conflicting statement */
	sourceUrls: string[]
	/** Nature of the conflict */
	nature: "direct_contradiction" | "partial_disagreement" | "different_scope"
}

/** Callback for LLM-based verification (optional) */
export type LlmVerifier = (systemPrompt: string, userPrompt: string) => Promise<string>

// ─── Similarity Thresholds ───────────────────────────────────────────────────

/** Statements above this similarity are considered "same" */
const SAME_THRESHOLD = 0.85
/** Statements below this similarity are considered "unrelated" */
const UNRELATED_THRESHOLD = 0.3
/** Statements between thresholds with same category need LLM check */

// ─── Verification Engine ─────────────────────────────────────────────────────

export class VerificationEngine {
	private llm?: LlmVerifier
	private systemPrompt: string

	constructor(llm?: LlmVerifier, systemPrompt?: string) {
		this.llm = llm
		this.systemPrompt =
			systemPrompt ??
			`You are a fact verification assistant. Compare the following two statements and determine if they agree, contradict, or discuss different aspects of the same topic.

Respond with exactly one word: "agree", "contradict", or "unrelated".`
	}

	/**
	 * Verify a set of facts against each other.
	 * Groups facts by category, then checks for agreement within each group.
	 */
	async verifyFacts(facts: Fact[]): Promise<VerificationResult[]> {
		const results: VerificationResult[] = []

		// Group facts by category for within-category comparison
		const byCategory = new Map<string, Fact[]>()
		for (const fact of facts) {
			const cat = fact.category ?? "general"
			if (!byCategory.has(cat)) byCategory.set(cat, [])
			byCategory.get(cat)!.push(fact)
		}

		for (const [, categoryFacts] of byCategory) {
			const result = await this.verifyCategory(categoryFacts)
			results.push(...result)
		}

		return results
	}

	/**
	 * Verify facts within a single category.
	 */
	private async verifyCategory(facts: Fact[]): Promise<VerificationResult[]> {
		if (facts.length === 0) return []
		if (facts.length === 1) {
			// Single fact — can't cross-reference
			return [
				{
					fact: facts[0],
					supportingSources: 1,
					contradictingSources: 0,
					confidence: "medium",
					conflicts: [],
					corroboratingUrls: facts[0].sourceUrls,
				},
			]
		}

		const results: VerificationResult[] = []

		for (let i = 0; i < facts.length; i++) {
			const fact = facts[i]
			const supportingUrls = new Set<string>(fact.sourceUrls)
			const conflicts: Conflict[] = []

			for (let j = 0; j < facts.length; j++) {
				if (i === j) continue
				const other = facts[j]

				const similarity = this.calculateSimilarity(fact.statement, other.statement)

				if (similarity >= SAME_THRESHOLD) {
					// Same fact — add sources
					for (const url of other.sourceUrls) supportingUrls.add(url)
				} else if (similarity > UNRELATED_THRESHOLD) {
					// Potentially related — check for conflict
					const relation = await this.checkRelation(fact, other)

					if (relation === "contradict") {
						conflicts.push({
							statement: other.statement,
							sourceUrls: other.sourceUrls,
							nature: "direct_contradiction",
						})
					}
				}
			}

			const result = this.buildResult(fact, supportingUrls, conflicts, facts.length)
			results.push(result)
		}

		return results
	}

	/**
	 * Calculate text similarity between two statements (0–1).
	 */
	private calculateSimilarity(a: string, b: string): number {
		return compareTwoStrings(a.toLowerCase(), b.toLowerCase())
	}

	/**
	 * Check the relationship between two facts.
	 * Uses LLM for ambiguous cases, rule-based for clear matches.
	 */
	private async checkRelation(a: Fact, b: Fact): Promise<"agree" | "contradict" | "unrelated"> {
		const similarity = this.calculateSimilarity(a.statement, b.statement)

		// Clear cases
		if (similarity >= SAME_THRESHOLD) return "agree"
		if (similarity < UNRELATED_THRESHOLD) return "unrelated"

		// Ambiguous — use LLM if available
		if (this.llm) {
			try {
				const prompt = `Statement A: "${a.statement}"\nStatement B: "${b.statement}"\n\nDo these statements agree, contradict, or are they unrelated?`
				const response = await this.llm(this.systemPrompt, prompt)
				const trimmed = response.trim().toLowerCase()

				if (trimmed.includes("agree")) return "agree"
				if (trimmed.includes("contradict")) return "contradict"
				return "unrelated"
			} catch {
				// Fall back to rule-based on LLM failure
				return "unrelated"
			}
		}

		// Without LLM, be conservative — mark as unrelated
		return "unrelated"
	}

	/**
	 * Build a VerificationResult from the collected data.
	 */
	private buildResult(
		fact: Fact,
		supportingUrls: Set<string>,
		conflicts: Conflict[],
		totalFacts: number,
	): VerificationResult {
		const numSupporting = supportingUrls.size
		const hasConflicts = conflicts.length > 0

		let confidence: VerificationResult["confidence"]

		if (hasConflicts) {
			confidence = "conflicting"
		} else if (numSupporting >= 3 && totalFacts >= 2) {
			confidence = "high"
		} else if (numSupporting >= 2) {
			confidence = "medium"
		} else {
			confidence = "low"
		}

		return {
			fact,
			supportingSources: numSupporting,
			contradictingSources: conflicts.length,
			confidence,
			conflicts,
			corroboratingUrls: Array.from(supportingUrls),
		}
	}

	/**
	 * Generate a human-readable verification summary.
	 */
	generateSummary(results: VerificationResult[]): string {
		const high = results.filter((r) => r.confidence === "high").length
		const medium = results.filter((r) => r.confidence === "medium").length
		const low = results.filter((r) => r.confidence === "low").length
		const conflicting = results.filter((r) => r.confidence === "conflicting").length

		const parts: string[] = [
			`## Verification Summary`,
			``,
			`- **High confidence**: ${high} facts`,
			`- **Medium confidence**: ${medium} facts`,
			`- **Low confidence**: ${low} facts`,
			`- **Conflicting**: ${conflicting} facts`,
			``,
		]

		if (conflicting > 0) {
			parts.push(`### ⚠️ Conflicting Facts`)
			parts.push(``)
			for (const result of results) {
				if (result.confidence === "conflicting") {
					parts.push(`- **${result.fact.statement}**`)
					for (const conflict of result.conflicts) {
						parts.push(`  - ⚡ _Contradicted by_: "${conflict.statement}"`)
						parts.push(`    - Sources: ${conflict.sourceUrls.join(", ")}`)
					}
					parts.push(``)
				}
			}
		}

		return parts.join("\n")
	}
}

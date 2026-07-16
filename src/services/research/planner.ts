/**
 * B-3: Research Planner
 *
 * Transforms a user's research question into a structured research plan
 * with decomposed sub-queries, priority ordering, source preferences,
 * and freshness requirements.
 *
 * The planner delegates LLM calls to a caller-provided function so it
 * remains agnostic of the exact API handler / provider being used.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type SourceType = "web" | "news" | "docs" | "github" | "npm" | "pypi" | "cargo"

export interface ResearchPlan {
	/** The original research goal / question */
	goal: string
	/**
	 * Decomposed sub-queries that should be searched independently.
	 * Ordered by priority (most important first).
	 */
	queries: ResearchSubQuery[]
	/** Whether the planner determined verification is needed */
	needsVerification: boolean
	/**
	 * Estimated research depth (1 = quick surface look, 5 = deep dive).
	 * The executor can use this to decide how many results to fetch per query.
	 */
	estimatedDepth: number
	/** ISO-8601 duration string for freshness filtering, e.g. "30d", "90d", "1y" */
	freshness?: string
	/** Raw LLM response text (for debugging / logging) */
	rawPlan?: string
}

export interface ResearchSubQuery {
	/** The search query string */
	query: string
	/** Why this query matters — helps the executor prioritise */
	rationale: string
	/** Priority within the plan (1 = highest) */
	priority: number
	/** Preferred source types for this specific query */
	preferredSources: SourceType[]
	/** Max results to fetch for this query (overrides depth-based default) */
	maxResults?: number
	/** Whether this query specifically needs fresh results */
	needsFreshness?: boolean
}

/** Callback type for making the LLM call — accepts a prompt, returns text. */
export type LlmPlanner = (systemPrompt: string, userPrompt: string) => Promise<string>

// ─── Default System Prompt ───────────────────────────────────────────────────

export const DEFAULT_PLANNER_SYSTEM_PROMPT = `You are a research planning assistant. Your job is to decompose a user's research question into a set of targeted search queries that will gather comprehensive information.

Rules:
1. Break complex questions into 2-6 focused sub-queries
2. Each sub-query should target a distinct aspect of the question
3. Order queries by priority (most important first)
4. Set estimatedDepth based on query complexity:
   - 1: Simple fact lookup (e.g., "what is the capital of France")
   - 2-3: Moderate research (e.g., "how does React's reconciliation work")
   - 4-5: Deep dive (e.g., "design a distributed caching system")
5. Set needsVerification=true when the question involves factual claims, numerical data, or comparisons
6. Prefer official sources (docs, github) for technical questions
7. Use freshness constraints for time-sensitive topics (e.g., "latest version", "current trends")

You MUST respond with valid JSON only, using this exact schema:
{
  "queries": [
    {
      "query": "search query string",
      "rationale": "why this query is needed",
      "priority": 1,
      "preferredSources": ["web"],
      "maxResults": 10,
      "needsFreshness": false
    }
  ],
  "needsVerification": false,
  "estimatedDepth": 2,
  "freshness": null
}

Do NOT include any text outside the JSON block.`

// ─── Research Planner ────────────────────────────────────────────────────────

export class ResearchPlanner {
	private llm: LlmPlanner
	private systemPrompt: string

	constructor(llm: LlmPlanner, systemPrompt?: string) {
		this.llm = llm
		this.systemPrompt = systemPrompt ?? DEFAULT_PLANNER_SYSTEM_PROMPT
	}

	/**
	 * Create a research plan for the given question.
	 * Falls back to a single-query plan if the LLM call fails.
	 */
	async plan(question: string): Promise<ResearchPlan> {
		try {
			const raw = await this.llm(this.systemPrompt, question)
			return this.parseResponse(question, raw)
		} catch (error) {
			// Graceful fallback: treat the raw question as a single search
			return this.fallbackPlan(question, error)
		}
	}

	// ─── Private ──────────────────────────────────────────────────────────

	private parseResponse(question: string, raw: string): ResearchPlan {
		// Attempt to extract JSON from the response (handle markdown fences)
		let jsonStr = raw.trim()

		// Strip ```json ... ``` fences if present
		const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
		if (jsonMatch) {
			jsonStr = jsonMatch[1].trim()
		}

		const parsed = JSON.parse(jsonStr)

		if (!parsed.queries || !Array.isArray(parsed.queries) || parsed.queries.length === 0) {
			throw new Error("LLM returned empty queries array")
		}

		const queries: ResearchSubQuery[] = parsed.queries.map((q: Record<string, unknown>, i: number) => ({
			query: String(q.query ?? ""),
			rationale: String(q.rationale ?? ""),
			priority: typeof q.priority === "number" ? q.priority : i + 1,
			preferredSources: Array.isArray(q.preferredSources) ? (q.preferredSources as SourceType[]) : ["web"],
			maxResults: typeof q.maxResults === "number" ? q.maxResults : undefined,
			needsFreshness: Boolean(q.needsFreshness),
		}))

		// Sort by priority
		queries.sort((a, b) => a.priority - b.priority)

		return {
			goal: question,
			queries,
			needsVerification: Boolean(parsed.needsVerification),
			estimatedDepth:
				typeof parsed.estimatedDepth === "number" ? Math.max(1, Math.min(5, parsed.estimatedDepth)) : 2,
			freshness: typeof parsed.freshness === "string" ? parsed.freshness : undefined,
			rawPlan: raw,
		}
	}

	private fallbackPlan(question: string, error: unknown): ResearchPlan {
		console.warn("[ResearchPlanner] LLM call failed, using fallback plan:", error)

		return {
			goal: question,
			queries: [
				{
					query: question,
					rationale: "Original question (fallback — LLM planning failed)",
					priority: 1,
					preferredSources: ["web"],
				},
			],
			needsVerification: false,
			estimatedDepth: 2,
			rawPlan: undefined,
		}
	}
}

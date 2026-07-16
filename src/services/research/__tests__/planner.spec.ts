import { describe, it, expect, vi, beforeEach } from "vitest"
import { ResearchPlanner, DEFAULT_PLANNER_SYSTEM_PROMPT } from "../planner"
import type { LlmPlanner } from "../planner"

describe("DEFAULT_PLANNER_SYSTEM_PROMPT", () => {
	it("should be a non-empty string", () => {
		expect(DEFAULT_PLANNER_SYSTEM_PROMPT).toBeTruthy()
		expect(typeof DEFAULT_PLANNER_SYSTEM_PROMPT).toBe("string")
		expect(DEFAULT_PLANNER_SYSTEM_PROMPT.length).toBeGreaterThan(100)
	})
})

describe("ResearchPlanner", () => {
	let mockLlm: ReturnType<typeof vi.fn>

	beforeEach(() => {
		mockLlm = vi.fn()
	})

	it("should create a plan with decomposed queries from LLM response", async () => {
		const llmResponse = JSON.stringify({
			queries: [
				{
					query: "React hooks tutorial",
					rationale: "Understand hooks basics",
					priority: 1,
					preferredSources: ["web", "docs"],
					maxResults: 10,
					needsFreshness: false,
				},
				{
					query: "React useState vs useEffect",
					rationale: "Compare state and effect hooks",
					priority: 2,
					preferredSources: ["web"],
					maxResults: 5,
					needsFreshness: true,
				},
			],
			needsVerification: true,
			estimatedDepth: 3,
			freshness: "30d",
		})
		mockLlm.mockResolvedValue(llmResponse)

		const planner = new ResearchPlanner(mockLlm as LlmPlanner)
		const plan = await planner.plan("How do React hooks work?")

		expect(plan.goal).toBe("How do React hooks work?")
		expect(plan.queries).toHaveLength(2)
		expect(plan.queries[0].query).toBe("React hooks tutorial")
		expect(plan.queries[0].priority).toBe(1)
		expect(plan.queries[1].query).toBe("React useState vs useEffect")
		expect(plan.queries[1].priority).toBe(2)
		expect(plan.needsVerification).toBe(true)
		expect(plan.estimatedDepth).toBe(3)
		expect(plan.freshness).toBe("30d")
	})

	it("should handle JSON inside markdown code fences", async () => {
		const llmResponse =
			'```json\n{\n  "queries": [\n    {\n      "query": "test query",\n      "rationale": "testing",\n      "priority": 1,\n      "preferredSources": ["web"]\n    }\n  ],\n  "needsVerification": false,\n  "estimatedDepth": 2\n}\n```'
		mockLlm.mockResolvedValue(llmResponse)

		const planner = new ResearchPlanner(mockLlm as LlmPlanner)
		const plan = await planner.plan("test question")

		expect(plan.queries).toHaveLength(1)
		expect(plan.queries[0].query).toBe("test query")
	})

	it("should clamp estimatedDepth to 1-5 range", async () => {
		mockLlm.mockResolvedValue(
			JSON.stringify({
				queries: [{ query: "q", rationale: "r", priority: 1, preferredSources: ["web"] }],
				needsVerification: false,
				estimatedDepth: 99,
			}),
		)

		const planner = new ResearchPlanner(mockLlm as LlmPlanner)
		const plan = await planner.plan("q")
		expect(plan.estimatedDepth).toBe(5)

		mockLlm.mockResolvedValue(
			JSON.stringify({
				queries: [{ query: "q", rationale: "r", priority: 1, preferredSources: ["web"] }],
				needsVerification: false,
				estimatedDepth: 0,
			}),
		)

		const plan2 = await planner.plan("q")
		expect(plan2.estimatedDepth).toBe(1)
	})

	it("should fall back to a single-query plan when LLM throws", async () => {
		mockLlm.mockRejectedValue(new Error("LLM API error"))

		const planner = new ResearchPlanner(mockLlm as LlmPlanner)
		const plan = await planner.plan("simple question")

		expect(plan.queries).toHaveLength(1)
		expect(plan.queries[0].query).toBe("simple question")
		expect(plan.queries[0].priority).toBe(1)
		expect(plan.estimatedDepth).toBe(2)
		expect(plan.needsVerification).toBe(false)
	})

	it("should fall back when LLM returns empty queries array", async () => {
		mockLlm.mockResolvedValue(
			JSON.stringify({
				queries: [],
				needsVerification: false,
				estimatedDepth: 2,
			}),
		)

		const planner = new ResearchPlanner(mockLlm as LlmPlanner)
		const plan = await planner.plan("empty question")

		// Should have fallen back
		expect(plan.queries).toHaveLength(1)
		expect(plan.queries[0].query).toBe("empty question")
	})

	it("should sort queries by priority", async () => {
		mockLlm.mockResolvedValue(
			JSON.stringify({
				queries: [
					{ query: "q2", rationale: "r2", priority: 3, preferredSources: ["web"] },
					{ query: "q1", rationale: "r1", priority: 1, preferredSources: ["web"] },
					{ query: "q3", rationale: "r3", priority: 2, preferredSources: ["web"] },
				],
				needsVerification: false,
				estimatedDepth: 2,
			}),
		)

		const planner = new ResearchPlanner(mockLlm as LlmPlanner)
		const plan = await planner.plan("test")

		expect(plan.queries[0].priority).toBe(1)
		expect(plan.queries[1].priority).toBe(2)
		expect(plan.queries[2].priority).toBe(3)
	})

	it("should pass the system prompt and question to the LLM", async () => {
		mockLlm.mockResolvedValue(
			JSON.stringify({
				queries: [{ query: "q", rationale: "r", priority: 1, preferredSources: ["web"] }],
				needsVerification: false,
				estimatedDepth: 2,
			}),
		)

		const planner = new ResearchPlanner(mockLlm as LlmPlanner)
		await planner.plan("my question")

		expect(mockLlm).toHaveBeenCalledWith(DEFAULT_PLANNER_SYSTEM_PROMPT, "my question")
	})

	it("should use custom system prompt when provided", async () => {
		const customPrompt = "Custom system prompt"
		mockLlm.mockResolvedValue(
			JSON.stringify({
				queries: [{ query: "q", rationale: "r", priority: 1, preferredSources: ["web"] }],
				needsVerification: false,
				estimatedDepth: 2,
			}),
		)

		const planner = new ResearchPlanner(mockLlm as LlmPlanner, customPrompt)
		await planner.plan("question")

		expect(mockLlm).toHaveBeenCalledWith(customPrompt, "question")
	})
})

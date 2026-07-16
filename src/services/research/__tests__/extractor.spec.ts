import { describe, it, expect, vi, beforeEach } from "vitest"
import { InformationExtractor, EXTRACTOR_SYSTEM_PROMPT } from "../extractor"
import type { LlmExtractor } from "../extractor"
import type { ParsedPage } from "../parser"

function makePage(overrides: Partial<ParsedPage> = {}): ParsedPage {
	return {
		title: "Test Page",
		markdown: "This is the page content about React hooks.",
		plainText: "This is the page content about React hooks.",
		excerpt: "This is the page content",
		links: [{ href: "https://react.dev", text: "React Docs" }],
		codeBlocks: [{ language: "typescript", code: "const [count, setCount] = useState(0)" }],
		tables: [],
		readingTimeSec: 30,
		wasTruncated: false,
		metaDescription: "A test page about React",
		...overrides,
	}
}

describe("EXTRACTOR_SYSTEM_PROMPT", () => {
	it("should be a non-empty string", () => {
		expect(EXTRACTOR_SYSTEM_PROMPT).toBeTruthy()
		expect(typeof EXTRACTOR_SYSTEM_PROMPT).toBe("string")
		expect(EXTRACTOR_SYSTEM_PROMPT.length).toBeGreaterThan(200)
	})
})

describe("InformationExtractor", () => {
	let mockLlm: ReturnType<typeof vi.fn>

	beforeEach(() => {
		mockLlm = vi.fn()
	})

	it("should extract structured knowledge from a page", async () => {
		mockLlm.mockResolvedValue(
			JSON.stringify({
				summary: "React hooks are functions that let you use state in functional components.",
				topics: ["react", "hooks", "state"],
				confidence: "high",
				facts: [
					{
						statement: "useState is a React hook for state management",
						category: "api",
						confidence: "high",
					},
				],
				codeExamples: [],
				tables: [],
				apiChanges: [],
				examples: [],
				citations: [],
			}),
		)

		const extractor = new InformationExtractor(mockLlm as LlmExtractor)
		const result = await extractor.extract(makePage(), "https://react.dev")

		expect(result.summary).toContain("React hooks")
		expect(result.topics).toContain("react")
		expect(result.confidence).toBe("high")
		expect(result.facts).toHaveLength(1)
		expect(result.facts[0].statement).toContain("useState")
		expect(result.facts[0].sourceUrls).toContain("https://react.dev")
	})

	it("should handle JSON inside markdown code fences", async () => {
		mockLlm.mockResolvedValue(
			'```json\n{\n  "summary": "test",\n  "topics": [],\n  "confidence": "medium",\n  "facts": [],\n  "codeExamples": [],\n  "tables": [],\n  "apiChanges": [],\n  "examples": [],\n  "citations": []\n}\n```',
		)

		const extractor = new InformationExtractor(mockLlm as LlmExtractor)
		const result = await extractor.extract(makePage(), "https://example.com")

		expect(result.summary).toBe("test")
		expect(result.confidence).toBe("medium")
	})

	it("should fall back to basic extraction when LLM call fails", async () => {
		mockLlm.mockRejectedValue(new Error("LLM error"))

		const extractor = new InformationExtractor(mockLlm as LlmExtractor)
		const page = makePage({ excerpt: "Important excerpt from the page." })
		const result = await extractor.extract(page, "https://example.com")

		// Fallback should use the excerpt as a fact
		expect(result.facts.length).toBeGreaterThanOrEqual(1)
		expect(result.facts[0].statement).toBe("Important excerpt from the page.")
		expect(result.codeExamples).toHaveLength(1)
		expect(result.codeExamples[0].language).toBe("typescript")
		expect(result.citations.length).toBeGreaterThanOrEqual(1)
	})

	it("should pass the system prompt and built user prompt to LLM", async () => {
		mockLlm.mockResolvedValue(
			JSON.stringify({
				summary: "test",
				topics: [],
				confidence: "medium",
				facts: [],
				codeExamples: [],
				tables: [],
				apiChanges: [],
				examples: [],
				citations: [],
			}),
		)

		const extractor = new InformationExtractor(mockLlm as LlmExtractor)
		await extractor.extract(makePage({ title: "React Page" }), "https://react.dev")

		expect(mockLlm).toHaveBeenCalledWith(
			EXTRACTOR_SYSTEM_PROMPT,
			expect.stringContaining("Source URL: https://react.dev"),
		)
		expect(mockLlm).toHaveBeenCalledWith(expect.any(String), expect.stringContaining("React Page"))
	})

	it("should use custom system prompt when provided", async () => {
		const customPrompt = "Custom extraction prompt"
		mockLlm.mockResolvedValue(
			JSON.stringify({
				summary: "test",
				topics: [],
				confidence: "medium",
				facts: [],
				codeExamples: [],
				tables: [],
				apiChanges: [],
				examples: [],
				citations: [],
			}),
		)

		const extractor = new InformationExtractor(mockLlm as LlmExtractor, customPrompt)
		await extractor.extract(makePage(), "https://example.com")

		expect(mockLlm).toHaveBeenCalledWith(customPrompt, expect.any(String))
	})

	it("should generate unique fact IDs with different timestamps", async () => {
		// Two sequential calls should produce different IDs
		mockLlm.mockResolvedValue(
			JSON.stringify({
				summary: "test",
				topics: [],
				confidence: "medium",
				facts: [{ statement: "Fact 1", category: "general", confidence: "high" }],
				codeExamples: [],
				tables: [],
				apiChanges: [],
				examples: [],
				citations: [],
			}),
		)

		const extractor = new InformationExtractor(mockLlm as LlmExtractor)

		// Mock Date.now() to return different values
		const dateSpy = vi.spyOn(Date, "now")
		dateSpy.mockReturnValueOnce(1000)
		const r1 = await extractor.extract(makePage(), "https://a.com")
		dateSpy.mockReturnValueOnce(2000)
		const r2 = await extractor.extract(makePage(), "https://b.com")

		expect(r1.facts[0].id).not.toBe(r2.facts[0].id)
		dateSpy.mockRestore()
	})
})

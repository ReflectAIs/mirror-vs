/**
 * C-3: Information Extractor
 *
 * Converts parsed page content into structured knowledge using LLM-driven
 * extraction. The caller provides an `LlmExtractor` function that wraps
 * whatever LLM provider the extension is currently using.
 *
 * Extracts: facts, code blocks, tables, API changes, examples, citations.
 */

import { ParsedPage } from "./parser"
import { Fact } from "./memory"

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ExtractedKnowledge {
	/** Facts extracted from the page */
	facts: Fact[]
	/** Code examples found */
	codeExamples: CodeExample[]
	/** Tables found */
	tables: TableData[]
	/** API changes / breaking changes mentioned */
	apiChanges: ApiChange[]
	/** Key examples (usage walkthroughs, tutorials) */
	examples: Example[]
	/** All citations / references found */
	citations: Citation[]
	/** Summary of the page (1-2 sentences) */
	summary: string
	/** Key topics / tags */
	topics: string[]
	/** Extraction confidence (high/medium/low based on content quality) */
	confidence: "high" | "medium" | "low"
}

export interface CodeExample {
	language: string
	code: string
	purpose: string // what this code demonstrates
}

export interface TableData {
	headers: string[]
	rows: string[][]
	caption?: string
}

export interface ApiChange {
	type: "added" | "deprecated" | "removed" | "changed"
	item: string
	description: string
	version?: string
}

export interface Example {
	title: string
	description: string
	code?: string
}

export interface Citation {
	title: string
	url: string
}

/** Callback type for LLM-based extraction */
export type LlmExtractor = (systemPrompt: string, userPrompt: string) => Promise<string>

// ─── Default System Prompts ──────────────────────────────────────────────────

export const EXTRACTOR_SYSTEM_PROMPT = `You are an information extraction assistant. Extract structured knowledge from the provided page content.

Rules:
1. Extract factual statements with high precision — only extract what is explicitly stated
2. Assign confidence: "high" for directly stated facts, "medium" for implied facts, "low" for speculative content
3. Categorize facts by topic (e.g., "api", "installation", "configuration", "performance")
4. Extract ALL code examples with their language and purpose
5. Note any API changes (additions, deprecations, removals)
6. Extract tables as structured data
7. Provide a 1-2 sentence summary
8. List 3-8 key topics/tags

You MUST respond with valid JSON only, using this exact schema:
{
  "summary": "one or two sentence summary",
  "topics": ["topic1", "topic2"],
  "confidence": "high|medium|low",
  "facts": [
    {
      "statement": "factual statement",
      "category": "topic category",
      "confidence": "high|medium|low"
    }
  ],
  "codeExamples": [
    {
      "language": "typescript",
      "code": "console.log('hello');",
      "purpose": "what this demonstrates"
    }
  ],
  "tables": [
    {
      "headers": ["col1", "col2"],
      "rows": [["val1", "val2"]],
      "caption": "optional table caption"
    }
  ],
  "apiChanges": [
    {
      "type": "added|deprecated|removed|changed",
      "item": "API item name",
      "description": "description of change",
      "version": "optional version"
    }
  ],
  "examples": [
    {
      "title": "example title",
      "description": "what this shows",
      "code": "optional code block"
    }
  ],
  "citations": [
    {
      "title": "reference title",
      "url": "reference url"
    }
  ]
}`

// ─── Information Extractor ───────────────────────────────────────────────────

export class InformationExtractor {
	private llm: LlmExtractor
	private systemPrompt: string

	constructor(llm: LlmExtractor, systemPrompt?: string) {
		this.llm = llm
		this.systemPrompt = systemPrompt ?? EXTRACTOR_SYSTEM_PROMPT
	}

	/**
	 * Extract structured knowledge from a parsed page.
	 */
	async extract(page: ParsedPage, sourceUrl: string): Promise<ExtractedKnowledge> {
		// Use the markdown content + metadata
		const userPrompt = this.buildPrompt(page, sourceUrl)

		try {
			const raw = await this.llm(this.systemPrompt, userPrompt)
			return this.parseResponse(raw, sourceUrl)
		} catch (error) {
			console.warn("[InformationExtractor] LLM extraction failed, using fallback:", error)
			return this.fallbackExtraction(page, sourceUrl)
		}
	}

	// ─── Private ──────────────────────────────────────────────────────────

	private buildPrompt(page: ParsedPage, sourceUrl: string): string {
		return [
			`Source URL: ${sourceUrl}`,
			`Title: ${page.title}`,
			`Meta Description: ${page.metaDescription ?? "N/A"}`,
			`Publish Date: ${page.publishDate ?? "N/A"}`,
			``,
			`--- CONTENT START ---`,
			page.markdown.slice(0, 30_000), // Limit input to avoid token overflow
			`--- CONTENT END ---`,
		].join("\n")
	}

	private parseResponse(raw: string, sourceUrl: string): ExtractedKnowledge {
		// Strip markdown fences
		let jsonStr = raw.trim()
		const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
		if (jsonMatch) {
			jsonStr = jsonMatch[1].trim()
		}

		const parsed = JSON.parse(jsonStr)

		const facts: Fact[] = (parsed.facts ?? []).map((f: Record<string, unknown>, i: number) => ({
			id: `fact-${Date.now()}-${i}`,
			statement: String(f.statement ?? ""),
			sourceUrls: [sourceUrl],
			confidence: String(f.confidence ?? "medium") as "high" | "medium" | "low",
			category: String(f.category ?? "general"),
			extractedAt: new Date().toISOString(),
		}))

		const codeExamples: CodeExample[] = (parsed.codeExamples ?? []).map((c: Record<string, unknown>) => ({
			language: String(c.language ?? ""),
			code: String(c.code ?? ""),
			purpose: String(c.purpose ?? ""),
		}))

		const tables: TableData[] = (parsed.tables ?? []).map((t: Record<string, unknown>) => ({
			headers: Array.isArray(t.headers) ? (t.headers as string[]) : [],
			rows: Array.isArray(t.rows) ? (t.rows as string[][]) : [],
			caption: typeof t.caption === "string" ? t.caption : undefined,
		}))

		const apiChanges: ApiChange[] = (parsed.apiChanges ?? []).map((a: Record<string, unknown>) => ({
			type: a.type as ApiChange["type"],
			item: String(a.item ?? ""),
			description: String(a.description ?? ""),
			version: typeof a.version === "string" ? a.version : undefined,
		}))

		const examples: Example[] = (parsed.examples ?? []).map((e: Record<string, unknown>) => ({
			title: String(e.title ?? ""),
			description: String(e.description ?? ""),
			code: typeof e.code === "string" ? e.code : undefined,
		}))

		const citations: Citation[] = (parsed.citations ?? []).map((c: Record<string, unknown>) => ({
			title: String(c.title ?? ""),
			url: String(c.url ?? ""),
		}))

		return {
			facts,
			codeExamples,
			tables,
			apiChanges,
			examples,
			citations,
			summary: String(parsed.summary ?? ""),
			topics: Array.isArray(parsed.topics) ? (parsed.topics as string[]) : [],
			confidence: ["high", "medium", "low"].includes(parsed.confidence)
				? (parsed.confidence as "high" | "medium" | "low")
				: "medium",
		}
	}

	private fallbackExtraction(page: ParsedPage, sourceUrl: string): ExtractedKnowledge {
		// Minimal extraction without LLM — just grab what we can from the parsed page
		const facts: Fact[] = []
		if (page.excerpt) {
			facts.push({
				id: `fact-fallback-${Date.now()}`,
				statement: page.excerpt,
				sourceUrls: [sourceUrl],
				confidence: "medium",
				category: "summary",
				extractedAt: new Date().toISOString(),
			})
		}

		return {
			facts,
			codeExamples: page.codeBlocks.map((cb) => ({
				language: cb.language,
				code: cb.code,
				purpose: "Extracted from page content",
			})),
			tables: page.tables.map((row) => ({
				headers: row.length > 0 ? row[0].split(" | ") : [],
				rows: row.slice(1).map((r) => r.split(" | ")),
			})),
			apiChanges: [],
			examples: [],
			citations: page.links.slice(0, 10).map((l) => ({
				title: l.text,
				url: l.href,
			})),
			summary: page.excerpt,
			topics: [],
			confidence: "medium",
		}
	}
}

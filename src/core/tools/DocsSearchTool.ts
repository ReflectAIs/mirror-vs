/**
 * D-2: Documentation Search Tool
 *
 * Searches official documentation sites using the search provider layer
 * with site-restricted queries. Supports major frameworks, libraries,
 * and tools out of the box.
 *
 * Falls back to the configured web search provider (DuckDuckGo/Brave)
 * with a `site:` filter targeting the official docs domain.
 */

import { Task } from "../task/Task"
import type { ToolUse } from "../../shared/tools"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import { SearchProviderRouter } from "../../api/search/router"

// ─── Types ───────────────────────────────────────────────────────────────────

interface DocsSearchParams {
	/** The topic, API, or concept to search for */
	query: string
	/** Target documentation site key (e.g., "react", "nextjs", "python") */
	docKey?: string
	maxResults?: number
}

// ─── Known Documentation Sites ───────────────────────────────────────────────

export interface DocSite {
	name: string
	domain: string
	aliases: string[]
}

export const KNOWN_DOC_SITES: DocSite[] = [
	{ name: "React", domain: "react.dev", aliases: ["react", "reactjs"] },
	{ name: "Next.js", domain: "nextjs.org", aliases: ["nextjs", "next", "next.js"] },
	{ name: "Vue", domain: "vuejs.org", aliases: ["vue", "vuejs", "vue.js"] },
	{ name: "Angular", domain: "angular.dev", aliases: ["angular", "ng"] },
	{ name: "Svelte", domain: "svelte.dev", aliases: ["svelte", "sveltejs"] },
	{ name: "TypeScript", domain: "typescriptlang.org", aliases: ["typescript", "ts"] },
	{ name: "MDN", domain: "developer.mozilla.org", aliases: ["mdn", "mozilla"] },
	{ name: "Node.js", domain: "nodejs.org", aliases: ["node", "nodejs", "node.js"] },
	{ name: "Python", domain: "docs.python.org", aliases: ["python", "py"] },
	{ name: "Docker", domain: "docs.docker.com", aliases: ["docker"] },
	{ name: "Kubernetes", domain: "kubernetes.io", aliases: ["k8s", "kubernetes"] },
	{ name: "PostgreSQL", domain: "postgresql.org", aliases: ["postgres", "postgresql", "psql"] },
	{ name: "Tailwind CSS", domain: "tailwindcss.com", aliases: ["tailwind", "tailwindcss"] },
	{ name: "ESLint", domain: "eslint.org", aliases: ["eslint"] },
	{ name: "Jest", domain: "jestjs.io", aliases: ["jest"] },
	{ name: "Git", domain: "git-scm.com", aliases: ["git"] },
	{ name: "GitHub Docs", domain: "docs.github.com", aliases: ["github-docs", "github docs"] },
	{ name: "AWS", domain: "docs.aws.amazon.com", aliases: ["aws", "amazon"] },
	{ name: "Google Cloud", domain: "cloud.google.com", aliases: ["gcp", "google cloud"] },
]

// ─── Tool ────────────────────────────────────────────────────────────────────

export class DocsSearchTool extends BaseTool<"docs_search"> {
	readonly name = "docs_search" as const

	async execute(params: DocsSearchParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { askApproval, handleError, pushToolResult } = callbacks

		if (!params.query) {
			pushToolResult("Missing required parameter 'query' for docs_search.")
			return
		}

		const maxResults = Math.min(params.maxResults ?? 5, 10)
		const site = this.resolveDocSite(params.docKey)

		try {
			// Build a site-restricted query for the search provider
			const siteQuery = site ? `${params.query} site:${site.domain}` : params.query
			const results = await SearchProviderRouter.search(siteQuery, { maxResults })

			const output = this.formatResults(results, site?.name ?? "web")
			pushToolResult(output)
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e)
			await handleError("docs_search", new Error(message))
			pushToolResult(`Documentation search failed: ${message}`)
		}
	}

	/**
	 * Resolve a doc key or alias to a DocSite.
	 */
	private resolveDocSite(docKey?: string): DocSite | undefined {
		if (!docKey) return undefined

		const key = docKey.toLowerCase().trim()

		// Direct match by domain
		const byDomain = KNOWN_DOC_SITES.find((s) => s.domain === key || s.domain.replace(/^docs\./, "") === key)
		if (byDomain) return byDomain

		// Match by name or alias
		return KNOWN_DOC_SITES.find(
			(s) => s.name.toLowerCase() === key || s.aliases.some((a) => a.toLowerCase() === key),
		)
	}

	private formatResults(results: any[], siteName: string): string {
		if (!results || results.length === 0) {
			return `No documentation results found${siteName !== "web" ? ` on ${siteName}` : ""}.`
		}

		const header = siteName !== "web" ? `## ${siteName} Documentation Results\n\n` : ""

		return (
			header +
			results
				.map((r: any) => {
					const parts: string[] = []
					if (r.title) parts.push(`Title: ${r.title}`)
					parts.push(`URL: ${r.url}`)
					if (r.snippet) parts.push(`Snippet: ${r.snippet}`)
					return parts.join("\n")
				})
				.join("\n---\n")
		)
	}

	override async handlePartial(task: Task, block: ToolUse<"docs_search">): Promise<void> {
		// No partial handling needed
	}
}

export const docsSearchTool = new DocsSearchTool()

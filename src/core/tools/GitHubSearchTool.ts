/**
 * D-1: GitHub Research Tool
 *
 * Searches GitHub for repositories, code, issues, PRs, releases, and discussions.
 * Uses the GitHub REST API with an optional authentication token.
 *
 * Implements the BaseTool pattern like WebSearchTool.
 */

import { Task } from "../task/Task"
import type { ToolUse } from "../../shared/tools"
import { BaseTool, ToolCallbacks } from "./BaseTool"

// ─── Types ───────────────────────────────────────────────────────────────────

interface GitHubSearchParams {
	query: string
	type?: "repositories" | "code" | "issues" | "pullrequests" | "discussions"
	maxResults?: number
}

interface GitHubRepo {
	full_name: string
	description: string
	html_url: string
	stars: number
	language: string | null
	topics: string[]
	updated_at: string
}

interface GitHubCodeResult {
	name: string
	path: string
	repository: string
	html_url: string
}

interface GitHubIssue {
	title: string
	number: number
	state: string
	html_url: string
	labels: string[]
	updated_at: string
}

// ─── Constants ───────────────────────────────────────────────────────────────

const GITHUB_API_BASE = "https://api.github.com"

/** Default GitHub token (public rate-limited) — users can set their own via env */
let defaultApiToken: string | undefined

export function setGitHubDefaultApiKey(token: string): void {
	defaultApiToken = token
}

export function getGitHubDefaultApiKey(): string | undefined {
	return defaultApiToken ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN
}

// ─── Tool ────────────────────────────────────────────────────────────────────

export class GitHubSearchTool extends BaseTool<"github_search"> {
	readonly name = "github_search" as const

	async execute(params: GitHubSearchParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { askApproval, handleError, pushToolResult } = callbacks

		if (!params.query) {
			pushToolResult("Missing required parameter 'query' for github_search.")
			return
		}

		const type = params.type ?? "repositories"
		const maxResults = Math.min(params.maxResults ?? 5, 20)
		const token = getGitHubDefaultApiKey()

		try {
			const results = await this.searchGitHub(params.query, type, maxResults, token)
			const output = this.formatResults(results, type)
			pushToolResult(output)
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e)
			await handleError("github_search", new Error(message))
			pushToolResult(`GitHub search failed: ${message}`)
		}
	}

	private async searchGitHub(query: string, type: string, perPage: number, token?: string): Promise<any[]> {
		const searchEndpoint = type === "code" ? "code" : type === "issues" ? "issues" : "repositories"

		// For pull requests, GitHub uses the issues endpoint with type:pr filter
		const q =
			type === "pullrequests" ? `${query}+type:pr` : type === "discussions" ? `${query}+type:discussions` : query

		const url = `${GITHUB_API_BASE}/search/${searchEndpoint}?q=${encodeURIComponent(q)}&per_page=${perPage}&sort=stars&order=desc`

		const headers: Record<string, string> = {
			Accept: "application/vnd.github.v3+json",
			"User-Agent": "mirror-vs",
		}

		if (token) {
			headers["Authorization"] = `Bearer ${token}`
		}

		const response = await fetch(url, { headers })
		if (!response.ok) {
			throw new Error(`GitHub API returned ${response.status}: ${response.statusText}`)
		}

		const data = await response.json()
		return data.items ?? []
	}

	private formatResults(items: any[], type: string): string {
		if (!items || items.length === 0) {
			return "No GitHub search results found."
		}

		switch (type) {
			case "repositories":
				return items
					.map((repo: GitHubRepo) => {
						const parts: string[] = []
						parts.push(`Repository: ${repo.full_name}`)
						parts.push(`URL: ${repo.html_url}`)
						if (repo.description) parts.push(`Description: ${repo.description}`)
						parts.push(`Stars: ${repo.stars} | Language: ${repo.language ?? "N/A"}`)
						if (repo.topics?.length) parts.push(`Topics: ${repo.topics.join(", ")}`)
						parts.push(`Updated: ${repo.updated_at}`)
						return parts.join("\n")
					})
					.join("\n---\n")

			case "code":
				return items
					.map((code: GitHubCodeResult) => {
						const parts: string[] = []
						parts.push(`File: ${code.path}`)
						parts.push(`Repository: ${code.repository}`)
						parts.push(`URL: ${code.html_url}`)
						return parts.join("\n")
					})
					.join("\n---\n")

			case "issues":
			case "pullrequests":
				return items
					.map((issue: GitHubIssue) => {
						const parts: string[] = []
						parts.push(`#${issue.number}: ${issue.title}`)
						parts.push(`State: ${issue.state} | URL: ${issue.html_url}`)
						if (issue.labels?.length) parts.push(`Labels: ${issue.labels.join(", ")}`)
						parts.push(`Updated: ${issue.updated_at}`)
						return parts.join("\n")
					})
					.join("\n---\n")

			default:
				return JSON.stringify(items, null, 2)
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"github_search">): Promise<void> {
		// No partial handling needed
	}
}

export const gitHubSearchTool = new GitHubSearchTool()

/**
 * D-3: Package Registry Search Tool
 *
 * Searches package registries: npm, PyPI, Cargo (crates.io), Go, RubyGems.
 * Returns package metadata: version, description, install command, changelog links.
 *
 * Uses the registries' public JSON APIs — no authentication needed for basic search.
 */

import { Task } from "../task/Task"
import type { ToolUse } from "../../shared/tools"
import { BaseTool, ToolCallbacks } from "./BaseTool"

// ─── Types ───────────────────────────────────────────────────────────────────

interface PackageSearchParams {
	/** Package name or search query */
	query: string
	/** Registry to search: "npm", "pypi", "cargo", "go", "rubygems" */
	registry?: "npm" | "pypi" | "cargo" | "go" | "rubygems"
	/** Whether to get detailed package info (readme, dependencies) */
	details?: boolean
	maxResults?: number
}

interface PackageInfo {
	name: string
	version: string
	description: string
	homepage?: string
	repository?: string
	license?: string
	installCommand: string
	registry: string
	url: string
	updatedAt?: string
}

// ─── Tool ────────────────────────────────────────────────────────────────────

export class PackageSearchTool extends BaseTool<"package_search"> {
	readonly name = "package_search" as const

	async execute(params: PackageSearchParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { askApproval, handleError, pushToolResult } = callbacks

		if (!params.query) {
			pushToolResult("Missing required parameter 'query' for package_search.")
			return
		}

		const registry = params.registry ?? "npm"
		const maxResults = Math.min(params.maxResults ?? 5, 10)
		const getDetails = params.details ?? false

		try {
			const packages = await this.searchRegistry(params.query, registry, maxResults)
			const output = this.formatResults(packages, registry)
			pushToolResult(output)
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e)
			await handleError("package_search", new Error(message))
			pushToolResult(`Package search failed: ${message}`)
		}
	}

	private async searchRegistry(query: string, registry: string, limit: number): Promise<PackageInfo[]> {
		switch (registry) {
			case "npm":
				return this.searchNpm(query, limit)
			case "pypi":
				return this.searchPyPI(query, limit)
			case "cargo":
				return this.searchCargo(query, limit)
			case "go":
				return this.searchGo(query, limit)
			case "rubygems":
				return this.searchRubyGems(query, limit)
			default:
				throw new Error(`Unsupported registry: ${registry}`)
		}
	}

	// ─── npm ──────────────────────────────────────────────────────────────

	private async searchNpm(query: string, limit: number): Promise<PackageInfo[]> {
		const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=${limit}`
		const response = await fetch(url)
		if (!response.ok) throw new Error(`npm registry returned ${response.status}`)

		const data = await response.json()
		return (data.objects ?? []).map((obj: any) => {
			const pkg = obj.package
			return {
				name: pkg.name,
				version: pkg.version,
				description: pkg.description ?? "",
				homepage: pkg.links?.homepage,
				repository: pkg.links?.repository,
				license: pkg.license,
				installCommand: `npm install ${pkg.name}`,
				registry: "npm",
				url: pkg.links?.npm ?? `https://www.npmjs.com/package/${pkg.name}`,
				updatedAt: pkg.date,
			}
		})
	}

	// ─── PyPI ─────────────────────────────────────────────────────────────

	private async searchPyPI(query: string, limit: number): Promise<PackageInfo[]> {
		const url = `https://pypi.org/simple/`
		const response = await fetch(url, {
			headers: { Accept: "application/vnd.pypi.simple.v1+json" },
		})
		if (!response.ok) throw new Error(`PyPI registry returned ${response.status}`)

		const data = await response.json()
		const allPackages: { name: string; version?: string }[] = data.projects ?? data.packages ?? []

		// Simple filter-based search (PyPI simple index doesn't have text search)
		const q = query.toLowerCase()
		const matches = allPackages.filter((p) => p.name.toLowerCase().includes(q)).slice(0, limit)

		// Fetch details for each match
		const results: PackageInfo[] = []
		for (const pkg of matches) {
			try {
				const detailUrl = `https://pypi.org/pypi/${encodeURIComponent(pkg.name)}/json`
				const detailResponse = await fetch(detailUrl)
				if (detailResponse.ok) {
					const detail = await detailResponse.json()
					const info = detail.info
					results.push({
						name: info.name,
						version: info.version,
						description: info.summary ?? "",
						homepage: info.home_page,
						repository: info.project_urls?.Source ?? info.project_urls?.["Source Code"],
						license: info.license,
						installCommand: `pip install ${info.name}`,
						registry: "pypi",
						url: `https://pypi.org/project/${info.name}/`,
						updatedAt: info.author_email,
					})
				}
			} catch {
				// Skip failed detail fetches
			}
		}

		return results
	}

	// ─── Cargo ────────────────────────────────────────────────────────────

	private async searchCargo(query: string, limit: number): Promise<PackageInfo[]> {
		const url = `https://crates.io/api/v1/crates?q=${encodeURIComponent(query)}&per_page=${limit}`
		const response = await fetch(url, {
			headers: { "User-Agent": "mirror-vs" },
		})
		if (!response.ok) throw new Error(`crates.io registry returned ${response.status}`)

		const data = await response.json()
		return (data.crates ?? []).map((crate: any) => ({
			name: crate.name,
			version: crate.max_version ?? crate.newest_version,
			description: crate.description ?? "",
			homepage: crate.homepage,
			repository: crate.repository,
			license: crate.license,
			installCommand: `cargo add ${crate.name}`,
			registry: "cargo",
			url: `https://crates.io/crates/${crate.name}`,
			updatedAt: crate.updated_at,
		}))
	}

	// ─── Go ───────────────────────────────────────────────────────────────

	private async searchGo(query: string, limit: number): Promise<PackageInfo[]> {
		const url = `https://proxy.golang.org/${encodeURIComponent(query)}/@latest`
		const response = await fetch(url)
		if (!response.ok) throw new Error(`Go proxy returned ${response.status}`)

		const data: any = await response.json()
		const name = query

		// Go proxy doesn't support listing/search, so we return the exact match
		return [
			{
				name,
				version: data.Version ?? "latest",
				description: `Go module: ${name}`,
				homepage: `https://pkg.go.dev/${name}`,
				repository: `https://${name}`,
				installCommand: `go get ${name}`,
				registry: "go",
				url: `https://pkg.go.dev/${name}`,
				updatedAt: data.Time,
			},
		]
	}

	// ─── RubyGems ─────────────────────────────────────────────────────────

	private async searchRubyGems(query: string, limit: number): Promise<PackageInfo[]> {
		const url = `https://rubygems.org/api/v1/search.json?query=${encodeURIComponent(query)}`
		const response = await fetch(url)
		if (!response.ok) throw new Error(`RubyGems registry returned ${response.status}`)

		const data = await response.json()
		return (data.slice(0, limit) as any[]).map((gem: any) => ({
			name: gem.name,
			version: gem.version,
			description: gem.info ?? gem.description ?? "",
			homepage: gem.homepage_uri,
			repository: gem.source_code_uri,
			license: gem.licenses?.join(", "),
			installCommand: `gem install ${gem.name}`,
			registry: "rubygems",
			url: `https://rubygems.org/gems/${gem.name}`,
			updatedAt: gem.updated_at,
		}))
	}

	private formatResults(packages: PackageInfo[], registry: string): string {
		if (!packages || packages.length === 0) {
			return `No packages found on ${registry}.`
		}

		return packages
			.map((pkg) => {
				const parts: string[] = []
				parts.push(`Package: ${pkg.name} v${pkg.version}`)
				parts.push(`Registry: ${pkg.registry}`)
				parts.push(`Description: ${pkg.description}`)
				parts.push(`Install: \`${pkg.installCommand}\``)
				parts.push(`URL: ${pkg.url}`)
				if (pkg.homepage) parts.push(`Homepage: ${pkg.homepage}`)
				if (pkg.repository) parts.push(`Repository: ${pkg.repository}`)
				if (pkg.license) parts.push(`License: ${pkg.license}`)
				return parts.join("\n")
			})
			.join("\n---\n")
	}

	override async handlePartial(task: Task, block: ToolUse<"package_search">): Promise<void> {
		// No partial handling needed
	}
}

export const packageSearchTool = new PackageSearchTool()

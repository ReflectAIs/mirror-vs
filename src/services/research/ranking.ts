/**
 * C-4: Source Ranking
 *
 * Scores and ranks sources by:
 * 1. Authority (official docs > blogs > forums > social)
 * 2. Freshness (recency of content)
 * 3. Relevance to query
 * 4. Community trust signals (stars, upvotes, domain reputation)
 *
 * Rule-based scoring initially — the weights can be tuned or replaced
 * with ML-based ranking later.
 */

import { SearchResult } from "../../api/search/types"

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RankedSource extends SearchResult {
	/** Composite quality score (0–100) */
	score: number
	/** Breakdown of the score */
	scores: ScoreBreakdown
	/** Human-readable label for the rank tier */
	tier: "excellent" | "good" | "fair" | "poor"
}

export interface ScoreBreakdown {
	authority: number // 0–40
	freshness: number // 0–25
	relevance: number // 0–25
	trustSignals: number // 0–10
}

/** Domain authority tiers */
interface DomainAuthority {
	domain: string
	/** Authority score 0–40 */
	score: number
	label: string
}

// ─── Domain Authority Database ───────────────────────────────────────────────

const HIGH_AUTHORITY_DOMAINS: DomainAuthority[] = [
	// Official documentation
	{ domain: "react.dev", score: 40, label: "Official docs" },
	{ domain: "nextjs.org", score: 40, label: "Official docs" },
	{ domain: "angular.dev", score: 40, label: "Official docs" },
	{ domain: "vuejs.org", score: 40, label: "Official docs" },
	{ domain: "nuxt.com", score: 40, label: "Official docs" },
	{ domain: "svelte.dev", score: 40, label: "Official docs" },
	{ domain: "python.org", score: 40, label: "Official docs" },
	{ domain: "nodejs.org", score: 40, label: "Official docs" },
	{ domain: "docs.npmjs.com", score: 40, label: "Official docs" },
	{ domain: "developer.mozilla.org", score: 40, label: "MDN" },
	{ domain: "learn.microsoft.com", score: 40, label: "Official docs" },
	{ domain: "docs.docker.com", score: 40, label: "Official docs" },
	{ domain: "kubernetes.io", score: 40, label: "Official docs" },
	{ domain: "docs.github.com", score: 40, label: "Official docs" },
	{ domain: "git-scm.com", score: 40, label: "Official docs" },
	{ domain: "jestjs.io", score: 40, label: "Official docs" },
	{ domain: "eslint.org", score: 40, label: "Official docs" },
	{ domain: "typescriptlang.org", score: 40, label: "Official docs" },
	{ domain: "deno.land", score: 40, label: "Official docs" },
	{ domain: "bun.sh", score: 40, label: "Official docs" },
	{ domain: "tailwindcss.com", score: 40, label: "Official docs" },
	{ domain: "postgresql.org", score: 40, label: "Official docs" },
	{ domain: "mysql.com", score: 40, label: "Official docs" },
	{ domain: "mongodb.com", score: 40, label: "Official docs" },
	{ domain: "redis.io", score: 40, label: "Official docs" },
	{ domain: "graphql.org", score: 40, label: "Official docs" },
	{ domain: "docs.aws.amazon.com", score: 40, label: "Official docs" },
	{ domain: "cloud.google.com", score: 40, label: "Official docs" },
	{ domain: "learn.microsoft.com", score: 40, label: "Official docs" },
	{ domain: "spec.graphql.org", score: 40, label: "Specification" },
	{ domain: "whatwg.org", score: 40, label: "Specification" },
	{ domain: "w3.org", score: 40, label: "Specification" },
	{ domain: "tc39.es", score: 40, label: "Specification" },
	{ domain: "ietf.org", score: 40, label: "Specification" },

	// High-quality programming resources
	{ domain: "stackoverflow.com", score: 30, label: "Stack Overflow" },
	{ domain: "stackexchange.com", score: 28, label: "Stack Exchange" },
	{ domain: "medium.com", score: 20, label: "Medium" },
	{ domain: "dev.to", score: 25, label: "Dev.to" },
	{ domain: "css-tricks.com", score: 35, label: "CSS-Tricks" },
	{ domain: "smashingmagazine.com", score: 32, label: "Smashing Magazine" },
	{ domain: "alistapart.com", score: 32, label: "A List Apart" },
	{ domain: "freecodecamp.org", score: 28, label: "freeCodeCamp" },
	{ domain: "geeksforgeeks.org", score: 22, label: "GeeksforGeeks" },
	{ domain: "tutorialspoint.com", score: 18, label: "TutorialsPoint" },
	{ domain: "w3schools.com", score: 20, label: "W3Schools" },
	{ domain: "digitalocean.com", score: 28, label: "DigitalOcean" },
	{ domain: "auth0.com", score: 30, label: "Auth0" },
	{ domain: "logrocket.com", score: 28, label: "LogRocket" },
	{ domain: "sitepoint.com", score: 26, label: "SitePoint" },
	{ domain: "infoq.com", score: 30, label: "InfoQ" },
	{ domain: "martinfowler.com", score: 38, label: "Martin Fowler" },
	{ domain: "github.blog", score: 32, label: "GitHub Blog" },
	{ domain: "changelog.com", score: 28, label: "Changelog" },
	{ domain: "arxiv.org", score: 35, label: "arXiv" },
	{ domain: "ieee.org", score: 36, label: "IEEE" },
	{ domain: "acm.org", score: 36, label: "ACM" },
]

// ─── Source Ranker ───────────────────────────────────────────────────────────

export class SourceRanker {
	/**
	 * Rank an array of search results by quality.
	 * Returns a sorted array with the highest-quality sources first.
	 */
	rank(results: SearchResult[], query?: string): RankedSource[] {
		return results.map((result) => this.scoreSource(result, query)).sort((a, b) => b.score - a.score)
	}

	/**
	 * Score a single source.
	 */
	private scoreSource(result: SearchResult, query?: string): RankedSource {
		const authority = this.scoreAuthority(result.url)
		const freshness = this.scoreFreshness(result)
		const relevance = this.scoreRelevance(result, query)
		const trustSignals = this.scoreTrustSignals(result)

		const total = authority + freshness + relevance + trustSignals

		const tier = this.getTier(total)

		return {
			...result,
			score: total,
			scores: { authority, freshness, relevance, trustSignals },
			tier,
		}
	}

	/**
	 * Score domain authority (0–40).
	 */
	private scoreAuthority(url: string): number {
		try {
			const parsed = new URL(url)
			const hostname = parsed.hostname.replace(/^www\./, "")

			// Check known high-authority domains
			for (const entry of HIGH_AUTHORITY_DOMAINS) {
				if (hostname === entry.domain || hostname.endsWith("." + entry.domain)) {
					return entry.score
				}
			}

			// edu / gov domains are generally authoritative
			if (hostname.endsWith(".edu")) return 34
			if (hostname.endsWith(".gov")) return 36
			if (hostname.endsWith(".org")) return 24

			// GitHub repos
			if (hostname === "github.com") return 28
			if (hostname === "gist.github.com") return 22

			// npm / pypi / crates.io
			if (hostname === "www.npmjs.com" || hostname === "npmjs.com") return 28
			if (hostname === "pypi.org") return 28
			if (hostname === "crates.io") return 26

			// YouTube (tutorials)
			if (hostname === "youtube.com" || hostname === "www.youtube.com") return 16

			// Default: moderate authority for unknown domains
			return 18
		} catch {
			return 10
		}
	}

	/**
	 * Score freshness (0–25).
	 * Uses `freshnessDays` from search metadata if available, otherwise
	 * assumes recent (lower bound, so no penalty).
	 */
	private scoreFreshness(result: SearchResult): number {
		// If there's no freshness info, assume moderate freshness
		if (!result.metadata?.freshnessDays) {
			return 15
		}

		const days = Number(result.metadata.freshnessDays)
		if (days <= 7) return 25 // This week
		if (days <= 30) return 22 // This month
		if (days <= 90) return 18 // This quarter
		if (days <= 365) return 12 // This year
		return 5 // Older than a year
	}

	/**
	 * Score relevance based on title/snippet match with the query (0–25).
	 */
	private scoreRelevance(result: SearchResult, query?: string): number {
		if (!query) return 15 // neutral

		const queryWords = query.toLowerCase().split(/\s+/).filter(Boolean)
		if (queryWords.length === 0) return 15

		const title = result.title.toLowerCase()
		const snippet = result.snippet.toLowerCase()
		const url = result.url.toLowerCase()

		let matches = 0

		for (const word of queryWords) {
			if (word.length < 3) continue // skip short words

			if (title.includes(word)) matches += 3
			else if (snippet.includes(word)) matches += 2
			else if (url.includes(word)) matches += 1
		}

		// Bonus: exact phrase match in title
		if (title.includes(query.toLowerCase())) matches += 5

		// Normalise to 0–25
		const maxPossible = queryWords.length * 3 + 5
		const score = Math.round((matches / maxPossible) * 25)

		return Math.min(25, Math.max(0, score))
	}

	/**
	 * Score trust signals (0–10).
	 */
	private scoreTrustSignals(result: SearchResult): number {
		let score = 5 // baseline

		// Has a good snippet (meaningful content)
		if (result.snippet && result.snippet.length > 50) score += 2
		if (result.snippet && result.snippet.length > 150) score += 1

		// URL looks clean (no tracking params, no weird paths)
		try {
			const parsed = new URL(result.url)
			const searchParams = Array.from(parsed.searchParams.keys())
			const trackingParams = searchParams.filter(
				(p) => p.startsWith("utm_") || p === "ref" || p === "source" || p === "fbclid",
			)
			if (trackingParams.length === 0) score += 1

			// Secure connection
			if (parsed.protocol === "https:") score += 1
		} catch {
			// If URL parsing fails, no bonus
		}

		return Math.min(10, score)
	}

	/**
	 * Map a composite score to a human-readable tier.
	 */
	private getTier(score: number): RankedSource["tier"] {
		if (score >= 60) return "excellent"
		if (score >= 40) return "good"
		if (score >= 25) return "fair"
		return "poor"
	}
}

/** Convenience: rank sources with a default ranker instance. */
export function rankSources(results: SearchResult[], query?: string): RankedSource[] {
	const ranker = new SourceRanker()
	return ranker.rank(results, query)
}

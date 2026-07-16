/**
 * C-2: Page Parser
 *
 * Extracts clean content from raw HTML pages.
 * - Removes: ads, cookie banners, navigation, footer, comments, scripts, styles
 * - Keeps: title, main content, code blocks, tables, lists, metadata, links
 *
 * Uses `cheerio` (fast, streaming) for DOM parsing and cleanup,
 * and `turndown` for converting HTML to clean Markdown.
 */

import * as cheerio from "cheerio"
import TurndownService from "turndown"

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ParsedPage {
	title: string
	/** Clean page content as Markdown */
	markdown: string
	/** Clean page content as plain text */
	plainText: string
	/** Excerpt — first ~200 chars of meaningful content */
	excerpt: string
	/** All links found on the page (href, text) */
	links: { href: string; text: string }[]
	/** Code blocks extracted separately */
	codeBlocks: { language: string; code: string }[]
	/** Tables found on the page */
	tables: string[][] // row-major
	/** Estimated reading time in seconds */
	readingTimeSec: number
	/** Whether the content was truncated */
	wasTruncated: boolean
	/** Meta description */
	metaDescription?: string
	/** Publication date (from meta tags) */
	publishDate?: string
}

export interface ParserOptions {
	/** Max characters to keep after parsing (default: 50_000) */
	maxLength?: number
	/** Whether to extract tables (default: true) */
	extractTables?: boolean
	/** Whether to extract code blocks separately (default: true) */
	extractCodeBlocks?: boolean
	/** Whether to keep links in output (default: true) */
	keepLinks?: boolean
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const MAX_LENGTH = 50_000

// CSS selectors for elements to REMOVE from the parsed content
const REMOVE_SELECTORS = [
	// Navigation & chrome
	"nav",
	".nav",
	"#nav",
	".navbar",
	".navigation",
	".menu",
	"header:not(article header)",
	"footer",
	".footer",
	"#footer",

	// Sidebars & secondary content
	"aside",
	".sidebar",
	"#sidebar",
	".side",
	".secondary",

	// Cookie / GDPR banners
	".cookie-consent",
	".cookie-banner",
	".gdpr",
	".cookie-notice",
	"#cookie-notice",
	".cc-window",
	".fc-consent-root",

	// Ads & promotions
	".ad",
	".ads",
	".advertisement",
	".ad-container",
	'[class*="ad-"]',
	'[id*="ad-"]',
	".promo",
	".sponsored",

	// Social widgets
	".share-buttons",
	".social-share",
	".social-links",
	".social",

	// Comments (often noisy)
	".comments",
	"#comments",
	".comment-list",
	".comment-form",

	// Scripts & styles
	"script",
	"style",
	"noscript",
	"iframe",
	"svg",
	"form",

	// Other noise
	".breadcrumb",
	".breadcrumbs",
	".skip-link",
	".sr-only",
	".visually-hidden",
	".hidden",
	'[aria-hidden="true"]',
	".loading",
	".spinner",
	".modal",
	".overlay",
	".popup",
	".popover",
	".tooltip",
]

// ─── Page Parser ─────────────────────────────────────────────────────────────

export class PageParser {
	private options: Required<ParserOptions>
	private turndown: TurndownService

	constructor(options: ParserOptions = {}) {
		this.options = {
			maxLength: options.maxLength ?? MAX_LENGTH,
			extractTables: options.extractTables ?? true,
			extractCodeBlocks: options.extractCodeBlocks ?? true,
			keepLinks: options.keepLinks ?? true,
		}

		// Configure turndown for clean Markdown output
		this.turndown = new TurndownService({
			headingStyle: "atx",
			codeBlockStyle: "fenced",
			bulletListMarker: "-",
			emDelimiter: "*",
			linkStyle: "inlined",
			linkReferenceStyle: "full",
		})

		// Keep <code> inline (default turndown strips it)
		this.turndown.addRule("code", {
			filter: "code",
			replacement: (content: string) => `\`${content}\``,
		})

		// Keep images as markdown
		this.turndown.addRule("images", {
			filter: "img",
			replacement: (content: string, node: any) => {
				const alt = node.attribs?.alt ?? ""
				const src = node.attribs?.src ?? ""
				if (!src) return ""
				return `![${alt}](${src})`
			},
		})
	}

	/**
	 * Parse raw HTML content into a clean, structured representation.
	 */
	parse(html: string, sourceUrl?: string): ParsedPage {
		const $ = cheerio.load(html)

		// Extract metadata before cleanup
		const title = $("title").first().text().trim() || sourceUrl || ""
		const metaDescription =
			$('meta[name="description"]').attr("content")?.trim() ??
			$('meta[property="og:description"]').attr("content")?.trim()
		const publishDate =
			$('meta[property="article:published_time"]').attr("content")?.trim() ??
			$('meta[name="date"]').attr("content")?.trim()

		// Remove unwanted elements
		$(REMOVE_SELECTORS.join(",")).remove()

		// Extract code blocks before they get turndowned
		const codeBlocks: { language: string; code: string }[] = []
		if (this.options.extractCodeBlocks) {
			$("pre code, pre").each((_: number, el: any) => {
				const $el = $(el)
				const code = $el.text().trim()
				if (code.length > 20) {
					// meaningful threshold
					const className = $el.attr("class") ?? ""
					const language = className.replace(/^language-/, "").split(/\s/)[0]
					codeBlocks.push({ language, code })
				}
			})
		}

		// Extract tables
		const tables: string[][] = []
		if (this.options.extractTables) {
			$("table").each((_: number, tableEl: any) => {
				const rows: string[] = []
				$(tableEl)
					.find("tr")
					.each((__: number, rowEl: any) => {
						const cells: string[] = []
						$(rowEl)
							.find("td, th")
							.each((___: number, cell: any) => {
								cells.push($(cell).text().trim())
							})
						rows.push(cells.join(" | "))
					})
				if (rows.length > 0) {
					tables.push(rows)
				}
			})

			// Remove tables from the HTML before turndown to avoid duplication
			$("table").remove()
		}

		// Extract links
		const links: { href: string; text: string }[] = []
		$("a[href]").each((_: number, el: any) => {
			const href = $(el).attr("href") ?? ""
			const text = $(el).text().trim()
			if (href && text && !href.startsWith("#") && !href.startsWith("javascript:")) {
				links.push({ href, text })
			}
		})

		// Convert to Markdown
		let markdown = this.turndown.turndown($.html())

		// Truncate if needed
		let wasTruncated = false
		if (markdown.length > this.options.maxLength) {
			markdown = markdown.slice(0, this.options.maxLength) + "\n\n_[Content truncated...]_"
			wasTruncated = true
		}

		// Plain text version (strip markdown syntax)
		const plainText = markdown
			.replace(/[#*`~>|\[\]()!_-]/g, "")
			.replace(/\n{3,}/g, "\n\n")
			.trim()

		// Excerpt
		const excerpt = plainText.replace(/\s+/g, " ").slice(0, 200).trim()

		// Reading time
		const wordCount = plainText.split(/\s+/).filter(Boolean).length
		const readingTimeSec = Math.ceil((wordCount / 200) * 60) // 200 wpm

		return {
			title,
			markdown,
			plainText,
			excerpt: excerpt + (excerpt.length >= 200 ? "..." : ""),
			links,
			codeBlocks,
			tables,
			readingTimeSec,
			wasTruncated,
			metaDescription,
			publishDate,
		}
	}
}

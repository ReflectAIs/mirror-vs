import { describe, it, expect, beforeEach } from "vitest"
import { PageParser } from "../parser"

describe("PageParser", () => {
	let parser: PageParser

	beforeEach(() => {
		parser = new PageParser()
	})

	it("should parse a simple HTML page", () => {
		const html = `
            <html>
                <head>
                    <title>Test Page</title>
                    <meta name="description" content="A test page">
                </head>
                <body>
                    <h1>Hello World</h1>
                    <p>This is a paragraph.</p>
                </body>
            </html>
        `

		const page = parser.parse(html, "https://example.com")

		expect(page.title).toBe("Test Page")
		expect(page.metaDescription).toBe("A test page")
		expect(page.markdown).toContain("Hello World")
		expect(page.markdown).toContain("This is a paragraph.")
		expect(page.excerpt.length).toBeGreaterThan(0)
	})

	it("should remove unwanted elements (scripts, styles, nav)", () => {
		const html = `
            <html>
                <body>
                    <nav>Navigation</nav>
                    <script>alert('bad')</script>
                    <style>.css{color:red}</style>
                    <div class="sidebar">Sidebar content</div>
                    <main><p>Main content</p></main>
                </body>
            </html>
        `

		const page = parser.parse(html)

		expect(page.markdown).not.toContain("Navigation")
		expect(page.markdown).not.toContain("alert")
		expect(page.markdown).not.toContain("Sidebar content")
		expect(page.markdown).toContain("Main content")
	})

	it("should extract code blocks with language detection", () => {
		const html = `
            <html><body>
                <pre><code class="language-typescript">const x: number = 42;</code></pre>
            </body></html>
        `

		const page = parser.parse(html)

		// The selector "pre code, pre" matches both <code> and <pre> elements
		expect(page.codeBlocks.length).toBeGreaterThanOrEqual(1)
		const tsBlock = page.codeBlocks.find((b) => b.language === "typescript")
		expect(tsBlock).toBeDefined()
		expect(tsBlock!.code).toContain("const x: number = 42;")
	})

	it("should extract tables", () => {
		const html = `
            <html><body>
                <table>
                    <tr><th>Name</th><th>Version</th></tr>
                    <tr><td>React</td><td>18.2</td></tr>
                    <tr><td>Vue</td><td>3.3</td></tr>
                </table>
            </body></html>
        `

		const page = parser.parse(html)

		expect(page.tables.length).toBeGreaterThan(0)
		const tableStr = page.tables[0].join(" ")
		expect(tableStr).toContain("Name")
		expect(tableStr).toContain("React")
		expect(tableStr).toContain("Vue")
	})

	it("should extract links from the page", () => {
		const html = `
            <html><body>
                <a href="https://react.dev">React</a>
                <a href="https://vuejs.org">Vue</a>
                <a href="#section">Skip</a>
                <a href="javascript:void(0)">Bad</a>
            </body></html>
        `

		const page = parser.parse(html)

		// Should skip anchor links and javascript: links
		expect(page.links).toHaveLength(2)
		expect(page.links[0].href).toBe("https://react.dev")
		expect(page.links[0].text).toBe("React")
	})

	it("should truncate content that exceeds maxLength", () => {
		const longContent = "<p>" + "A".repeat(60_000) + "</p>"
		const html = `<html><body>${longContent}</body></html>`

		const shortParser = new PageParser({ maxLength: 100 })
		const page = shortParser.parse(html)

		expect(page.markdown.length).toBeLessThan(150) // 100 + truncation notice
		expect(page.wasTruncated).toBe(true)
	})

	it("should compute reading time", () => {
		const words = Array.from({ length: 50 }, (_, i) => `word${i}`).join(" ")
		const html = `<html><body><p>${words}</p></body></html>`

		const page = parser.parse(html)

		// 50 words at 200 wpm = ~15 seconds
		expect(page.readingTimeSec).toBeGreaterThan(0)
		expect(page.readingTimeSec).toBeLessThanOrEqual(60)
	})

	it("should handle empty HTML gracefully", () => {
		const page = parser.parse("")

		expect(page.title).toBe("")
		expect(page.markdown).toBe("")
		expect(page.plainText).toBe("")
		expect(page.codeBlocks).toEqual([])
		expect(page.tables).toEqual([])
		expect(page.links).toEqual([])
		expect(page.readingTimeSec).toBe(0)
		expect(page.wasTruncated).toBe(false)
	})

	it("should extract meta publish date", () => {
		const html = `
            <html><head>
                <meta property="article:published_time" content="2024-06-15T10:00:00Z">
            </head></html>
        `

		const page = parser.parse(html)
		expect(page.publishDate).toBe("2024-06-15T10:00:00Z")
	})

	it("should use sourceUrl as fallback title", () => {
		const page = parser.parse("<html></html>", "https://fallback.com/article")
		expect(page.title).toBe("https://fallback.com/article")
	})
})

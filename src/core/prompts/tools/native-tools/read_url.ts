import type OpenAI from "openai"

const READ_URL_DESCRIPTION = `Request to read the content of a URL and return it as clean, formatted text. Use this tool to fetch web pages, documentation, articles, or any online content and have it automatically cleaned of navigation, ads, and other clutter. Uses a hybrid HTTP→browser approach: fetches via HTTP first, and falls back to a browser (Puppeteer) if the page requires JavaScript rendering.

Parameters:
- url: (required) The URL to read. Must include protocol (e.g., https://).
- maxLength: (optional) Maximum characters to return (default: 10,000, max: 50,000).
- plainTextOnly: (optional) If true, returns raw text without Markdown conversion (default: false).

Examples:
Read a documentation page:
{ "url": "https://react.dev/reference/react/useEffect", "maxLength": 20000 }

Read a blog post:
{ "url": "https://example.com/blog/article", "plainTextOnly": false }`

const URL_PARAMETER_DESCRIPTION = `The URL to read. Must include the protocol (e.g., https://example.com/page).`

export default {
	type: "function",
	function: {
		name: "read_url",
		description: READ_URL_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				url: {
					type: "string",
					description: URL_PARAMETER_DESCRIPTION,
				},
				maxLength: {
					type: "number",
					description: "Maximum characters to return (default: 10,000, max: 50,000).",
				},
				plainTextOnly: {
					type: "boolean",
					description: "If true, returns only plain text without Markdown formatting (default: false).",
				},
			},
			required: ["url"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool

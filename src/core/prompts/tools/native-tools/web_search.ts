import type OpenAI from "openai"

const WEB_SEARCH_DESCRIPTION = `Search the web for current information, documentation, error fixes, code examples, or anything not available in the local codebase.

Returns up to 8 results with titles, URLs, and snippets. For research-intent queries (e.g. "how to", "docs", "error", "example", "API"), the top results are automatically enriched with a full page content preview — so you often won't need a separate read_url call.

Best practices:
- Use specific, targeted queries (treat it like a search engine)
- Prefer this over read_url for initial discovery; use read_url to deep-read a specific URL afterward if needed
- Queries work best in English

Example: Searching for documentation
{ "query": "React useEffect cleanup function" }

Example: Searching for an error solution
{ "query": "TypeError Cannot read properties of undefined JavaScript fix" }

Example: Finding a library's API
{ "query": "zod schema validation API reference" }`

const QUERY_PARAMETER_DESCRIPTION = `The search query. Use specific keywords, similar to what you would type into a search engine.`

export default {
	type: "function",
	function: {
		name: "web_search",
		description: WEB_SEARCH_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				query: {
					type: "string",
					description: QUERY_PARAMETER_DESCRIPTION,
				},
			},
			required: ["query"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool

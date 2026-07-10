import type OpenAI from "openai"

const WEB_SEARCH_DESCRIPTION = `Request to perform a web search using DuckDuckGo to find information on the internet. Use this tool to search for current information, documentation, troubleshooting guides, code examples, or any other information that may not be available in your training data or the local codebase.

Parameters:
- query: (required) The search query string to send to the web search engine. This should be a concise, well-formed search query similar to what you would type into a search engine like Google or DuckDuckGo. For best results, use specific keywords and phrases relevant to what you're looking for.

Example: Searching for a documentation topic
{ "query": "React useState hook documentation" }

Example: Searching for an error solution
{ "query": "TypeError Cannot read property of undefined JavaScript fix" }

Example: Searching for a library
{ "query": "npm package zod validation" }`

const QUERY_PARAMETER_DESCRIPTION = `The search query string to search the web for. Should be a well-formed search query with specific keywords.`

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

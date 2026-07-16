import type OpenAI from "openai"

const GITHUB_SEARCH_DESCRIPTION = `Request to search GitHub for repositories, code, issues, pull requests, or discussions. Use this tool to find open-source projects, explore code patterns, look up issues and PRs, or research repository metadata like stars, topics, and languages. Powered by the GitHub REST API.

Parameters:
- query: (required) The search query. Supports GitHub's search syntax (e.g., "react hooks language:typescript", "tailwindcss repo:tailwindlabs/tailwindcss").
- type: (optional) The type of search: "repositories" (default), "code", "issues", "pullrequests", or "discussions".
- maxResults: (optional) Maximum number of results to return (default: 5, max: 20).

Examples:
Search for repositories:
{ "query": "state management react", "type": "repositories", "maxResults": 5 }

Search for code:
{ "query": "useEffect cleanup language:typescript", "type": "code" }

Search for issues:
{ "query": "bug signing in is:open", "type": "issues" }`

const QUERY_PARAMETER_DESCRIPTION = `The GitHub search query. Supports GitHub's advanced search syntax including language:, repo:, is:open, label:, etc.`

export default {
	type: "function",
	function: {
		name: "github_search",
		description: GITHUB_SEARCH_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				query: {
					type: "string",
					description: QUERY_PARAMETER_DESCRIPTION,
				},
				type: {
					type: "string",
					description:
						"Type of search: 'repositories' (default), 'code', 'issues', 'pullrequests', or 'discussions'.",
					enum: ["repositories", "code", "issues", "pullrequests", "discussions"],
				},
				maxResults: {
					type: "number",
					description: "Maximum number of results to return (default: 5, max: 20).",
				},
			},
			required: ["query"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool

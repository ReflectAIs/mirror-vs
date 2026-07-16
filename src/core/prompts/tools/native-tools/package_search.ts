import type OpenAI from "openai"

const PACKAGE_SEARCH_DESCRIPTION = `Request to search package registries for libraries and packages. Use this tool to find package metadata including version, description, install command, license, and repository links. Supports npm, PyPI, Cargo (crates.io), Go, and RubyGems.

Parameters:
- query: (required) The package name or search query.
- registry: (optional) The package registry to search: "npm" (default), "pypi", "cargo", "go", or "rubygems".
- details: (optional) Whether to fetch detailed package information (default: false).
- maxResults: (optional) Maximum number of results to return (default: 5, max: 10).

Examples:
Search npm packages:
{ "query": "zod", "registry": "npm" }

Search PyPI packages:
{ "query": "requests", "registry": "pypi" }

Search Cargo crates:
{ "query": "serde", "registry": "cargo" }`

const QUERY_PARAMETER_DESCRIPTION = `The package name or search keywords. For best results, use the exact package name or relevant keywords.`

export default {
	type: "function",
	function: {
		name: "package_search",
		description: PACKAGE_SEARCH_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				query: {
					type: "string",
					description: QUERY_PARAMETER_DESCRIPTION,
				},
				registry: {
					type: "string",
					description: "Package registry: 'npm' (default), 'pypi', 'cargo', 'go', or 'rubygems'.",
					enum: ["npm", "pypi", "cargo", "go", "rubygems"],
				},
				details: {
					type: "boolean",
					description: "Whether to fetch detailed package information (default: false).",
				},
				maxResults: {
					type: "number",
					description: "Maximum number of results to return (default: 5, max: 10).",
				},
			},
			required: ["query"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool

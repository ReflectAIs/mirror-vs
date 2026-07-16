import type OpenAI from "openai"

const DOCS_SEARCH_DESCRIPTION = `Request to search official documentation sites for frameworks, libraries, and tools. Use this tool to find API references, usage guides, and code examples from authoritative documentation sources. Routes through the configured web search provider with site-restricted queries targeting official docs domains.

Parameters:
- query: (required) The topic, API, concept, or function name to search for in the documentation.
- docKey: (optional) The documentation site to search. Supported keys: "react" (react.dev), "nextjs" (nextjs.org), "vue" (vuejs.org), "angular" (angular.dev), "svelte" (svelte.dev), "typescript" (typescriptlang.org), "mdn" (developer.mozilla.org), "node" (nodejs.org), "python" (docs.python.org), "docker" (docs.docker.com), "kubernetes" (kubernetes.io), "postgres" (postgresql.org), "tailwind" (tailwindcss.com), "eslint" (eslint.org), "jest" (jestjs.io), "git" (git-scm.com), "aws" (docs.aws.amazon.com), "gcp" (cloud.google.com). If omitted, searches all documentation.
- maxResults: (optional) Maximum number of results to return (default: 5, max: 10).

Examples:
Search React docs:
{ "query": "useEffect", "docKey": "react" }

Search MDN for JavaScript array methods:
{ "query": "Array.prototype.map", "docKey": "mdn" }`

const QUERY_PARAMETER_DESCRIPTION = `The topic, API, function name, or concept to look up in the documentation. Be specific for better results.`

export default {
	type: "function",
	function: {
		name: "docs_search",
		description: DOCS_SEARCH_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				query: {
					type: "string",
					description: QUERY_PARAMETER_DESCRIPTION,
				},
				docKey: {
					type: "string",
					description:
						"Documentation site key (e.g., 'react', 'nextjs', 'mdn', 'python', 'typescript', 'node', 'docker', 'aws'). If omitted, searches across all documentation.",
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

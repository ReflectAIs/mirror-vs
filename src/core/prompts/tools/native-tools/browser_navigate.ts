import type OpenAI from "openai"

const BROWSER_NAVIGATE_DESCRIPTION = `Request to navigate the browser to a given URL. Use this to load a web page in the browser session. After navigation, the current page state is visible to the vision model.

Parameters:
- url: (required) The URL to navigate to. Must include protocol (e.g., https://example.com).

Examples:
Navigate to a URL:
{ "url": "https://example.com" }`

export default {
	type: "function",
	function: {
		name: "browser_navigate",
		description: BROWSER_NAVIGATE_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				url: {
					type: "string",
					description: "The URL to navigate to. Must include protocol (e.g., https://example.com).",
				},
			},
			required: ["url"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool

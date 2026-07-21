import type OpenAI from "openai"

const BROWSER_TYPE_DESCRIPTION = `Request to type text into a browser element using a CSS selector. Use this to fill in form fields, search bars, text areas, and other input elements.

Parameters:
- selector: (required) The CSS selector for the input element (e.g., "#search-input", "input[name='email']").
- text: (required) The text to type into the element.

Examples:
Type into a search bar:
{ "selector": "#search-input", "text": "hello world" }

Fill an email input:
{ "selector": "input[name='email']", "text": "user@example.com" }`

export default {
	type: "function",
	function: {
		name: "browser_type",
		description: BROWSER_TYPE_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				selector: {
					type: "string",
					description: "The CSS selector for the input element (e.g., '#search-input').",
				},
				text: {
					type: "string",
					description: "The text to type into the element.",
				},
			},
			required: ["selector", "text"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool

import type OpenAI from "openai"

const BROWSER_EVALUATE_SCRIPT_DESCRIPTION = `Request to execute JavaScript code in the browser page context. Use this to read page data, manipulate the DOM, or extract information that is not available through other browser tools.

Parameters:
- script: (required) The JavaScript code to execute in the browser page context.

Examples:
Get the page title:
{ "script": "document.title" }

Get all links on the page:
{ "script": "Array.from(document.querySelectorAll('a')).map(a => ({ href: a.href, text: a.textContent.trim() }))" }

Scroll to bottom:
{ "script": "window.scrollTo(0, document.body.scrollHeight)" }`

export default {
	type: "function",
	function: {
		name: "browser_evaluate_script",
		description: BROWSER_EVALUATE_SCRIPT_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				script: {
					type: "string",
					description: "The JavaScript code to execute in the browser page context.",
				},
			},
			required: ["script"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool

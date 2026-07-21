import type OpenAI from "openai"

const BROWSER_CLICK_DESCRIPTION = `Request to click a browser element using a CSS selector. Use this to interact with buttons, links, inputs, and other clickable elements in the browser.

Parameters:
- selector: (required) The CSS selector for the element to click (e.g., "#submit-button", ".btn-primary", "button[type='submit']").

Examples:
Click a button by ID:
{ "selector": "#submit-button" }

Click a link by text:
{ "selector": "a.login-link" }`

export default {
	type: "function",
	function: {
		name: "browser_click",
		description: BROWSER_CLICK_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				selector: {
					type: "string",
					description: "The CSS selector for the element to click (e.g., '#submit-button', '.btn-primary').",
				},
			},
			required: ["selector"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool

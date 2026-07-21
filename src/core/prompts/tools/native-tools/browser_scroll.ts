import type OpenAI from "openai"

const BROWSER_SCROLL_DESCRIPTION = `Request to scroll the browser page in a given direction. Use this to reveal content that is outside the current viewport.

Parameters:
- direction: (required) The direction to scroll. Must be one of: "up", "down", "left", "right".
- amount: (optional) The number of pixels to scroll. Defaults to 300px if not specified.

Examples:
Scroll down by default amount:
{ "direction": "down" }

Scroll up by 500px:
{ "direction": "up", "amount": 500 }

Scroll right by 200px:
{ "direction": "right", "amount": 200 }`

export default {
	type: "function",
	function: {
		name: "browser_scroll",
		description: BROWSER_SCROLL_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				direction: {
					type: "string",
					description: "The direction to scroll. Must be one of: 'up', 'down', 'left', 'right'.",
					enum: ["up", "down", "left", "right"],
				},
				amount: {
					type: "number",
					description: "The number of pixels to scroll (default: 300).",
				},
			},
			required: ["direction"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool

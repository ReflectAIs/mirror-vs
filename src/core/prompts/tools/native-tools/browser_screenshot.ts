import type OpenAI from "openai"

const BROWSER_SCREENSHOT_DESCRIPTION = `Request to take a screenshot of the current browser page. The screenshot is sent as a base64-encoded image to the vision model for visual understanding. Use this to inspect the current state of the page visually.

Parameters:
(no parameters required)

Examples:
Take a screenshot:
{}`

export default {
	type: "function",
	function: {
		name: "browser_screenshot",
		description: BROWSER_SCREENSHOT_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {},
			required: [],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool

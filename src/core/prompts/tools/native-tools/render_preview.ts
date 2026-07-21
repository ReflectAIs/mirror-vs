import type OpenAI from "openai"

const RENDER_PREVIEW_DESCRIPTION = `Request to render a web page preview in the browser. This navigates to the given URL, captures the visual state, and reports any layout changes since the last render. The screenshot is sent to the vision model for visual analysis.

Parameters:
- url: (required) The URL to render (e.g., "https://example.com" or "http://localhost:3000").
- width: (optional) Viewport width in pixels (default: 1280).
- height: (optional) Viewport height in pixels (default: 800).

Examples:
Render a URL with default viewport:
{ "url": "https://example.com" }

Render with custom viewport:
{ "url": "https://example.com", "width": 1440, "height": 900 }`

export default {
	type: "function",
	function: {
		name: "render_preview",
		description: RENDER_PREVIEW_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				url: {
					type: "string",
					description: "The URL to render (e.g., 'https://example.com').",
				},
				width: {
					type: "number",
					description: "Viewport width in pixels (default: 1280).",
				},
				height: {
					type: "number",
					description: "Viewport height in pixels (default: 800).",
				},
			},
			required: ["url"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool

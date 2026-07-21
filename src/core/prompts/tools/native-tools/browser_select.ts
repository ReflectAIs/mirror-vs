import type OpenAI from "openai"

const BROWSER_SELECT_DESCRIPTION = `Request to select an option from a <select> dropdown element in the browser. Use this to choose an option in dropdown menus, combo boxes, or select lists.

Parameters:
- selector: (required) The CSS selector for the <select> element (e.g., "#country-select", "select[name='category']").
- value: (required) The option value or visible label text to select.

Examples:
Select by option value:
{ "selector": "#country-select", "value": "US" }

Select by visible text:
{ "selector": "select[name='category']", "value": "Technology" }`

export default {
	type: "function",
	function: {
		name: "browser_select",
		description: BROWSER_SELECT_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				selector: {
					type: "string",
					description: "The CSS selector for the <select> element (e.g., '#country-select').",
				},
				value: {
					type: "string",
					description: "The option value or visible label text to select.",
				},
			},
			required: ["selector", "value"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool

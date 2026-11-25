import type OpenAI from "openai"

const DEVICE_ACTION_DESCRIPTION = `Control the user's device screen, mouse, keyboard, and desktop applications across macOS, Windows, and Linux.

Actions:
- "screenshot": Capture the current screen and return it as an image with screen dimensions. Always call this first before clicking.
- "click": Click at (x, y). Optional button ("left" | "right" | "middle", default "left") and clicks (1 | 2, default 1).
- "move": Move the mouse cursor to (x, y).
- "drag": Drag from (x, y) to (x2, y2).
- "type": Type text string at the current focus.
- "hotkey": Press a key combination (e.g. ["cmd", "c"], ["ctrl", "v"], ["enter"]). Dangerous OS-level shortcuts (e.g. cmd+q, alt+f4, ctrl+alt+del) are blocked.
- "scroll": Scroll by (dx, dy) pixels, optionally at (x, y).
- "launch_app": Launch or focus a desktop application by name (e.g. "Safari", "Terminal", "Finder").
- "run_script": Execute a non-intrusive background OS automation script (AppleScript on macOS, PowerShell on Windows, Python/Bash) without stealing the user's mouse or keyboard focus.
- "wait": Pause for duration_ms milliseconds (max 30000).`

export default {
	type: "function",
	function: {
		name: "device_action",
		description: DEVICE_ACTION_DESCRIPTION,
		strict: false,
		parameters: {
			type: "object",
			properties: {
				action: {
					type: "string",
					enum: [
						"screenshot",
						"click",
						"move",
						"drag",
						"type",
						"hotkey",
						"scroll",
						"launch_app",
						"run_script",
						"wait",
					],
					description: "The device control action to perform.",
				},
				mode: {
					type: "string",
					enum: ["live", "background"],
					description:
						"Execution mode: 'live' for visible foreground cursor/keyboard control, 'background' for non-intrusive automation without stealing focus.",
				},
				x: {
					type: "number",
					description: "X pixel coordinate on screen (for click, move, drag start, or optional scroll).",
				},
				y: {
					type: "number",
					description: "Y pixel coordinate on screen (for click, move, drag start, or optional scroll).",
				},
				x2: {
					type: "number",
					description: "Target X pixel coordinate (for drag).",
				},
				y2: {
					type: "number",
					description: "Target Y pixel coordinate (for drag).",
				},
				button: {
					type: "string",
					enum: ["left", "right", "middle"],
					description: "Mouse button for click (default: left).",
				},
				clicks: {
					type: "number",
					enum: [1, 2],
					description: "Number of clicks (1 for single, 2 for double; default: 1).",
				},
				text: {
					type: "string",
					description: "Text to type (for action: type).",
				},
				keys: {
					type: "array",
					items: { type: "string" },
					description: 'Key combination to press (for action: hotkey), e.g. ["cmd", "c"].',
				},
				dx: {
					type: "number",
					description: "Horizontal scroll delta (for action: scroll).",
				},
				dy: {
					type: "number",
					description:
						"Vertical scroll delta (for action: scroll; negative scrolls down, positive scrolls up).",
				},
				app_name: {
					type: "string",
					description: "Application name to launch or focus (for action: launch_app).",
				},
				script: {
					type: "string",
					description: "Automation script source to run in background (for action: run_script).",
				},
				language: {
					type: "string",
					enum: ["applescript", "powershell", "bash", "python"],
					description:
						"Script language for run_script (default: applescript on macOS, powershell on Windows, bash on Linux).",
				},
				duration_ms: {
					type: "number",
					description: "Milliseconds to wait (for action: wait, max 30000).",
				},
			},
			required: ["action"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool

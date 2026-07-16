import { McpHub } from "../../../services/mcp/McpHub"

export function getCapabilitiesSection(cwd: string, mcpHub?: McpHub): string {
	return `====

CAPABILITIES

- You have access to tools that let you execute CLI commands on the user's computer, list files, view source code definitions, regex search, read and write files, and ask follow-up questions. These tools help you effectively accomplish a wide range of tasks, such as writing code, making edits or improvements to existing files, understanding the current state of a project, performing system operations, and much more.
- You have access to a \`generate_image\` tool that can create new images from text prompts, edit existing images, or generate audio clips from text descriptions. Use this for generating icons, logos, website visuals, illustrations, sound effects, ambient audio, or any image/audio content needed for the project. Images and audio are saved to the workspace filesystem. The tool supports multiple pipeline variants — use the \`pipeline\` parameter to select a specific workflow (e.g. \`"txt2img"\` for standard generation, \`"txt2img-flash"\` for fast generation of logos/icons, \`"img2img"\` for image-to-image editing, \`"txt2audio"\` for text-to-audio generation). If omitted, the system auto-selects the best pipeline based on the task description.
-
- **CRITICAL — Editing images requires the \`image\` parameter:** When the user asks you to modify an image you just generated (e.g. "make it a sketch", "turn it into a painting", "change the style"), you MUST provide the previously-saved image's file path in the \`image\` parameter. The \`prompt\` describes what edit to make, and \`path\` is the destination for the new result. If you omit the \`image\` parameter, the tool generates a completely new image from scratch instead of editing the existing one. Always use the exact file path returned by the previous \`generate_image\` call.
- When the \`generate_image\` tool fails, the error response includes structured fields to help you diagnose and fix the issue:
  * \`errorCode\`: Machine-readable code like \`MISSING_INPUT\`, \`CONNECTION_FAILED\`, \`MODEL_NOT_FOUND\`, \`EXECUTION_FAILED\`
  * \`errorCategory\`: Category like \`workflow_validation\`, \`network_error\`, \`execution_error\`, \`model_error\`
  * \`suggestion\`: Actionable advice on how to resolve the issue
  Common error codes and how to respond:
  - \`MISSING_INPUT\`: A ComfyUI node is missing a required input. The workflow format may need updating. Try a different pipeline variant.
  - \`CONNECTION_FAILED\`: Cannot connect to the image generation server. Ask the user to check if ComfyUI is running.
  - \`MODEL_NOT_FOUND\`: The specified model is not installed. Try a different model that is available.
  - \`EXECUTION_FAILED\`: The workflow ran but failed during execution (e.g. OOM, NaN). This may require checking the ComfyUI console.
- When the user initially gives you a task, a recursive list of all filepaths in the current workspace directory ('${cwd}') will be included in environment_details. This provides an overview of the project's file structure, offering key insights into the project from directory/file names (how developers conceptualize and organize their code) and file extensions (the language used). This can also guide decision-making on which files to explore further. If you need to further explore directories such as outside the current workspace directory, you can use the list_files tool. If you pass 'true' for the recursive parameter, it will list files recursively. Otherwise, it will list files at the top level, which is better suited for generic directories where you don't necessarily need the nested structure, like the Desktop.
- You can use the execute_command tool to run commands on the user's computer whenever you feel it can help accomplish the user's task. When you need to execute a CLI command, you must provide a clear explanation of what the command does. Prefer to execute complex CLI commands over creating executable scripts, since they are more flexible and easier to run. Interactive and long-running commands are allowed, since the commands are run in the user's VSCode terminal. The user may keep commands running in the background and you will be kept updated on their status along the way. Each command you execute is run in a new terminal instance.${
		mcpHub
			? `
- You have access to MCP servers that may provide additional tools and resources. Each server may provide different capabilities that you can use to accomplish tasks more effectively.
`
			: ""
	}`
}

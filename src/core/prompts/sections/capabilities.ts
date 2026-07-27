import { McpHub } from "../../../services/mcp/McpHub"

export function getCapabilitiesSection(cwd: string, mcpHub?: McpHub): string {
	return `====

CAPABILITIES

- Tools for CLI commands, file listing, regex search, read/write files, and follow-up questions.
- \`generate_image\`: Create/edit images or generate audio. Use \`pipeline\` param for variant (txt2img, txt2img-flash, img2img, txt2audio). To edit an existing image, pass its file path as \`image\`.
- \`environment_details\` provides workspace context at '${cwd}'. Use \`get_workspace_file_tree\` for full tree refresh, \`get_workspace_pulse\` for project health, and \`get_git_status\` for detailed git status when needed.
- Commands run in the user's VSCode terminal — prefer complex CLI commands over scripts.${
		mcpHub
			? `
- You have access to MCP servers that may provide additional tools and resources.
`
			: ""
	}`
}

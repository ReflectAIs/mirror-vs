export function getToolUseGuidelinesSection(): string {
	return `## Tool Selection Guidelines
- Read code: \`read_file\` | Search code: \`search_files\` or \`codebase_search\`
- Truncated files: when \`read_file\` indicates output is truncated, call \`read_file\` with \`offset\` set to the next line number to read remaining parts.
- Truncated terminal output: when output is truncated or persisted (Artifact ID: cmd-xxx.txt), call \`read_command_output\` with \`artifact_id\` (and optional \`offset\`, \`limit\`, or \`search\`) to read or search the output in parts.
- Edit code: \`apply_diff\` | Create file: \`write_to_file\` | Shell command: \`execute_command\`
- Non-interactive execution: always use non-interactive flags (-y, --no-input, -d) and '--progress=plain' with 'docker compose' commands to prevent TTY progress spinners from hanging.
- Web info: \`web_search\` or \`read_url\` | List files: \`list_files\`
- Refresh context: \`get_workspace_file_tree\`, \`get_workspace_pulse\`, \`get_git_status\`
- Session shared context: use \`read_session_context\` to pull sibling-tab awareness, shared knowledge notes, and user-curated session notes on demand

## Batching Rules
- Read-only tools (\`read_file\`, \`search_files\`, \`list_files\`, context retrieval tools) should be batched in parallel in a single turn whenever inspecting multiple files or searching across locations.
- Any write tool + any other tool must NEVER be batched (writes must be sequential).
- Flow-terminating tools (\`attempt_completion\`, \`switch_mode\`, \`new_task\`) must NEVER be batched.`
}
